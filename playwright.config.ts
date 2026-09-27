import { defineConfig, devices } from '@playwright/test';

// Several worktrees can run at once; PW_PORT moves this one off the default.
const port = Number(process.env.PW_PORT ?? 5173);
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: origin,
    trace: 'retain-on-failure',
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

