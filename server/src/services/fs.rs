use crate::error::AppError;
use crate::models::files::{FileContent, FileNode, FileNodeType};
use std::path::{Path, PathBuf};

/// Maximum file size for read operations (5 MB).
const MAX_FILE_SIZE: u64 = 5 * 1024 * 1024;

// ── Path Validation (T-1.1) ──────────────────────────────────────────

/// Core path normalization: convert absolute paths to relative within root,
/// reject `..` traversal components.
fn normalize_user_path(canonical_root: &Path, user_path: &str) -> Result<String, AppError> {
    let effective_path = if user_path.starts_with('/') || user_path.starts_with('\\') {
        let abs = Path::new(user_path);
        // Try canonicalize first (for existing paths)
        if let Ok(canonical_abs) = abs.canonicalize() {
            if let Ok(rel) = canonical_abs.strip_prefix(canonical_root) {
                rel.to_string_lossy().to_string()
            } else {
                return Err(AppError::Forbidden("Path escapes project root".into()));
            }
        } else if let Ok(rel) = abs.strip_prefix(canonical_root) {
            // Path doesn't exist yet; try stripping root prefix from the raw path
            rel.to_string_lossy().to_string()
        } else {
            return Err(AppError::Forbidden("Path escapes project root".into()));
        }
    } else {
        user_path.to_string()
    };

    // Reject traversal
    for component in Path::new(&effective_path).components() {
        if let std::path::Component::ParentDir = component {
            return Err(AppError::Forbidden("Path traversal not allowed".into()));
        }
    }

    Ok(effective_path)
}

/// Canonicalize the root path (shared helper to avoid repeating the error mapping).
fn canonicalize_root(root: &Path) -> Result<PathBuf, AppError> {
    root.canonicalize()
        .map_err(|e| AppError::Internal(format!("Cannot resolve root: {e}")))
}

/// Validate and resolve a user-supplied path against the project root.
///
/// Three-step validation:
/// 1. If absolute, check if within root and convert to relative; reject `..` components
/// 2. Canonicalize both root and the joined path
/// 3. Verify the resolved path starts with the canonical root
pub fn validate_path(root: &Path, user_path: &str) -> Result<PathBuf, AppError> {
    let canonical_root = canonicalize_root(root)?;
    let effective_path = normalize_user_path(&canonical_root, user_path)?;

    let joined = root.join(&effective_path);

    // Canonicalize (resolves symlinks)
    let canonical_path = joined
        .canonicalize()
        .map_err(|_| AppError::NotFound(format!("Path not found: {user_path}")))?;

    // Prefix check
    if !canonical_path.starts_with(&canonical_root) {
        return Err(AppError::Forbidden("Path escapes project root".into()));
    }

    Ok(canonical_path)
}

/// Fuzzy resolve: try the direct path first; if not found, try prepending
/// each top-level subdirectory as a prefix (one level deep).
/// Returns the resolved relative path (from root) on success.
pub fn fuzzy_resolve_path(root: &Path, user_path: &str) -> Result<String, AppError> {
    let canonical_root = canonicalize_root(root)?;
    let effective_path = normalize_user_path(&canonical_root, user_path)?;

    // 1. Try direct path
    if root.join(&effective_path).is_file() {
        return Ok(effective_path);
    }

    // 2. Try prepending each top-level subdirectory
    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
            if let Some(dir_name) = entry.file_name().to_str() {
                // Skip hidden dirs
                if dir_name.starts_with('.') {
                    continue;
                }
                let candidate = format!("{}/{}", dir_name, effective_path);
                if root.join(&candidate).is_file() {
                    return Ok(candidate);
                }
            }
        }
    }

    Err(AppError::NotFound(format!("Path not found: {user_path}")))
}

// ── Language Detection ───────────────────────────────────────────────

/// Map a file extension to a Monaco Editor language identifier.
pub fn detect_language(path: &Path) -> String {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "rs" => "rust",
        "ts" | "mts" | "cts" => "typescript",
        "tsx" => "typescriptreact",
        "js" | "mjs" | "cjs" => "javascript",
        "jsx" => "javascriptreact",
        "json" => "json",
        "toml" => "toml",
        "yaml" | "yml" => "yaml",
        "md" | "markdown" => "markdown",
        "html" | "htm" => "html",
        "css" => "css",
        "scss" => "scss",
        "less" => "less",
        "py" => "python",
        "go" => "go",
        "java" => "java",
        "c" | "h" => "c",
        "cpp" | "cc" | "cxx" | "hpp" => "cpp",
        "sh" | "bash" | "zsh" => "shell",
        "sql" => "sql",
        "xml" => "xml",
        "dockerfile" => "dockerfile",
        "lua" => "lua",
        "rb" => "ruby",
        "php" => "php",
        "swift" => "swift",
        "kt" | "kts" => "kotlin",
        "r" => "r",
        "graphql" | "gql" => "graphql",
        _ => "plaintext",
    }
    .into()
}

// ── File Operations (T-1.2) ──────────────────────────────────────────

/// List directory contents (depth=1, lazy loading).
pub fn list_directory(root: &Path, rel_path: &str) -> Result<Vec<FileNode>, AppError> {
    let canonical_root = canonicalize_root(root)?;
    let dir = if rel_path.is_empty() || rel_path == "." {
        canonical_root.clone()
    } else {
        validate_path(root, rel_path)?
    };

    if !dir.is_dir() {
        return Err(AppError::BadRequest(format!("Not a directory: {rel_path}")));
    }

    let mut entries: Vec<FileNode> = Vec::new();
    let read_dir = std::fs::read_dir(&dir)
        .map_err(|e| AppError::Internal(format!("Cannot read directory: {e}")))?;

    for entry in read_dir.flatten() {
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().into_owned();
        let full_path = entry.path();
        let rel = full_path
            .strip_prefix(&canonical_root)
            .unwrap_or(&full_path)
            .to_string_lossy()
            .replace('\\', "/");

        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| {
                chrono::DateTime::from_timestamp(d.as_secs() as i64, 0)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default()
            });

        if meta.is_dir() {
            entries.push(FileNode {
                name,
                path: rel,
                node_type: FileNodeType::Directory,
                size: None,
                modified,
                children: None, // lazy-loaded
                ignored: None,
            });
        } else if meta.is_file() {
            entries.push(FileNode {
                name,
                path: rel,
                node_type: FileNodeType::File,
                size: Some(meta.len()),
                modified,
                children: None,
                ignored: None,
            });
        }
    }

    // Sort: directories first, then alphabetical
    entries.sort_by(|a, b| {
        let a_is_dir = matches!(a.node_type, FileNodeType::Directory);
        let b_is_dir = matches!(b.node_type, FileNodeType::Directory);
        b_is_dir
            .cmp(&a_is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

/// Read a file's content as text.
pub fn read_file(root: &Path, rel_path: &str) -> Result<FileContent, AppError> {
    let file_path = validate_path(root, rel_path)?;

    if !file_path.is_file() {
        return Err(AppError::NotFound(format!("Not a file: {rel_path}")));
    }

    let meta = std::fs::metadata(&file_path)
        .map_err(|e| AppError::Internal(format!("Cannot read metadata: {e}")))?;

    // Size limit check
    if meta.len() > MAX_FILE_SIZE {
        return Err(AppError::PayloadTooLarge(format!(
            "File too large: {} bytes (max {})",
            meta.len(),
            MAX_FILE_SIZE
        )));
    }

    let bytes = std::fs::read(&file_path)
        .map_err(|e| AppError::Internal(format!("Cannot read file: {e}")))?;

    // Binary detection: check first 8KB for null bytes
    let check_len = bytes.len().min(8192);
    if bytes[..check_len].contains(&0) {
        return Err(AppError::BadRequest(
            "Binary file cannot be displayed".into(),
        ));
    }

    let content = String::from_utf8(bytes)
        .map_err(|_| AppError::BadRequest("File is not valid UTF-8".into()))?;

    let language = detect_language(&file_path);

    Ok(FileContent {
        path: rel_path.to_string(),
        content,
        language,
        size: meta.len(),
        encoding: "utf-8".into(),
    })
}

/// Validate a path where the target may not yet exist (validates parent).
fn validate_parent_path(root: &Path, rel_path: &str) -> Result<PathBuf, AppError> {
    let canonical_root = canonicalize_root(root)?;
    let effective_path = normalize_user_path(&canonical_root, rel_path)?;
    let target = root.join(&effective_path);

    if let Some(parent) = target.parent() {
        if parent.exists() {
            let canonical_parent = parent
                .canonicalize()
                .map_err(|e| AppError::Internal(format!("Cannot resolve parent: {e}")))?;
            if !canonical_parent.starts_with(&canonical_root) {
                return Err(AppError::Forbidden("Path escapes project root".into()));
            }
        } else {
            return Err(AppError::NotFound("Parent directory not found".into()));
        }
    }

    Ok(target)
}

/// Delete a file or directory by moving to system trash.
pub fn delete_path(root: &Path, rel_path: &str) -> Result<(), AppError> {
    let file_path = validate_path(root, rel_path)?;

    if !file_path.exists() {
        return Err(AppError::NotFound(format!("Path not found: {rel_path}")));
    }

    trash::delete(&file_path)
        .map_err(|e| AppError::Internal(format!("Cannot move to trash: {e}")))?;

    Ok(())
}

/// Rename a file or directory. Returns the new relative path.
pub fn rename_path(root: &Path, rel_path: &str, new_name: &str) -> Result<String, AppError> {
    // Validate the name doesn't contain path separators
    if new_name.contains('/') || new_name.contains('\\') || new_name.contains('\0') {
        return Err(AppError::BadRequest("Invalid file name".into()));
    }
    if new_name.is_empty() || new_name == "." || new_name == ".." {
        return Err(AppError::BadRequest("Invalid file name".into()));
    }

    let old_path = validate_path(root, rel_path)?;

    // Compute new path: same parent, new name
    let parent = old_path
        .parent()
        .ok_or_else(|| AppError::Internal("Cannot determine parent".into()))?;
    let new_path = parent.join(new_name);

    // Check new path doesn't already exist
    if new_path.exists() {
        return Err(AppError::Conflict(format!(
            "A file or directory named '{}' already exists",
            new_name
        )));
    }

    // Verify new path stays within root
    let canonical_root = root
        .canonicalize()
        .map_err(|e| AppError::Internal(format!("Cannot resolve root: {e}")))?;
    let canonical_parent = parent
        .canonicalize()
        .map_err(|e| AppError::Internal(format!("Cannot resolve parent: {e}")))?;
    if !canonical_parent.starts_with(&canonical_root) {
        return Err(AppError::Forbidden("Path escapes project root".into()));
    }

    std::fs::rename(&old_path, &new_path)
        .map_err(|e| AppError::Internal(format!("Cannot rename: {e}")))?;

    // Return new relative path
    let new_rel = new_path
        .strip_prefix(&canonical_root)
        .unwrap_or(&new_path)
        .to_string_lossy()
        .replace('\\', "/");

    Ok(new_rel)
}

/// Create an empty file.
pub fn create_file(root: &Path, rel_path: &str) -> Result<(), AppError> {
    let target = validate_parent_path(root, rel_path)?;

    if target.exists() {
        return Err(AppError::Conflict(format!("Already exists: {rel_path}")));
    }

    std::fs::File::create(&target)
        .map_err(|e| AppError::Internal(format!("Cannot create file: {e}")))?;

    Ok(())
}

/// Create a directory.
pub fn create_directory(root: &Path, rel_path: &str) -> Result<(), AppError> {
    let target = validate_parent_path(root, rel_path)?;

    if target.exists() {
        return Err(AppError::Conflict(format!("Already exists: {rel_path}")));
    }

    std::fs::create_dir(&target)
        .map_err(|e| AppError::Internal(format!("Cannot create directory: {e}")))?;

    Ok(())
}

/// Reveal a path in the system file manager.
pub fn reveal_in_file_manager(root: &Path, rel_path: &str) -> Result<(), AppError> {
    let file_path = validate_path(root, rel_path)?;

    let target = if file_path.is_file() {
        // For files, reveal the parent directory with the file selected
        file_path.clone()
    } else {
        file_path.clone()
    };

    #[cfg(target_os = "macos")]
    {
        if file_path.is_file() {
            std::process::Command::new("open")
                .arg("-R")
                .arg(&target)
                .spawn()
                .map_err(|e| AppError::Internal(format!("Cannot open Finder: {e}")))?;
        } else {
            std::process::Command::new("open")
                .arg(&target)
                .spawn()
                .map_err(|e| AppError::Internal(format!("Cannot open Finder: {e}")))?;
        }
    }

    #[cfg(target_os = "linux")]
    {
        let dir = if file_path.is_file() {
            file_path.parent().unwrap_or(&file_path)
        } else {
            &file_path
        };
        std::process::Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map_err(|e| AppError::Internal(format!("Cannot open file manager: {e}")))?;
    }

    #[cfg(target_os = "windows")]
    {
        if file_path.is_file() {
            std::process::Command::new("explorer")
                .arg("/select,")
                .arg(&target)
                .spawn()
                .map_err(|e| AppError::Internal(format!("Cannot open Explorer: {e}")))?;
        } else {
            std::process::Command::new("explorer")
                .arg(&target)
                .spawn()
                .map_err(|e| AppError::Internal(format!("Cannot open Explorer: {e}")))?;
        }
    }

    Ok(())
}

/// Write content to a file.
pub fn write_file(root: &Path, rel_path: &str, content: &str) -> Result<(), AppError> {
    let canonical_root = canonicalize_root(root)?;
    let effective_path = normalize_user_path(&canonical_root, rel_path)?;
    let target = root.join(&effective_path);

    // For existing files, canonicalize and check
    if target.exists() {
        let canonical_target = target
            .canonicalize()
            .map_err(|e| AppError::Internal(format!("Cannot resolve path: {e}")))?;
        if !canonical_target.starts_with(&canonical_root) {
            return Err(AppError::Forbidden("Path escapes project root".into()));
        }
    } else {
        // For new files, verify parent exists and is within root
        if let Some(parent) = target.parent() {
            if parent.exists() {
                let canonical_parent = parent
                    .canonicalize()
                    .map_err(|e| AppError::Internal(format!("Cannot resolve parent: {e}")))?;
                if !canonical_parent.starts_with(&canonical_root) {
                    return Err(AppError::Forbidden("Path escapes project root".into()));
                }
            } else {
                return Err(AppError::NotFound("Parent directory not found".into()));
            }
        }
    }

    std::fs::write(&target, content)
        .map_err(|e| AppError::Internal(format!("Cannot write file: {e}")))?;

    Ok(())
}
