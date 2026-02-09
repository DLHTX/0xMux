
# Figma 设计稿 UI 还原

使用 Figma MCP 工具进行 1:1 像素级还原 UI 设计稿，自动下载资源。

## 执行流程

1. **解析 URL** → 提取 `fileKey` 和 `nodeId`
2. **获取设计** → `mcp_Figma_get_design_context` + `mcp_Figma_get_screenshot`
3. **下载资源** → 提取资源 URL，使用 `curl -L -o` 下载到项目目录
4. **生成代码** → 像素级还原，使用本地资源路径

## 资源下载

### 目录判断


| 项目类型    | 判断条件                    | 资源目录                  |
| ------- | ----------------------- | --------------------- |
| Next.js | `next.config.ts/js`     | `public/{feature}/`   |
| Plasmo  | `package.json` 含 plasmo | `assets/{feature}/`   |
| 其他      | -                       | `public/` 或 `assets/` |


### 资源提取

从 `mcp_Figma_get_design_context` 返回的代码中提取所有资源 URL：

```typescript
// 返回代码中的资源常量
const imgLogo = "https://www.figma.com/api/mcp/asset/abc123...";
const imgIcon = "https://www.figma.com/api/mcp/asset/def456...";
```

### 下载命令

```bash
# 下载到项目目录（必须加 -L 跟随重定向）
curl -L -o "apps/web/public/xmas/logo.svg" "https://www.figma.com/api/mcp/asset/abc123..."
curl -L -o "apps/web/public/xmas/icon.svg" "https://www.figma.com/api/mcp/asset/def456..."
```

### 命名规则

- 变量名推断：`imgLogo` → `logo.svg`
- data-name 属性：`data-name="tree"` → `tree.svg`
- 保持语义化，避免 uuid

### 下载后验证

```bash
# 检查文件是否下载成功
ls -la apps/web/public/xmas/

# 检查 SVG 内容是否有效
head -5 apps/web/public/xmas/logo.svg
```

### ⚠️ SVG 修复（重要）

Figma 导出的 SVG 可能包含会导致图像变形的属性，**必须在下载后立即修复**：

**问题属性：**

- `preserveAspectRatio="none"` - 会导致 SVG 拉伸变形
- `width="100%" height="100%"` - 会导致 SVG 填满容器
- `overflow="visible"` - 可能导致布局问题

**修复方法：**

对每个下载的 SVG 文件，使用 `sed` 命令移除问题属性：

```bash
# 修复单个文件
sed -i '' 's/preserveAspectRatio="none" //g' apps/web/public/xmas/logo.svg
sed -i '' 's/width="100%" height="100%" //g' apps/web/public/xmas/logo.svg
sed -i '' 's/overflow="visible" //g' apps/web/public/xmas/logo.svg
sed -i '' 's/style="display: block;" //g' apps/web/public/xmas/logo.svg

# 或者批量修复整个目录
find apps/web/public/xmas/ -name "*.svg" -exec sed -i '' 's/preserveAspectRatio="none" //g' {} \;
find apps/web/public/xmas/ -name "*.svg" -exec sed -i '' 's/width="100%" height="100%" //g' {} \;
find apps/web/public/xmas/ -name "*.svg" -exec sed -i '' 's/overflow="visible" //g' {} \;
find apps/web/public/xmas/ -name "*.svg" -exec sed -i '' 's/style="display: block;" //g' {} \;
```

**标准下载流程：**

```bash
# 1. 下载 SVG
curl -L -o "apps/web/public/xmas/logo.svg" "https://www.figma.com/api/mcp/asset/abc123..."

# 2. 立即修复 SVG 属性
sed -i '' 's/preserveAspectRatio="none" //g' apps/web/public/xmas/logo.svg
sed -i '' 's/width="100%" height="100%" //g' apps/web/public/xmas/logo.svg
sed -i '' 's/overflow="visible" //g' apps/web/public/xmas/logo.svg
sed -i '' 's/style="display: block;" //g' apps/web/public/xmas/logo.svg

# 3. 验证修复结果
head -3 apps/web/public/xmas/logo.svg
```

## 样式还原要求

- 精确还原：尺寸、间距、颜色、字体、圆角、阴影
- 使用 Flexbox/Grid 还原布局
- 仅实现 UI，不实现业务逻辑

## 下载失败处理

如果资源下载失败，使用占位符并添加注释：

```tsx
/**
 * ⚠️ 资源下载失败，需手动下载：
 * - logo.svg: https://www.figma.com/api/mcp/asset/abc123...
 *   保存: public/xmas/logo.svg
 */
<div className="w-32 h-32 bg-gray-200 flex items-center justify-center">
  <span className="text-gray-400 text-xs">logo.svg</span>
</div>
```

## 完整示例

```bash
# 1. 下载并修复 SVG 文件
curl -L -o "apps/web/public/xmas/icon.svg" "https://www.figma.com/api/mcp/asset/abc123..." && \
sed -i '' 's/preserveAspectRatio="none" //g' apps/web/public/xmas/icon.svg && \
sed -i '' 's/width="100%" height="100%" //g' apps/web/public/xmas/icon.svg && \
sed -i '' 's/overflow="visible" //g' apps/web/public/xmas/icon.svg && \
sed -i '' 's/style="display: block;" //g' apps/web/public/xmas/icon.svg && \
echo "✅ icon.svg downloaded and fixed" && \
head -3 apps/web/public/xmas/icon.svg

# 2. 对于 PNG 图片（检查文件头如果是 PNG）
curl -L -o "apps/web/public/xmas/logo.png" "https://www.figma.com/api/mcp/asset/def456..." && \
echo "✅ logo.png downloaded" && \
file apps/web/public/xmas/logo.png

# 3. 批量修复整个目录的 SVG
find apps/web/public/xmas/ -name "*.svg" -exec sed -i '' 's/preserveAspectRatio="none" //g' {} \;
find apps/web/public/xmas/ -name "*.svg" -exec sed -i '' 's/width="100%" height="100%" //g' {} \;
find apps/web/public/xmas/ -name "*.svg" -exec sed -i '' 's/overflow="visible" //g' {} \;
find apps/web/public/xmas/ -name "*.svg" -exec sed -i '' 's/style="display: block;" //g' {} \;
```

## 注意事项

- 资源链接有效期 **7 天**，需及时下载
- 下载命令必须加 `-L` 参数跟随重定向
- **下载后必须立即修复 SVG** 以避免图像变形
- 如果 sed 报错 "illegal byte sequence"，使用 `LC_ALL=C sed` 或检查是否是 PNG 文件
- 所有图片、图标、背景等资源都应下载到本地

