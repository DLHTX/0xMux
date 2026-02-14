use crate::error::AppError;
use crate::models::ai::{
    AiCatalogResponse, AiProvidersStatus, AiStatusResponse, AiSyncRequest, AiSyncResponse,
    AiUninstallRequest, AiUninstallResponse, McpCatalogItem, ProviderAvailability,
    ProviderSyncState, SkillCatalogItem, SyncAction, SyncSummary, UninstallSummary,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use toml::Value as TomlValue;

const PROVIDERS: &[&str] = &["claude", "codex"];
const SYNC_TYPES: &[&str] = &["skills", "mcp"];

#[derive(Clone, Debug)]
struct SkillSource {
    id: String,
    name: String,
    source_path: PathBuf,
    source_display: String,
}

#[derive(Clone, Debug, Default)]
struct SkillFrontmatter {
    name: Option<String>,
    description: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
struct McpCommand {
    command: String,
    #[serde(default)]
    args: Vec<String>,
    #[serde(default)]
    env: BTreeMap<String, String>,
}

#[derive(Clone, Debug)]
struct McpSource {
    id: String,
    name: String,
    command: McpCommand,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct McpRegistryDoc {
    #[serde(default)]
    mcp: Vec<McpRegistryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct McpRegistryEntry {
    id: String,
    #[serde(default)]
    name: Option<String>,
    command: String,
    #[serde(default)]
    args: Vec<String>,
    #[serde(default)]
    env: BTreeMap<String, String>,
}

pub fn get_status() -> Result<AiStatusResponse, AppError> {
    let claude = detect_provider("claude");
    let codex = detect_provider("codex");

    Ok(AiStatusResponse {
        show_plugin_button: claude.installed || codex.installed,
        providers: AiProvidersStatus { claude, codex },
    })
}

pub fn get_catalog() -> Result<AiCatalogResponse, AppError> {
    let mux_home = mux_home()?;
    let codex_home = codex_home();

    let skills = build_skill_catalog(&mux_home, &codex_home)?;
    let mcp = build_mcp_catalog(&mux_home, &codex_home)?;

    Ok(AiCatalogResponse { skills, mcp })
}

pub fn sync(request: AiSyncRequest) -> Result<AiSyncResponse, AppError> {
    let status = get_status()?;
    let mux_home = mux_home()?;
    let codex_home = codex_home();

    let providers = normalize_providers(&request, &status)?;
    let sync_types = normalize_types(&request)?;
    let id_filter = build_id_filter(&request);

    let mut actions: Vec<SyncAction> = Vec::new();

    if id_filter.is_none() {
        seed_global_sources_if_empty(
            &mux_home,
            &codex_home,
            &sync_types,
            request.dry_run,
            &mut actions,
        )?;
    }

    if sync_types.contains("skills") {
        sync_skills(
            &mux_home,
            &codex_home,
            &providers,
            &status,
            id_filter.as_ref(),
            request.dry_run,
            &mut actions,
        )?;
    }

    if sync_types.contains("mcp") {
        sync_mcp(
            &mux_home,
            &codex_home,
            &providers,
            &status,
            id_filter.as_ref(),
            request.dry_run,
            &mut actions,
        )?;
    }

    let summary = summarize_actions(&actions);
    Ok(AiSyncResponse {
        dry_run: request.dry_run,
        actions,
        summary,
    })
}

pub fn uninstall(request: AiUninstallRequest) -> Result<AiUninstallResponse, AppError> {
    let status = get_status()?;
    let mux_home = mux_home()?;
    let codex_home = codex_home();
    let providers = normalize_uninstall_providers(&request, &status, request.remove_source)?;
    let uninstall_types = normalize_uninstall_types(&request)?;
    let id_filter = build_uninstall_id_filter(&request);
    let mut actions: Vec<SyncAction> = Vec::new();

    if uninstall_types.contains("skills") {
        uninstall_skills(
            &mux_home,
            &codex_home,
            &providers,
            &status,
            id_filter.as_ref(),
            &mut actions,
        )?;
    }

    if uninstall_types.contains("mcp") {
        uninstall_mcp(
            &mux_home,
            &codex_home,
            &providers,
            &status,
            id_filter.as_ref(),
            &mut actions,
        )?;
    }

    if request.remove_source {
        if uninstall_types.contains("skills") {
            uninstall_source_skills(&mux_home, id_filter.as_ref(), &mut actions)?;
        }
        if uninstall_types.contains("mcp") {
            uninstall_source_mcp(&mux_home, id_filter.as_ref(), &mut actions)?;
        }
    }

    let summary = summarize_uninstall_actions(&actions);
    Ok(AiUninstallResponse { actions, summary })
}

fn normalize_providers(
    request: &AiSyncRequest,
    status: &AiStatusResponse,
) -> Result<Vec<String>, AppError> {
    if request.providers.is_empty() {
        let mut installed = Vec::new();
        if status.providers.claude.installed {
            installed.push("claude".to_string());
        }
        if status.providers.codex.installed {
            installed.push("codex".to_string());
        }
        if installed.is_empty() {
            return Err(AppError::BadRequest(
                "未检测到可用的 AI Provider（Claude/Codex）".to_string(),
            ));
        }
        return Ok(installed);
    }

    let mut providers = request.providers.clone();
    providers.sort();
    providers.dedup();

    for provider in &providers {
        if !PROVIDERS.contains(&provider.as_str()) {
            return Err(AppError::BadRequest(format!(
                "不支持的 provider: {}（仅支持 claude/codex）",
                provider
            )));
        }
    }

    Ok(providers)
}

fn normalize_types(request: &AiSyncRequest) -> Result<BTreeSet<String>, AppError> {
    let mut types: Vec<String> = if request.types.is_empty() {
        SYNC_TYPES.iter().map(|s| s.to_string()).collect()
    } else {
        request.types.clone()
    };

    types.sort();
    types.dedup();

    for ty in &types {
        if !SYNC_TYPES.contains(&ty.as_str()) {
            return Err(AppError::BadRequest(format!(
                "不支持的同步类型: {}（仅支持 skills/mcp）",
                ty
            )));
        }
    }

    Ok(types.into_iter().collect())
}

fn build_id_filter(request: &AiSyncRequest) -> Option<BTreeSet<String>> {
    if request.ids.is_empty() {
        return None;
    }

    let mut ids = BTreeSet::new();
    for id in &request.ids {
        ids.insert(id.trim().to_string());
    }
    Some(ids)
}

fn normalize_uninstall_providers(
    request: &AiUninstallRequest,
    status: &AiStatusResponse,
    allow_empty: bool,
) -> Result<Vec<String>, AppError> {
    if request.providers.is_empty() {
        let mut installed = Vec::new();
        if status.providers.claude.installed {
            installed.push("claude".to_string());
        }
        if status.providers.codex.installed {
            installed.push("codex".to_string());
        }
        if installed.is_empty() {
            if allow_empty {
                return Ok(Vec::new());
            }
            return Err(AppError::BadRequest(
                "未检测到可用的 AI Provider（Claude/Codex）".to_string(),
            ));
        }
        return Ok(installed);
    }

    let mut providers = request.providers.clone();
    providers.sort();
    providers.dedup();

    for provider in &providers {
        if !PROVIDERS.contains(&provider.as_str()) {
            return Err(AppError::BadRequest(format!(
                "不支持的 provider: {}（仅支持 claude/codex）",
                provider
            )));
        }
    }

    Ok(providers)
}

fn normalize_uninstall_types(request: &AiUninstallRequest) -> Result<BTreeSet<String>, AppError> {
    let mut types: Vec<String> = if request.types.is_empty() {
        SYNC_TYPES.iter().map(|s| s.to_string()).collect()
    } else {
        request.types.clone()
    };

    types.sort();
    types.dedup();

    for ty in &types {
        if !SYNC_TYPES.contains(&ty.as_str()) {
            return Err(AppError::BadRequest(format!(
                "不支持的卸载类型: {}（仅支持 skills/mcp）",
                ty
            )));
        }
    }

    Ok(types.into_iter().collect())
}

fn build_uninstall_id_filter(request: &AiUninstallRequest) -> Option<BTreeSet<String>> {
    if request.ids.is_empty() {
        return None;
    }

    let mut ids = BTreeSet::new();
    for id in &request.ids {
        ids.insert(id.trim().to_string());
    }
    Some(ids)
}

fn sync_skills(
    mux_home: &Path,
    codex_home: &Path,
    providers: &[String],
    status: &AiStatusResponse,
    id_filter: Option<&BTreeSet<String>>,
    dry_run: bool,
    actions: &mut Vec<SyncAction>,
) -> Result<(), AppError> {
    let skills = discover_skills(mux_home)?;
    let claude_home = claude_home()?;

    for skill in skills {
        if let Some(filter) = id_filter
            && !filter.contains(&skill.id)
        {
            continue;
        }

        for provider in providers {
            if !is_provider_installed(status, provider) {
                actions.push(SyncAction {
                    kind: "skills".to_string(),
                    id: skill.id.clone(),
                    name: skill.name.clone(),
                    provider: provider.clone(),
                    status: "skipped".to_string(),
                    source: Some(skill.source_display.clone()),
                    target: None,
                    message: Some("Provider 未安装，跳过同步".to_string()),
                });
                continue;
            }

            let target_path = if provider == "claude" {
                claude_skill_target(&claude_home, &skill.id)
            } else {
                codex_skill_target(codex_home, &skill.id)
            };
            let target_display = target_path.display().to_string();
            let source_bytes = match if provider == "claude" {
                render_claude_skill_bytes(&skill)
            } else {
                render_codex_skill_bytes(&skill)
            } {
                Ok(bytes) => bytes,
                Err(err) => {
                    actions.push(SyncAction {
                        kind: "skills".to_string(),
                        id: skill.id.clone(),
                        name: skill.name.clone(),
                        provider: provider.clone(),
                        status: "failed".to_string(),
                        source: Some(skill.source_display.clone()),
                        target: Some(target_display),
                        message: Some(app_error_message(&err)),
                    });
                    continue;
                }
            };

            let up_to_date = fs::read(&target_path)
                .map(|existing| existing == source_bytes)
                .unwrap_or(false);

            if up_to_date {
                actions.push(SyncAction {
                    kind: "skills".to_string(),
                    id: skill.id.clone(),
                    name: skill.name.clone(),
                    provider: provider.clone(),
                    status: "up_to_date".to_string(),
                    source: Some(skill.source_display.clone()),
                    target: Some(target_display),
                    message: None,
                });
                continue;
            }

            if dry_run {
                actions.push(SyncAction {
                    kind: "skills".to_string(),
                    id: skill.id.clone(),
                    name: skill.name.clone(),
                    provider: provider.clone(),
                    status: "planned".to_string(),
                    source: Some(skill.source_display.clone()),
                    target: Some(target_display),
                    message: Some("目标文件将被创建或更新".to_string()),
                });
                continue;
            }

            if let Some(parent) = target_path.parent()
                && let Err(err) = fs::create_dir_all(parent)
            {
                actions.push(SyncAction {
                    kind: "skills".to_string(),
                    id: skill.id.clone(),
                    name: skill.name.clone(),
                    provider: provider.clone(),
                    status: "failed".to_string(),
                    source: Some(skill.source_display.clone()),
                    target: Some(target_display),
                    message: Some(format!("创建目标目录失败: {}", err)),
                });
                continue;
            }

            match fs::write(&target_path, &source_bytes) {
                Ok(_) => actions.push(SyncAction {
                    kind: "skills".to_string(),
                    id: skill.id.clone(),
                    name: skill.name.clone(),
                    provider: provider.clone(),
                    status: "updated".to_string(),
                    source: Some(skill.source_display.clone()),
                    target: Some(target_display),
                    message: None,
                }),
                Err(err) => actions.push(SyncAction {
                    kind: "skills".to_string(),
                    id: skill.id.clone(),
                    name: skill.name.clone(),
                    provider: provider.clone(),
                    status: "failed".to_string(),
                    source: Some(skill.source_display.clone()),
                    target: Some(target_display),
                    message: Some(format!("写入目标文件失败: {}", err)),
                }),
            }
        }
    }

    Ok(())
}

fn sync_mcp(
    mux_home: &Path,
    codex_home: &Path,
    providers: &[String],
    status: &AiStatusResponse,
    id_filter: Option<&BTreeSet<String>>,
    dry_run: bool,
    actions: &mut Vec<SyncAction>,
) -> Result<(), AppError> {
    let (registry, registry_path) = load_mcp_registry(mux_home)?;
    let source_display = display_path(&registry_path);

    if registry.is_empty() {
        return Ok(());
    }

    let claude_config = claude_mcp_path()?;
    let codex_config = codex_config_path(codex_home);

    let mut claude_existing = read_claude_mcp_map(&claude_config)?;
    let mut codex_existing = read_codex_mcp_map(&codex_config)?;

    let mut claude_updates: BTreeMap<String, McpCommand> = BTreeMap::new();
    let mut codex_updates: BTreeMap<String, McpCommand> = BTreeMap::new();

    for item in registry {
        if let Some(filter) = id_filter
            && !filter.contains(&item.id)
        {
            continue;
        }

        for provider in providers {
            if !is_provider_installed(status, provider) {
                actions.push(SyncAction {
                    kind: "mcp".to_string(),
                    id: item.id.clone(),
                    name: item.name.clone(),
                    provider: provider.clone(),
                    status: "skipped".to_string(),
                    source: Some(source_display.clone()),
                    target: None,
                    message: Some("Provider 未安装，跳过同步".to_string()),
                });
                continue;
            }

            let (target_display, existing) = if provider == "claude" {
                (
                    claude_config.display().to_string(),
                    claude_existing.get(&item.id).cloned(),
                )
            } else {
                (
                    codex_config.display().to_string(),
                    codex_existing.get(&item.id).cloned(),
                )
            };

            if existing.as_ref() == Some(&item.command) {
                actions.push(SyncAction {
                    kind: "mcp".to_string(),
                    id: item.id.clone(),
                    name: item.name.clone(),
                    provider: provider.clone(),
                    status: "up_to_date".to_string(),
                    source: Some(source_display.clone()),
                    target: Some(target_display),
                    message: None,
                });
                continue;
            }

            if dry_run {
                actions.push(SyncAction {
                    kind: "mcp".to_string(),
                    id: item.id.clone(),
                    name: item.name.clone(),
                    provider: provider.clone(),
                    status: "planned".to_string(),
                    source: Some(source_display.clone()),
                    target: Some(target_display),
                    message: Some("MCP 配置将被创建或更新".to_string()),
                });
                continue;
            }

            if provider == "claude" {
                claude_updates.insert(item.id.clone(), item.command.clone());
                claude_existing.insert(item.id.clone(), item.command.clone());
            } else {
                codex_updates.insert(item.id.clone(), item.command.clone());
                codex_existing.insert(item.id.clone(), item.command.clone());
            }

            actions.push(SyncAction {
                kind: "mcp".to_string(),
                id: item.id.clone(),
                name: item.name.clone(),
                provider: provider.clone(),
                status: "updated".to_string(),
                source: Some(source_display.clone()),
                target: Some(target_display),
                message: None,
            });
        }
    }

    if !dry_run {
        if let Err(err) = write_claude_mcp_map(&claude_config, &claude_updates) {
            mark_provider_failures(
                actions,
                "mcp",
                "claude",
                &claude_updates,
                &app_error_message(&err),
            );
        }

        if let Err(err) = write_codex_mcp_map(&codex_config, &codex_updates) {
            mark_provider_failures(
                actions,
                "mcp",
                "codex",
                &codex_updates,
                &app_error_message(&err),
            );
        }
    }

    Ok(())
}

fn uninstall_skills(
    mux_home: &Path,
    codex_home: &Path,
    providers: &[String],
    status: &AiStatusResponse,
    id_filter: Option<&BTreeSet<String>>,
    actions: &mut Vec<SyncAction>,
) -> Result<(), AppError> {
    let skills = discover_skills(mux_home)?;
    let claude_home = claude_home()?;

    for skill in skills {
        if let Some(filter) = id_filter
            && !filter.contains(&skill.id)
        {
            continue;
        }

        for provider in providers {
            if !is_provider_installed(status, provider) {
                actions.push(SyncAction {
                    kind: "skills".to_string(),
                    id: skill.id.clone(),
                    name: skill.name.clone(),
                    provider: provider.clone(),
                    status: "skipped".to_string(),
                    source: Some(skill.source_display.clone()),
                    target: None,
                    message: Some("Provider 未安装，跳过卸载".to_string()),
                });
                continue;
            }

            let primary_target = if provider == "claude" {
                claude_skill_target(&claude_home, &skill.id)
            } else {
                codex_skill_target(codex_home, &skill.id)
            };
            if !primary_target.exists() {
                actions.push(SyncAction {
                    kind: "skills".to_string(),
                    id: skill.id.clone(),
                    name: skill.name.clone(),
                    provider: provider.clone(),
                    status: "not_found".to_string(),
                    source: Some(skill.source_display.clone()),
                    target: Some(primary_target.display().to_string()),
                    message: Some("目标 skill 不存在".to_string()),
                });
                continue;
            }

            let remove_result = if provider == "claude" {
                fs::remove_file(&primary_target)
            } else {
                fs::remove_dir_all(primary_target.parent().unwrap_or(&primary_target))
            };

            if let Err(err) = remove_result {
                actions.push(SyncAction {
                    kind: "skills".to_string(),
                    id: skill.id.clone(),
                    name: skill.name.clone(),
                    provider: provider.clone(),
                    status: "failed".to_string(),
                    source: Some(skill.source_display.clone()),
                    target: Some(primary_target.display().to_string()),
                    message: Some(format!("删除目标失败: {}", err)),
                });
            } else {
                actions.push(SyncAction {
                    kind: "skills".to_string(),
                    id: skill.id.clone(),
                    name: skill.name.clone(),
                    provider: provider.clone(),
                    status: "removed".to_string(),
                    source: Some(skill.source_display.clone()),
                    target: Some(primary_target.display().to_string()),
                    message: None,
                });
            }
        }
    }

    Ok(())
}

fn uninstall_mcp(
    mux_home: &Path,
    codex_home: &Path,
    providers: &[String],
    status: &AiStatusResponse,
    id_filter: Option<&BTreeSet<String>>,
    actions: &mut Vec<SyncAction>,
) -> Result<(), AppError> {
    let (registry, registry_path) = load_mcp_registry(mux_home)?;
    let source_display = display_path(&registry_path);
    if registry.is_empty() {
        return Ok(());
    }

    let claude_config = claude_mcp_path()?;
    let codex_config = codex_config_path(codex_home);

    let mut claude_map = read_claude_mcp_map(&claude_config)?;
    let mut codex_map = read_codex_mcp_map(&codex_config)?;
    let mut claude_changed = false;
    let mut codex_changed = false;

    for item in registry {
        if let Some(filter) = id_filter
            && !filter.contains(&item.id)
        {
            continue;
        }

        for provider in providers {
            if !is_provider_installed(status, provider) {
                actions.push(SyncAction {
                    kind: "mcp".to_string(),
                    id: item.id.clone(),
                    name: item.name.clone(),
                    provider: provider.clone(),
                    status: "skipped".to_string(),
                    source: Some(source_display.clone()),
                    target: None,
                    message: Some("Provider 未安装，跳过卸载".to_string()),
                });
                continue;
            }

            if provider == "claude" {
                if claude_map.remove(&item.id).is_some() {
                    claude_changed = true;
                    actions.push(SyncAction {
                        kind: "mcp".to_string(),
                        id: item.id.clone(),
                        name: item.name.clone(),
                        provider: provider.clone(),
                        status: "removed".to_string(),
                        source: Some(source_display.clone()),
                        target: Some(claude_config.display().to_string()),
                        message: None,
                    });
                } else {
                    actions.push(SyncAction {
                        kind: "mcp".to_string(),
                        id: item.id.clone(),
                        name: item.name.clone(),
                        provider: provider.clone(),
                        status: "not_found".to_string(),
                        source: Some(source_display.clone()),
                        target: Some(claude_config.display().to_string()),
                        message: Some("MCP 配置不存在".to_string()),
                    });
                }
            } else if codex_map.remove(&item.id).is_some() {
                codex_changed = true;
                actions.push(SyncAction {
                    kind: "mcp".to_string(),
                    id: item.id.clone(),
                    name: item.name.clone(),
                    provider: provider.clone(),
                    status: "removed".to_string(),
                    source: Some(source_display.clone()),
                    target: Some(codex_config.display().to_string()),
                    message: None,
                });
            } else {
                actions.push(SyncAction {
                    kind: "mcp".to_string(),
                    id: item.id.clone(),
                    name: item.name.clone(),
                    provider: provider.clone(),
                    status: "not_found".to_string(),
                    source: Some(source_display.clone()),
                    target: Some(codex_config.display().to_string()),
                    message: Some("MCP 配置不存在".to_string()),
                });
            }
        }
    }

    if claude_changed && let Err(err) = write_claude_mcp_full(&claude_config, &claude_map) {
        mark_provider_failures_no_filter(actions, "mcp", "claude", &app_error_message(&err));
    }
    if codex_changed && let Err(err) = write_codex_mcp_full(&codex_config, &codex_map) {
        mark_provider_failures_no_filter(actions, "mcp", "codex", &app_error_message(&err));
    }

    Ok(())
}

fn mark_provider_failures(
    actions: &mut [SyncAction],
    kind: &str,
    provider: &str,
    updates: &BTreeMap<String, McpCommand>,
    reason: &str,
) {
    for action in actions {
        if action.kind == kind
            && action.provider == provider
            && action.status == "updated"
            && updates.contains_key(&action.id)
        {
            action.status = "failed".to_string();
            action.message = Some(format!("写入配置失败: {}", reason));
        }
    }
}

fn mark_provider_failures_no_filter(
    actions: &mut [SyncAction],
    kind: &str,
    provider: &str,
    reason: &str,
) {
    for action in actions {
        if action.kind == kind
            && action.provider == provider
            && (action.status == "updated" || action.status == "removed")
        {
            action.status = "failed".to_string();
            action.message = Some(format!("写入配置失败: {}", reason));
        }
    }
}

fn build_skill_catalog(
    mux_home: &Path,
    codex_home: &Path,
) -> Result<Vec<SkillCatalogItem>, AppError> {
    let global_skills = discover_skills(mux_home)?;
    let claude_home = claude_home()?;
    let claude_skills = discover_provider_skills(&claude_skills_root(&claude_home), ".md")?;
    let codex_skills = discover_provider_skills(&codex_home.join("skills"), "/SKILL.md")?;

    let mut global_map = BTreeMap::new();
    for skill in global_skills {
        global_map.insert(skill.id.clone(), skill);
    }
    let mut claude_map = BTreeMap::new();
    for skill in claude_skills {
        claude_map.insert(skill.id.clone(), skill);
    }
    let mut codex_map = BTreeMap::new();
    for skill in codex_skills {
        codex_map.insert(skill.id.clone(), skill);
    }

    let mut ids = BTreeSet::new();
    ids.extend(global_map.keys().cloned());
    ids.extend(claude_map.keys().cloned());
    ids.extend(codex_map.keys().cloned());

    let mut list = Vec::new();
    for id in ids {
        let global = global_map.get(&id);
        let claude_skill = claude_map.get(&id);
        let codex_skill = codex_map.get(&id);

        let name = global
            .map(|s| s.name.clone())
            .or_else(|| claude_skill.map(|s| s.name.clone()))
            .or_else(|| codex_skill.map(|s| s.name.clone()))
            .unwrap_or_else(|| id.clone());
        let source = global
            .map(|s| s.source_display.clone())
            .or_else(|| claude_skill.map(|s| s.source_display.clone()))
            .or_else(|| codex_skill.map(|s| s.source_display.clone()))
            .unwrap_or_else(|| id.clone());

        let claude_exists = claude_skill.is_some();
        let codex_exists = codex_skill.is_some();
        let (claude_in_sync, codex_in_sync) = if let Some(global_skill) = global {
            let claude_expected = render_claude_skill_bytes(global_skill)?;
            let claude_match = claude_skill
                .map(|installed| {
                    fs::read(&installed.source_path)
                        .map(|bytes| bytes == claude_expected)
                        .unwrap_or(false)
                })
                .unwrap_or(false);
            let codex_expected = render_codex_skill_bytes(global_skill)?;
            let codex_match = codex_skill
                .map(|installed| {
                    fs::read(&installed.source_path)
                        .map(|bytes| bytes == codex_expected)
                        .unwrap_or(false)
                })
                .unwrap_or(false);
            (claude_match, codex_match)
        } else {
            (claude_exists, codex_exists)
        };

        list.push(SkillCatalogItem {
            id,
            name,
            source,
            claude: ProviderSyncState {
                exists: claude_exists,
                in_sync: claude_in_sync,
            },
            codex: ProviderSyncState {
                exists: codex_exists,
                in_sync: codex_in_sync,
            },
        });
    }

    Ok(list)
}

fn build_mcp_catalog(mux_home: &Path, codex_home: &Path) -> Result<Vec<McpCatalogItem>, AppError> {
    let (registry, registry_path) = load_mcp_registry(mux_home)?;
    let source_display = display_path(&registry_path);
    let claude_config = claude_mcp_path()?;
    let codex_config = codex_config_path(codex_home);

    let claude_map = read_claude_mcp_map(&claude_config)?;
    let codex_map = read_codex_mcp_map(&codex_config)?;
    let registry_map: BTreeMap<String, McpSource> = registry
        .into_iter()
        .map(|item| (item.id.clone(), item))
        .collect();
    let mut ids = BTreeSet::new();
    ids.extend(registry_map.keys().cloned());
    ids.extend(claude_map.keys().cloned());
    ids.extend(codex_map.keys().cloned());

    let mut list = Vec::new();
    for id in ids {
        let in_registry = registry_map.get(&id);
        let claude_existing = claude_map.get(&id);
        let codex_existing = codex_map.get(&id);
        let default_name = id.clone();
        let (name, command, args, source) = if let Some(item) = in_registry {
            (
                item.name.clone(),
                item.command.command.clone(),
                item.command.args.clone(),
                source_display.clone(),
            )
        } else if let Some(claude_item) = claude_existing {
            (
                default_name.clone(),
                claude_item.command.clone(),
                claude_item.args.clone(),
                display_path(&claude_config),
            )
        } else if let Some(codex_item) = codex_existing {
            (
                default_name.clone(),
                codex_item.command.clone(),
                codex_item.args.clone(),
                display_path(&codex_config),
            )
        } else {
            continue;
        };
        let claude_in_sync = if let Some(item) = in_registry {
            claude_existing == Some(&item.command)
        } else {
            claude_existing.is_some()
        };
        let codex_in_sync = if let Some(item) = in_registry {
            codex_existing == Some(&item.command)
        } else {
            codex_existing.is_some()
        };

        list.push(McpCatalogItem {
            id,
            name,
            command,
            args,
            source,
            claude: ProviderSyncState {
                exists: claude_existing.is_some(),
                in_sync: claude_in_sync,
            },
            codex: ProviderSyncState {
                exists: codex_existing.is_some(),
                in_sync: codex_in_sync,
            },
        });
    }

    Ok(list)
}

fn discover_skills(mux_home: &Path) -> Result<Vec<SkillSource>, AppError> {
    let skills_root = mux_home.join("skills");
    let mut files = Vec::new();
    collect_markdown_files(&skills_root, &mut files)?;

    files.sort();

    let mut skills = Vec::new();
    for path in files {
        let source_display = display_path(&path);
        let id = path
            .strip_prefix(&skills_root)
            .unwrap_or(path.as_path())
            .to_string_lossy()
            .replace('\\', "/")
            .trim_start_matches('/')
            .trim_end_matches(".md")
            .to_string();

        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("skill")
            .to_string();

        skills.push(SkillSource {
            id,
            name,
            source_path: path,
            source_display,
        });
    }

    Ok(skills)
}

fn discover_provider_skills(root: &Path, suffix: &str) -> Result<Vec<SkillSource>, AppError> {
    let mut files = Vec::new();
    collect_markdown_files(root, &mut files)?;
    files.sort();

    let mut out = Vec::new();
    for path in files {
        let source_display = display_path(&path);
        let relative = path
            .strip_prefix(root)
            .unwrap_or(path.as_path())
            .to_string_lossy()
            .replace('\\', "/");
        if relative.starts_with(".system/") {
            continue;
        }
        if suffix == "/SKILL.md" && !relative.ends_with("/SKILL.md") {
            continue;
        }
        if suffix == ".md" && !relative.ends_with(".md") {
            continue;
        }
        let mut id = if suffix == "/SKILL.md" {
            relative.trim_end_matches("/SKILL.md").to_string()
        } else {
            relative.trim_end_matches(suffix).to_string()
        };
        if suffix == "/SKILL.md" {
            id = id.replace("__", "/");
        }
        if id.is_empty() {
            continue;
        }
        let name = parse_skill_frontmatter_name(&path).unwrap_or_else(|| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("skill")
                .to_string()
        });

        out.push(SkillSource {
            id,
            name,
            source_path: path,
            source_display,
        });
    }

    Ok(out)
}

fn discover_claude_seed_skills(claude_home: &Path) -> Result<Vec<SkillSource>, AppError> {
    let root = claude_skills_root(claude_home);
    let mut files = Vec::new();
    collect_markdown_files(&root, &mut files)?;
    files.sort();

    let mut out = Vec::new();
    for path in files {
        let relative = path
            .strip_prefix(&root)
            .unwrap_or(path.as_path())
            .to_string_lossy()
            .replace('\\', "/");
        if relative.starts_with(".system/") {
            continue;
        }

        let id = if relative.ends_with("/SKILL.md") {
            relative.trim_end_matches("/SKILL.md").to_string()
        } else if (relative.starts_with("commands/") || relative.starts_with("agents/"))
            && relative.ends_with(".md")
        {
            relative.trim_end_matches(".md").to_string()
        } else {
            continue;
        };

        if id.is_empty() {
            continue;
        }

        let source_display = display_path(&path);
        let name = parse_skill_frontmatter_name(&path).unwrap_or_else(|| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("skill")
                .to_string()
        });

        out.push(SkillSource {
            id,
            name,
            source_path: path,
            source_display,
        });
    }

    Ok(out)
}

fn parse_skill_frontmatter_name(path: &Path) -> Option<String> {
    let raw = fs::read_to_string(path).ok()?;
    let parsed = parse_skill_frontmatter(raw.trim_start_matches('\u{feff}'));
    parsed.name
}

fn collect_markdown_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), AppError> {
    if !dir.exists() {
        return Ok(());
    }

    let entries = fs::read_dir(dir)
        .map_err(|err| AppError::Internal(format!("读取目录失败（{}）: {}", dir.display(), err)))?;

    for entry in entries {
        let entry = entry.map_err(|err| {
            AppError::Internal(format!("读取目录项失败（{}）: {}", dir.display(), err))
        })?;
        let path = entry.path();

        if path.is_dir() {
            collect_markdown_files(&path, out)?;
            continue;
        }

        let is_md = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("md"))
            .unwrap_or(false);

        if is_md {
            out.push(path);
        }
    }

    Ok(())
}

fn seed_global_sources_if_empty(
    mux_home: &Path,
    codex_home: &Path,
    sync_types: &BTreeSet<String>,
    dry_run: bool,
    actions: &mut Vec<SyncAction>,
) -> Result<(), AppError> {
    if sync_types.contains("skills") {
        seed_global_skills_from_codex_if_empty(mux_home, codex_home, dry_run, actions)?;
    }
    if sync_types.contains("mcp") {
        seed_global_mcp_if_empty(mux_home, codex_home, dry_run, actions)?;
    }
    Ok(())
}

fn seed_global_skills_from_codex_if_empty(
    mux_home: &Path,
    codex_home: &Path,
    dry_run: bool,
    actions: &mut Vec<SyncAction>,
) -> Result<(), AppError> {
    if !discover_skills(mux_home)?.is_empty() {
        return Ok(());
    }

    let codex_skills = discover_provider_skills(&codex_home.join("skills"), "/SKILL.md")?;
    let (skills_to_import, source_provider) = if codex_skills.is_empty() {
        let claude_skills = discover_claude_seed_skills(&claude_home()?)?;
        (claude_skills, "Claude")
    } else {
        (codex_skills, "Codex")
    };
    if skills_to_import.is_empty() {
        return Ok(());
    }

    let skills_root = mux_home.join("skills");
    for skill in skills_to_import {
        let target_path = skills_root.join(format!("{}.md", skill.id));
        let target_display = display_path(&target_path);

        let raw = fs::read_to_string(&skill.source_path).map_err(|err| {
            AppError::Internal(format!(
                "读取 {} skill 失败（{}）: {}",
                source_provider, skill.source_display, err
            ))
        })?;
        let body = if source_provider == "Codex" {
            normalize_imported_codex_skill(&raw)
        } else {
            normalize_imported_claude_skill(&raw)
        };

        if dry_run {
            actions.push(SyncAction {
                kind: "skills".to_string(),
                id: skill.id.clone(),
                name: skill.name.clone(),
                provider: "global".to_string(),
                status: "planned".to_string(),
                source: Some(skill.source_display.clone()),
                target: Some(target_display),
                message: Some(format!("将从 {} 导入到全局源", source_provider)),
            });
            continue;
        }

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|err| AppError::Internal(format!("创建全局 skill 目录失败: {}", err)))?;
        }
        fs::write(&target_path, body)
            .map_err(|err| AppError::Internal(format!("写入全局 skill 失败: {}", err)))?;

        actions.push(SyncAction {
            kind: "skills".to_string(),
            id: skill.id.clone(),
            name: skill.name.clone(),
            provider: "global".to_string(),
            status: "updated".to_string(),
            source: Some(skill.source_display.clone()),
            target: Some(target_display),
            message: Some(format!("已从 {} 导入为全局源", source_provider)),
        });
    }

    Ok(())
}

fn seed_global_mcp_if_empty(
    mux_home: &Path,
    codex_home: &Path,
    dry_run: bool,
    actions: &mut Vec<SyncAction>,
) -> Result<(), AppError> {
    if !load_mcp_registry(mux_home)?.0.is_empty() {
        return Ok(());
    }

    let codex_map = read_codex_mcp_map(&codex_config_path(codex_home))?;
    let claude_map = read_claude_mcp_map(&claude_mcp_path()?)?;
    let mut merged: BTreeMap<String, McpCommand> = codex_map;
    for (id, cmd) in claude_map {
        merged.entry(id).or_insert(cmd);
    }
    if merged.is_empty() {
        return Ok(());
    }

    let path = mux_home.join("mcp").join("registry.toml");
    let target_display = display_path(&path);
    let mut entries = Vec::new();
    for (id, cmd) in &merged {
        entries.push(McpRegistryEntry {
            id: id.clone(),
            name: Some(id.clone()),
            command: cmd.command.clone(),
            args: cmd.args.clone(),
            env: cmd.env.clone(),
        });

        actions.push(SyncAction {
            kind: "mcp".to_string(),
            id: id.clone(),
            name: id.clone(),
            provider: "global".to_string(),
            status: if dry_run { "planned" } else { "updated" }.to_string(),
            source: None,
            target: Some(target_display.clone()),
            message: Some(if dry_run {
                "将从客户端配置导入到全局 MCP".to_string()
            } else {
                "已导入为全局 MCP 源".to_string()
            }),
        });
    }

    if dry_run {
        return Ok(());
    }

    entries.sort_by(|a, b| a.id.cmp(&b.id));
    let doc = McpRegistryDoc { mcp: entries };
    write_mcp_registry_doc(&path, &doc)?;
    Ok(())
}

fn normalize_imported_codex_skill(raw: &str) -> String {
    let normalized = raw.replace("\r\n", "\n");
    let without_bom = normalized.trim_start_matches('\u{feff}');
    let mut body = strip_initial_frontmatter(without_bom)
        .trim_start()
        .to_string();

    if body.starts_with("<!-- Auto-generated by 0xMux sync.")
        && let Some(end) = body.find("-->")
    {
        body = body[end + 3..].trim_start().to_string();
    }

    if !body.ends_with('\n') {
        body.push('\n');
    }

    body
}

fn normalize_imported_claude_skill(raw: &str) -> String {
    let normalized = raw.replace("\r\n", "\n");
    let without_bom = normalized.trim_start_matches('\u{feff}');
    let mut body = without_bom.to_string();
    if !body.ends_with('\n') {
        body.push('\n');
    }
    body
}

fn uninstall_source_skills(
    mux_home: &Path,
    id_filter: Option<&BTreeSet<String>>,
    actions: &mut Vec<SyncAction>,
) -> Result<(), AppError> {
    let skills_root = mux_home.join("skills");
    let discovered = discover_skills(mux_home)?;
    let discovered_map: BTreeMap<String, SkillSource> = discovered
        .into_iter()
        .map(|item| (item.id.clone(), item))
        .collect();

    let ids: BTreeSet<String> = if let Some(filter) = id_filter {
        filter.clone()
    } else {
        discovered_map.keys().cloned().collect()
    };

    for id in ids {
        let source_path = skills_root.join(format!("{}.md", id));
        let name = discovered_map
            .get(&id)
            .map(|item| item.name.clone())
            .unwrap_or_else(|| id.clone());
        let display = display_path(&source_path);

        if !source_path.exists() {
            actions.push(SyncAction {
                kind: "skills".to_string(),
                id: id.clone(),
                name,
                provider: "global".to_string(),
                status: "not_found".to_string(),
                source: Some(display.clone()),
                target: Some(display),
                message: Some("全局 skill 不存在".to_string()),
            });
            continue;
        }

        match fs::remove_file(&source_path) {
            Ok(_) => {
                cleanup_empty_dirs(source_path.parent(), &skills_root);
                actions.push(SyncAction {
                    kind: "skills".to_string(),
                    id: id.clone(),
                    name,
                    provider: "global".to_string(),
                    status: "removed".to_string(),
                    source: Some(display.clone()),
                    target: Some(display),
                    message: None,
                });
            }
            Err(err) => actions.push(SyncAction {
                kind: "skills".to_string(),
                id: id.clone(),
                name,
                provider: "global".to_string(),
                status: "failed".to_string(),
                source: Some(display.clone()),
                target: Some(display),
                message: Some(format!("删除全局 skill 失败: {}", err)),
            }),
        }
    }

    Ok(())
}

fn uninstall_source_mcp(
    mux_home: &Path,
    id_filter: Option<&BTreeSet<String>>,
    actions: &mut Vec<SyncAction>,
) -> Result<(), AppError> {
    let path = mux_home.join("mcp").join("registry.toml");
    let display = display_path(&path);

    if !path.exists() {
        if let Some(filter) = id_filter {
            for id in filter {
                actions.push(SyncAction {
                    kind: "mcp".to_string(),
                    id: id.clone(),
                    name: id.clone(),
                    provider: "global".to_string(),
                    status: "not_found".to_string(),
                    source: Some(display.clone()),
                    target: Some(display.clone()),
                    message: Some("全局 MCP registry 不存在".to_string()),
                });
            }
        }
        return Ok(());
    }

    let mut doc = read_mcp_registry_doc(&path)?;
    let mut remaining = Vec::new();
    let mut removed: Vec<McpRegistryEntry> = Vec::new();

    for entry in doc.mcp {
        let should_remove = if let Some(filter) = id_filter {
            filter.contains(entry.id.trim())
        } else {
            true
        };
        if should_remove {
            removed.push(entry);
        } else {
            remaining.push(entry);
        }
    }

    if let Some(filter) = id_filter {
        let removed_ids: BTreeSet<String> = removed.iter().map(|item| item.id.clone()).collect();
        for id in filter {
            if !removed_ids.contains(id) {
                actions.push(SyncAction {
                    kind: "mcp".to_string(),
                    id: id.clone(),
                    name: id.clone(),
                    provider: "global".to_string(),
                    status: "not_found".to_string(),
                    source: Some(display.clone()),
                    target: Some(display.clone()),
                    message: Some("全局 MCP 不存在".to_string()),
                });
            }
        }
    }

    for entry in &removed {
        actions.push(SyncAction {
            kind: "mcp".to_string(),
            id: entry.id.clone(),
            name: entry.name.clone().unwrap_or_else(|| entry.id.clone()),
            provider: "global".to_string(),
            status: "removed".to_string(),
            source: Some(display.clone()),
            target: Some(display.clone()),
            message: None,
        });
    }

    if removed.is_empty() {
        return Ok(());
    }

    doc.mcp = remaining;
    write_mcp_registry_doc(&path, &doc)?;
    Ok(())
}

fn read_mcp_registry_doc(path: &Path) -> Result<McpRegistryDoc, AppError> {
    let content = fs::read_to_string(path).map_err(|err| {
        AppError::Internal(format!(
            "读取 MCP registry 失败（{}）: {}",
            path.display(),
            err
        ))
    })?;

    toml::from_str::<McpRegistryDoc>(&content).map_err(|err| {
        AppError::Internal(format!(
            "解析 MCP registry 失败（{}）: {}",
            path.display(),
            err
        ))
    })
}

fn write_mcp_registry_doc(path: &Path, doc: &McpRegistryDoc) -> Result<(), AppError> {
    if doc.mcp.is_empty() {
        fs::remove_file(path).map_err(|err| {
            AppError::Internal(format!(
                "删除空 MCP registry 失败（{}）: {}",
                path.display(),
                err
            ))
        })?;
        return Ok(());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| AppError::Internal(format!("创建 MCP 目录失败: {}", err)))?;
    }

    let rendered = toml::to_string_pretty(doc)
        .map_err(|err| AppError::Internal(format!("序列化 MCP registry 失败: {}", err)))?;
    fs::write(path, rendered).map_err(|err| {
        AppError::Internal(format!(
            "写入 MCP registry 失败（{}）: {}",
            path.display(),
            err
        ))
    })?;
    Ok(())
}

fn cleanup_empty_dirs(mut current: Option<&Path>, stop_at: &Path) {
    while let Some(dir) = current {
        if dir == stop_at {
            break;
        }
        let is_empty = fs::read_dir(dir)
            .ok()
            .map(|mut iter| iter.next().is_none())
            .unwrap_or(false);
        if !is_empty {
            break;
        }
        if fs::remove_dir(dir).is_err() {
            break;
        }
        current = dir.parent();
    }
}

fn load_mcp_registry(mux_home: &Path) -> Result<(Vec<McpSource>, PathBuf), AppError> {
    let primary = mux_home.join("mcp").join("registry.toml");
    let path = primary;

    if !path.exists() {
        return Ok((Vec::new(), path));
    }

    let content = fs::read_to_string(&path).map_err(|err| {
        AppError::Internal(format!(
            "读取 MCP registry 失败（{}）: {}",
            path.display(),
            err
        ))
    })?;

    let doc: McpRegistryDoc = toml::from_str(&content).map_err(|err| {
        AppError::Internal(format!(
            "解析 MCP registry 失败（{}）: {}",
            path.display(),
            err
        ))
    })?;

    let mut seen = BTreeSet::new();
    let mut out = Vec::new();

    for entry in doc.mcp {
        let id = entry.id.trim().to_string();
        if id.is_empty() || entry.command.trim().is_empty() {
            continue;
        }
        if !seen.insert(id.clone()) {
            continue;
        }

        out.push(McpSource {
            name: entry.name.unwrap_or_else(|| id.clone()),
            id,
            command: McpCommand {
                command: entry.command,
                args: entry.args,
                env: entry.env,
            },
        });
    }

    Ok((out, path))
}

fn read_claude_mcp_map(path: &Path) -> Result<BTreeMap<String, McpCommand>, AppError> {
    if !path.exists() {
        return Ok(BTreeMap::new());
    }

    let content = fs::read_to_string(path)
        .map_err(|err| AppError::Internal(format!("读取 Claude MCP 配置失败: {}", err)))?;

    let value: JsonValue = serde_json::from_str(&content)
        .map_err(|err| AppError::Internal(format!("解析 Claude MCP 配置失败: {}", err)))?;

    let mut map = BTreeMap::new();
    for key in ["mcp_servers", "mcpServers"] {
        if let Some(obj) = value.get(key).and_then(|v| v.as_object()) {
            for (id, item) in obj {
                if let Ok(command) = serde_json::from_value::<McpCommand>(item.clone()) {
                    map.insert(id.to_string(), command);
                }
            }
        }
    }

    Ok(map)
}

fn write_claude_mcp_map(
    path: &Path,
    updates: &BTreeMap<String, McpCommand>,
) -> Result<(), AppError> {
    if updates.is_empty() {
        return Ok(());
    }

    let mut root = if path.exists() {
        let raw = fs::read_to_string(path)
            .map_err(|err| AppError::Internal(format!("读取 Claude MCP 配置失败: {}", err)))?;
        serde_json::from_str::<JsonValue>(&raw)
            .unwrap_or_else(|_| JsonValue::Object(JsonMap::new()))
    } else {
        JsonValue::Object(JsonMap::new())
    };

    if !root.is_object() {
        root = JsonValue::Object(JsonMap::new());
    }

    let mut mcp_servers = JsonMap::new();
    if let Some(existing) = root
        .get("mcp_servers")
        .and_then(|v| v.as_object())
        .or_else(|| root.get("mcpServers").and_then(|v| v.as_object()))
    {
        mcp_servers.extend(existing.clone());
    }

    for (id, command) in updates {
        let serialized = serde_json::to_value(command)
            .map_err(|err| AppError::Internal(format!("序列化 MCP 配置失败: {}", err)))?;
        mcp_servers.insert(id.clone(), serialized);
    }

    root["mcpServers"] = JsonValue::Object(mcp_servers);
    if let Some(obj) = root.as_object_mut() {
        obj.remove("mcp_servers");
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| AppError::Internal(format!("创建 Claude MCP 目录失败: {}", err)))?;
    }

    let rendered = serde_json::to_string_pretty(&root)
        .map_err(|err| AppError::Internal(format!("序列化 Claude MCP 配置失败: {}", err)))?;
    fs::write(path, format!("{}\n", rendered))
        .map_err(|err| AppError::Internal(format!("写入 Claude MCP 配置失败: {}", err)))?;

    Ok(())
}

fn read_codex_mcp_map(path: &Path) -> Result<BTreeMap<String, McpCommand>, AppError> {
    if !path.exists() {
        return Ok(BTreeMap::new());
    }

    let content = fs::read_to_string(path)
        .map_err(|err| AppError::Internal(format!("读取 Codex 配置失败: {}", err)))?;

    let value: TomlValue = toml::from_str(&content)
        .map_err(|err| AppError::Internal(format!("解析 Codex 配置失败: {}", err)))?;

    let mut map = BTreeMap::new();
    if let Some(table) = value.get("mcp_servers").and_then(|v| v.as_table()) {
        for (id, spec) in table {
            if let Some(parsed) = parse_mcp_from_toml(spec) {
                map.insert(id.clone(), parsed);
            }
        }
    }

    Ok(map)
}

fn write_codex_mcp_map(
    path: &Path,
    updates: &BTreeMap<String, McpCommand>,
) -> Result<(), AppError> {
    if updates.is_empty() {
        return Ok(());
    }

    let mut root: TomlValue = if path.exists() {
        let raw = fs::read_to_string(path)
            .map_err(|err| AppError::Internal(format!("读取 Codex 配置失败: {}", err)))?;
        toml::from_str(&raw)
            .map_err(|err| AppError::Internal(format!("解析 Codex 配置失败: {}", err)))?
    } else {
        TomlValue::Table(toml::map::Map::new())
    };

    let root_table = root
        .as_table_mut()
        .ok_or_else(|| AppError::Internal("Codex 配置不是有效的 TOML 表".to_string()))?;

    if !root_table.contains_key("mcp_servers") {
        root_table.insert(
            "mcp_servers".to_string(),
            TomlValue::Table(toml::map::Map::new()),
        );
    }

    let mcp_table = root_table
        .get_mut("mcp_servers")
        .and_then(|v| v.as_table_mut())
        .ok_or_else(|| AppError::Internal("mcp_servers 不是 TOML 表".to_string()))?;

    for (id, spec) in updates {
        let mut entry = toml::map::Map::new();
        entry.insert(
            "command".to_string(),
            TomlValue::String(spec.command.clone()),
        );

        if !spec.args.is_empty() {
            entry.insert(
                "args".to_string(),
                TomlValue::Array(spec.args.iter().cloned().map(TomlValue::String).collect()),
            );
        }

        if !spec.env.is_empty() {
            let mut env_table = toml::map::Map::new();
            for (key, value) in &spec.env {
                env_table.insert(key.clone(), TomlValue::String(value.clone()));
            }
            entry.insert("env".to_string(), TomlValue::Table(env_table));
        }

        mcp_table.insert(id.clone(), TomlValue::Table(entry));
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| AppError::Internal(format!("创建 Codex 配置目录失败: {}", err)))?;
    }

    let rendered = toml::to_string_pretty(&root)
        .map_err(|err| AppError::Internal(format!("序列化 Codex 配置失败: {}", err)))?;

    fs::write(path, rendered)
        .map_err(|err| AppError::Internal(format!("写入 Codex 配置失败: {}", err)))?;

    Ok(())
}

fn parse_mcp_from_toml(value: &TomlValue) -> Option<McpCommand> {
    let table = value.as_table()?;
    let command = table.get("command")?.as_str()?.to_string();

    let args = table
        .get("args")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let env = table
        .get("env")
        .and_then(|v| v.as_table())
        .map(|tbl| {
            tbl.iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                .collect()
        })
        .unwrap_or_default();

    Some(McpCommand { command, args, env })
}

fn detect_provider(command: &str) -> ProviderAvailability {
    match which::which(command) {
        Ok(path) => ProviderAvailability {
            installed: true,
            command: command.to_string(),
            path: Some(path.display().to_string()),
        },
        Err(_) => {
            let fallback = provider_fallback_path(command);
            ProviderAvailability {
                installed: fallback.is_some(),
                command: command.to_string(),
                path: fallback.map(|p| p.display().to_string()),
            }
        }
    }
}

fn provider_fallback_path(command: &str) -> Option<PathBuf> {
    let home = dirs::home_dir()?;

    match command {
        "codex" => {
            let base = codex_home();
            if base.exists() {
                return Some(base);
            }
            None
        }
        "claude" => {
            let claude_dir = home.join(".claude");
            if claude_dir.exists() {
                return Some(claude_dir);
            }
            let claude_json = home.join(".claude.json");
            if claude_json.exists() {
                return Some(claude_json);
            }
            None
        }
        _ => None,
    }
}

fn is_provider_installed(status: &AiStatusResponse, provider: &str) -> bool {
    match provider {
        "claude" => status.providers.claude.installed,
        "codex" => status.providers.codex.installed,
        _ => false,
    }
}

fn mux_home() -> Result<PathBuf, AppError> {
    if let Ok(path) = std::env::var("MUX_HOME") {
        return Ok(PathBuf::from(path));
    }

    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Internal("无法获取用户目录（home）".to_string()))?;
    Ok(home.join(".0xmux"))
}

fn claude_home() -> Result<PathBuf, AppError> {
    if let Ok(path) = std::env::var("CLAUDE_HOME") {
        return Ok(PathBuf::from(path));
    }

    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Internal("无法获取用户目录（home）".to_string()))?;
    Ok(home.join(".claude"))
}

fn codex_home() -> PathBuf {
    if let Ok(path) = std::env::var("CODEX_HOME") {
        return PathBuf::from(path);
    }

    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".codex")
}

fn codex_skill_target(codex_home: &Path, skill_id: &str) -> PathBuf {
    let safe_id = skill_id.replace(['/', '\\'], "__");
    codex_home.join("skills").join(safe_id).join("SKILL.md")
}

fn claude_skills_root(claude_home: &Path) -> PathBuf {
    claude_home.join("skills")
}

fn claude_skill_target(claude_home: &Path, skill_id: &str) -> PathBuf {
    claude_skills_root(claude_home).join(format!("{}.md", skill_id))
}

fn render_codex_skill_bytes(skill: &SkillSource) -> Result<Vec<u8>, AppError> {
    let raw = fs::read_to_string(&skill.source_path).map_err(|err| {
        AppError::Internal(format!(
            "读取源文件失败（{}）: {}",
            skill.source_display, err
        ))
    })?;

    let normalized = raw.replace("\r\n", "\n");
    let without_bom = normalized.trim_start_matches('\u{feff}');
    let source_meta = parse_skill_frontmatter(without_bom);
    let body = strip_initial_frontmatter(without_bom).trim_start();
    let name = codex_skill_name(source_meta.name.as_deref().unwrap_or(&skill.name));
    let description = codex_skill_description(skill, source_meta.description.as_deref());

    let mut rendered = String::new();
    rendered.push_str("---\n");
    rendered.push_str("name: ");
    rendered.push_str(&name);
    rendered.push('\n');
    rendered.push_str("description: '");
    rendered.push_str(&yaml_escape_single_quoted(&description));
    rendered.push_str("'\n");
    rendered.push_str("---\n\n");
    rendered.push_str("<!-- Auto-generated by 0xMux sync. Source: ");
    rendered.push_str(&skill.source_display);
    rendered.push_str(" -->\n\n");
    rendered.push_str(body);
    if !rendered.ends_with('\n') {
        rendered.push('\n');
    }

    Ok(rendered.into_bytes())
}

fn render_claude_skill_bytes(skill: &SkillSource) -> Result<Vec<u8>, AppError> {
    let raw = fs::read_to_string(&skill.source_path).map_err(|err| {
        AppError::Internal(format!(
            "读取源文件失败（{}）: {}",
            skill.source_display, err
        ))
    })?;
    let normalized = raw.replace("\r\n", "\n");
    let without_bom = normalized.trim_start_matches('\u{feff}');
    let mut out = without_bom.to_string();
    if !out.ends_with('\n') {
        out.push('\n');
    }
    Ok(out.into_bytes())
}

fn strip_initial_frontmatter(input: &str) -> &str {
    if !input.starts_with("---\n") {
        return input;
    }

    let rest = &input[4..];
    if let Some(end) = rest.find("\n---\n") {
        return &rest[end + 5..];
    }

    input
}

fn codex_skill_name(skill_id: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;

    for ch in skill_id.chars() {
        let mapped = if ch.is_ascii_alphanumeric() {
            ch.to_ascii_lowercase()
        } else {
            '-'
        };

        if mapped == '-' {
            if prev_dash {
                continue;
            }
            prev_dash = true;
        } else {
            prev_dash = false;
        }

        out.push(mapped);
    }

    while out.ends_with('-') {
        out.pop();
    }

    if out.is_empty() {
        return "skill".to_string();
    }

    out
}

fn codex_skill_description(skill: &SkillSource, from_source: Option<&str>) -> String {
    let mut desc = from_source.unwrap_or("").trim().replace('\n', " ");
    if desc.is_empty() {
        let kind = if skill.id.starts_with("commands/") {
            "command workflow"
        } else if skill.id.starts_with("agents/") {
            "agent workflow"
        } else {
            "workflow"
        };

        desc = format!(
            "Auto-generated {} from {} for Codex usage.",
            kind, skill.source_display
        );
    }

    if desc.len() > 1000 {
        desc.truncate(1000);
    }

    desc
}

fn parse_skill_frontmatter(input: &str) -> SkillFrontmatter {
    if !input.starts_with("---\n") {
        return SkillFrontmatter::default();
    }

    let rest = &input[4..];
    let Some(end) = rest.find("\n---\n") else {
        return SkillFrontmatter::default();
    };

    let fm = &rest[..end];
    let mut parsed = SkillFrontmatter::default();

    for line in fm.lines() {
        let trimmed = line.trim();
        if let Some(value) = trimmed.strip_prefix("name:") {
            let value = unquote_yaml_scalar(value.trim());
            if !value.is_empty() {
                parsed.name = Some(value.to_string());
            }
            continue;
        }
        if let Some(value) = trimmed.strip_prefix("description:") {
            let value = unquote_yaml_scalar(value.trim());
            if !value.is_empty() {
                parsed.description = Some(value.to_string());
            }
        }
    }

    parsed
}

fn unquote_yaml_scalar(value: &str) -> &str {
    if value.len() >= 2 {
        if value.starts_with('"') && value.ends_with('"') {
            return &value[1..value.len() - 1];
        }
        if value.starts_with('\'') && value.ends_with('\'') {
            return &value[1..value.len() - 1];
        }
    }
    value
}

fn yaml_escape_single_quoted(input: &str) -> String {
    input
        .replace('\'', "''")
        .replace('\n', " ")
        .trim()
        .to_string()
}

fn claude_mcp_path() -> Result<PathBuf, AppError> {
    if let Ok(path) = std::env::var("CLAUDE_CONFIG_PATH") {
        return Ok(PathBuf::from(path));
    }

    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Internal("无法获取用户目录（home）".to_string()))?;
    Ok(home.join(".claude.json"))
}

fn codex_config_path(codex_home: &Path) -> PathBuf {
    codex_home.join("config.toml")
}

fn write_claude_mcp_full(path: &Path, all: &BTreeMap<String, McpCommand>) -> Result<(), AppError> {
    let mut root = if path.exists() {
        let raw = fs::read_to_string(path)
            .map_err(|err| AppError::Internal(format!("读取 Claude MCP 配置失败: {}", err)))?;
        serde_json::from_str::<JsonValue>(&raw)
            .unwrap_or_else(|_| JsonValue::Object(JsonMap::new()))
    } else {
        JsonValue::Object(JsonMap::new())
    };

    if !root.is_object() {
        root = JsonValue::Object(JsonMap::new());
    }

    let mut mcp_servers = JsonMap::new();
    for (id, command) in all {
        let serialized = serde_json::to_value(command)
            .map_err(|err| AppError::Internal(format!("序列化 MCP 配置失败: {}", err)))?;
        mcp_servers.insert(id.clone(), serialized);
    }

    root["mcpServers"] = JsonValue::Object(mcp_servers);
    if let Some(obj) = root.as_object_mut() {
        obj.remove("mcp_servers");
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| AppError::Internal(format!("创建 Claude MCP 目录失败: {}", err)))?;
    }

    let rendered = serde_json::to_string_pretty(&root)
        .map_err(|err| AppError::Internal(format!("序列化 Claude MCP 配置失败: {}", err)))?;
    fs::write(path, format!("{}\n", rendered))
        .map_err(|err| AppError::Internal(format!("写入 Claude MCP 配置失败: {}", err)))?;

    Ok(())
}

fn write_codex_mcp_full(path: &Path, all: &BTreeMap<String, McpCommand>) -> Result<(), AppError> {
    let mut root: TomlValue = if path.exists() {
        let raw = fs::read_to_string(path)
            .map_err(|err| AppError::Internal(format!("读取 Codex 配置失败: {}", err)))?;
        toml::from_str(&raw)
            .map_err(|err| AppError::Internal(format!("解析 Codex 配置失败: {}", err)))?
    } else {
        TomlValue::Table(toml::map::Map::new())
    };

    let root_table = root
        .as_table_mut()
        .ok_or_else(|| AppError::Internal("Codex 配置不是有效的 TOML 表".to_string()))?;

    let mut mcp_table = toml::map::Map::new();
    for (id, spec) in all {
        let mut entry = toml::map::Map::new();
        entry.insert(
            "command".to_string(),
            TomlValue::String(spec.command.clone()),
        );

        if !spec.args.is_empty() {
            entry.insert(
                "args".to_string(),
                TomlValue::Array(spec.args.iter().cloned().map(TomlValue::String).collect()),
            );
        }

        if !spec.env.is_empty() {
            let mut env_table = toml::map::Map::new();
            for (key, value) in &spec.env {
                env_table.insert(key.clone(), TomlValue::String(value.clone()));
            }
            entry.insert("env".to_string(), TomlValue::Table(env_table));
        }

        mcp_table.insert(id.clone(), TomlValue::Table(entry));
    }
    root_table.insert("mcp_servers".to_string(), TomlValue::Table(mcp_table));

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| AppError::Internal(format!("创建 Codex 配置目录失败: {}", err)))?;
    }

    let rendered = toml::to_string_pretty(&root)
        .map_err(|err| AppError::Internal(format!("序列化 Codex 配置失败: {}", err)))?;

    fs::write(path, rendered)
        .map_err(|err| AppError::Internal(format!("写入 Codex 配置失败: {}", err)))?;

    Ok(())
}

fn summarize_uninstall_actions(actions: &[SyncAction]) -> UninstallSummary {
    let mut summary = UninstallSummary {
        total: actions.len(),
        ..UninstallSummary::default()
    };

    for action in actions {
        match action.status.as_str() {
            "removed" => summary.removed += 1,
            "skipped" => summary.skipped += 1,
            "failed" => summary.failed += 1,
            "not_found" => summary.not_found += 1,
            _ => {}
        }
    }

    summary
}

fn display_path(path: &Path) -> String {
    if let Some(home) = dirs::home_dir()
        && let Ok(relative) = path.strip_prefix(&home)
    {
        return format!("~/{}", relative.display());
    }

    path.display().to_string()
}

fn summarize_actions(actions: &[SyncAction]) -> SyncSummary {
    let mut summary = SyncSummary {
        total: actions.len(),
        ..SyncSummary::default()
    };

    for action in actions {
        match action.status.as_str() {
            "updated" => summary.updated += 1,
            "planned" => summary.planned += 1,
            "up_to_date" => summary.up_to_date += 1,
            "skipped" => summary.skipped += 1,
            "failed" => summary.failed += 1,
            _ => {}
        }
    }

    summary
}

fn app_error_message(err: &AppError) -> String {
    match err {
        AppError::NotFound(msg)
        | AppError::BadRequest(msg)
        | AppError::Forbidden(msg)
        | AppError::PayloadTooLarge(msg)
        | AppError::Conflict(msg)
        | AppError::ServiceUnavailable(msg)
        | AppError::LastWindow(msg)
        | AppError::Internal(msg) => msg.clone(),
    }
}
