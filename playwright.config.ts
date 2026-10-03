import { defineConfig, devices } from '@playwright/test';

// Several worktrees can run at once; PW_PORT moves this one off the default.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const port = Number(env.PW_PORT ?? 5173);
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: origin,
    trace: 'retain-on-failure',
    // Cloud sessions ship a Chromium that may not match this Playwright's pinned
    // build: PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test
    ...(env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: env.PW_CHROMIUM_PATH } } : {}),
  },
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: origin,
    reuseExistingServer: false,
    env: {
      VITE_ENABLE_DEBUG_BRIDGE: 'true',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

