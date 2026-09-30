import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1440, height: 960 },
    launchOptions: {
      channel: "chrome",
      args: ["--enable-webgl", "--ignore-gpu-blocklist"],
    },
  },
  reporter: "list",
});
