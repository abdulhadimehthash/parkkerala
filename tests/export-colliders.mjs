import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:3000");
  await page.waitForFunction(() => window.__park?.state().ready);
  const colliders = await page.evaluate(() => window.__park.colliders());
  writeFileSync("shared/colliders.json", JSON.stringify(colliders));
  console.log(`Exported ${colliders.length} shared world colliders.`);
} finally {
  await browser.close();
}
