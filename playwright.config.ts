import { defineConfig, devices } from "@playwright/test"

const slowMo = process.env.PW_SLOW_MO ? Number.parseInt(process.env.PW_SLOW_MO, 10) : 0

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    launchOptions: {
      slowMo: Number.isFinite(slowMo) && slowMo > 0 ? slowMo : 0,
    },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
