#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const PLATFORM_MAP = {
  'darwin-arm64': '@0xmux/darwin-arm64',
  'darwin-x64': '@0xmux/darwin-x64',
  'linux-x64': '@0xmux/linux-x64',
};

function getBinaryPath() {
  const key = `${process.platform}-${process.arch}`;
  const pkg = PLATFORM_MAP[key];

  if (!pkg) {
    console.error(`Unsupported platform: ${key}`);
    console.error(`Supported: ${Object.keys(PLATFORM_MAP).join(', ')}`);
    process.exit(1);
  }

  try {
    const pkgDir = path.dirname(require.resolve(`${pkg}/package.json`));
    return path.join(pkgDir, 'bin', 'oxmux-server');
  } catch {
    // Fallback: check if binary is in same directory (postinstall fallback)
    const local = path.join(__dirname, '..', 'bin', 'oxmux-server');
    try {
      require('fs').accessSync(local, require('fs').constants.X_OK);
      return local;
    } catch {
      console.error(`Could not find 0xmux binary for ${key}`);
      console.error(`Package ${pkg} may not be installed.`);
      console.error(`Try: npm install -g 0xmux`);
      process.exit(1);
    }
  }
}

function main() {
  const binary = getBinaryPath();
  const args = process.argv.slice(2);

  while (true) {
    const result = spawnSync(binary, args, {
      stdio: 'inherit',
      env: process.env,
    });

    // Exit code 42 = restart requested
    if (result.status === 42) {
      console.log('\n0xMux restarting...\n');
      continue;
    }

    process.exit(result.status ?? 1);
  }
}

main();
