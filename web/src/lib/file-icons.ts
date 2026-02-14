import fileTypeBun from '@iconify-icons/vscode-icons/file-type-bun'
import fileTypeCss from '@iconify-icons/vscode-icons/file-type-css'
import fileTypeDocker from '@iconify-icons/vscode-icons/file-type-docker'
import fileTypeDotenv from '@iconify-icons/vscode-icons/file-type-dotenv'
import fileTypeEditorConfig from '@iconify-icons/vscode-icons/file-type-editorconfig'
import fileTypeEslint from '@iconify-icons/vscode-icons/file-type-eslint'
import fileTypeGit from '@iconify-icons/vscode-icons/file-type-git'
import fileTypeGo from '@iconify-icons/vscode-icons/file-type-go-gopher'
import fileTypeHtml from '@iconify-icons/vscode-icons/file-type-html'
import fileTypeImage from '@iconify-icons/vscode-icons/file-type-image'
import fileTypeJavaScript from '@iconify-icons/vscode-icons/file-type-js-official'
import fileTypeJsConfig from '@iconify-icons/vscode-icons/file-type-jsconfig'
import fileTypeJson from '@iconify-icons/vscode-icons/file-type-json-official'
import fileTypeLess from '@iconify-icons/vscode-icons/file-type-less'
import fileTypeLicense from '@iconify-icons/vscode-icons/file-type-license'
import fileTypeMakefile from '@iconify-icons/vscode-icons/file-type-makefile'
import fileTypeMarkdown from '@iconify-icons/vscode-icons/file-type-markdown'
import fileTypeNpm from '@iconify-icons/vscode-icons/file-type-npm'
import fileTypePackage from '@iconify-icons/vscode-icons/file-type-package'
import fileTypePnpm from '@iconify-icons/vscode-icons/file-type-pnpm'
import fileTypePrettier from '@iconify-icons/vscode-icons/file-type-prettier'
import fileTypePython from '@iconify-icons/vscode-icons/file-type-python'
import fileTypeReact from '@iconify-icons/vscode-icons/file-type-reactjs'
import fileTypeReactTs from '@iconify-icons/vscode-icons/file-type-reactts'
import fileTypeRust from '@iconify-icons/vscode-icons/file-type-rust'
import fileTypeSass from '@iconify-icons/vscode-icons/file-type-sass'
import fileTypeScss from '@iconify-icons/vscode-icons/file-type-scss'
import fileTypeShell from '@iconify-icons/vscode-icons/file-type-shell'
import fileTypeSql from '@iconify-icons/vscode-icons/file-type-sql'
import fileTypeSvg from '@iconify-icons/vscode-icons/file-type-svg'
import fileTypeToml from '@iconify-icons/vscode-icons/file-type-toml'
import fileTypeTsConfig from '@iconify-icons/vscode-icons/file-type-tsconfig-official'
import fileTypeTypeScript from '@iconify-icons/vscode-icons/file-type-typescript-official'
import fileTypeXml from '@iconify-icons/vscode-icons/file-type-xml'
import fileTypeYaml from '@iconify-icons/vscode-icons/file-type-yaml'
import fileTypeYarn from '@iconify-icons/vscode-icons/file-type-yarn'
import { IconFile } from './icons'

type FileIcon = typeof IconFile

interface FileIconMeta {
  icon: FileIcon
  className: string
}

const DEFAULT_ICON_CLASS = 'text-[var(--color-fg-muted)] shrink-0'
const COLORED_ICON_CLASS = 'shrink-0'

const EXTENSION_ICON_MAP: Record<string, FileIcon> = {
  ts: fileTypeTypeScript,
  mts: fileTypeTypeScript,
  cts: fileTypeTypeScript,
  tsx: fileTypeReactTs,
  js: fileTypeJavaScript,
  mjs: fileTypeJavaScript,
  cjs: fileTypeJavaScript,
  jsx: fileTypeReact,
  json: fileTypeJson,
  jsonc: fileTypeJson,
  md: fileTypeMarkdown,
  mdx: fileTypeMarkdown,
  rs: fileTypeRust,
  py: fileTypePython,
  go: fileTypeGo,
  html: fileTypeHtml,
  htm: fileTypeHtml,
  css: fileTypeCss,
  scss: fileTypeScss,
  sass: fileTypeSass,
  less: fileTypeLess,
  yml: fileTypeYaml,
  yaml: fileTypeYaml,
  toml: fileTypeToml,
  xml: fileTypeXml,
  svg: fileTypeSvg,
  sh: fileTypeShell,
  bash: fileTypeShell,
  zsh: fileTypeShell,
  fish: fileTypeShell,
  sql: fileTypeSql,
}

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'ico',
  'avif',
  'tif',
  'tiff',
])

function withColoredIcon(icon: FileIcon): FileIconMeta {
  return { icon, className: COLORED_ICON_CLASS }
}

function isLicenseFile(fileName: string): boolean {
  return (
    fileName === 'license' ||
    fileName.startsWith('license.') ||
    fileName === 'copying' ||
    fileName.startsWith('copying.')
  )
}

export function getFileIcon(fileName: string): FileIconMeta {
  const lowerName = fileName.toLowerCase()

  if (lowerName === '.gitignore' || lowerName === '.gitattributes' || lowerName === '.gitmodules') {
    return withColoredIcon(fileTypeGit)
  }

  if (lowerName.startsWith('.env')) {
    return withColoredIcon(fileTypeDotenv)
  }

  if (lowerName === '.editorconfig') {
    return withColoredIcon(fileTypeEditorConfig)
  }

  if (
    lowerName.startsWith('.eslintrc') ||
    lowerName === 'eslint.config.js' ||
    lowerName === 'eslint.config.mjs' ||
    lowerName === 'eslint.config.ts'
  ) {
    return withColoredIcon(fileTypeEslint)
  }

  if (
    lowerName.startsWith('.prettierrc') ||
    lowerName === 'prettier.config.js' ||
    lowerName === 'prettier.config.mjs' ||
    lowerName === 'prettier.config.ts'
  ) {
    return withColoredIcon(fileTypePrettier)
  }

  if (lowerName === 'package.json') {
    return withColoredIcon(fileTypePackage)
  }

  if (lowerName === 'package-lock.json') {
    return withColoredIcon(fileTypeNpm)
  }

  if (lowerName === 'pnpm-lock.yaml') {
    return withColoredIcon(fileTypePnpm)
  }

  if (lowerName === 'yarn.lock') {
    return withColoredIcon(fileTypeYarn)
  }

  if (lowerName === 'bun.lock' || lowerName === 'bun.lockb' || lowerName === 'bunfig.toml') {
    return withColoredIcon(fileTypeBun)
  }

  if (lowerName === 'tsconfig.json') {
    return withColoredIcon(fileTypeTsConfig)
  }

  if (lowerName === 'jsconfig.json') {
    return withColoredIcon(fileTypeJsConfig)
  }

  if (
    lowerName === 'dockerfile' ||
    lowerName.startsWith('dockerfile.') ||
    lowerName.startsWith('docker-compose.') ||
    lowerName === 'compose.yml' ||
    lowerName === 'compose.yaml'
  ) {
    return withColoredIcon(fileTypeDocker)
  }

  if (lowerName === 'makefile' || lowerName === 'gnumakefile') {
    return withColoredIcon(fileTypeMakefile)
  }

  if (lowerName === 'readme' || lowerName.startsWith('readme.')) {
    return withColoredIcon(fileTypeMarkdown)
  }

  if (isLicenseFile(lowerName)) {
    return withColoredIcon(fileTypeLicense)
  }

  const extension = lowerName.includes('.') ? lowerName.split('.').pop() ?? '' : ''

  if (extension && extension in EXTENSION_ICON_MAP) {
    return withColoredIcon(EXTENSION_ICON_MAP[extension])
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return withColoredIcon(fileTypeImage)
  }

  return { icon: IconFile, className: DEFAULT_ICON_CLASS }
}
