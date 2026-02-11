import { defineConfig, devices } from '@playwright/test';

/**
 * 0xMux Playwright 配置
 *
 * 详细文档: https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './.claude/test',
  testMatch: '**/playwright-e2e-test.spec.ts',

  /* 失败时最多重试次数 */
  retries: 2,

  /* 并行测试worker数量 */
  workers: 1,

  /* 测试超时 */
  timeout: 30 * 1000,

  /* 全局expect超时 */
  expect: {
    timeout: 5000
  },

  /* 测试报告 */
  reporter: [
    ['html', { outputFolder: '.claude/test/playwright-report' }],
    ['list'],
    ['json', { outputFile: '.claude/test/test-results.json' }]
  ],

  /* 所有测试的共享设置 */
  use: {
    /* 基础URL */
    baseURL: 'http://localhost:1234',

    /* 失败时截图 */
    screenshot: 'only-on-failure',

    /* 失败时录制视频 */
    video: 'retain-on-failure',

    /* Trace设置 */
    trace: 'retain-on-failure',

    /* 浏览器上下文选项 */
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  },

  /* 测试项目配置 */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* 移动端测试 */
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  /* 在测试前启动开发服务器 */
  webServer: {
    command: 'cd server && cargo run',
    url: 'http://localhost:1234/api/health',
    reuseExistingServer: true,
    timeout: 30 * 1000,
  },
});
