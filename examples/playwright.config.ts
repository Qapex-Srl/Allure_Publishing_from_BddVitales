// Merge these settings into the existing configuration; keep webServer,
// projects and other application settings from playwright-bdd-example.
import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: 'features/**/*.ts',
});
export default defineConfig({
  testDir,
  reporter: [['list'], ['allure-playwright', { resultsDir: 'allure-results' }]],
  use: { screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
