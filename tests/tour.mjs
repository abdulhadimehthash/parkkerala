import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto("http://localhost:3000");
await page.waitForFunction(() => window.__park?.state().ready);
await page.locator("#username").fill("Tour-"+Math.random().toString(36).slice(2,7));
await page.getByRole("button", { name: "Enter Park Kerala" }).click();
await page.waitForFunction(()=>window.__park.state().started);
for (const [name, x, z, yaw] of [
  ["backwaters", 0, -70, -0.6],
  ["fields", 150, 110, 1.5],
  ["coast", -214, 35, 1.3],
  ["village", 150, -127, 0],
]) {
  await page.evaluate(
    ({ x, z, yaw }) => {
      window.__park.teleport(x, z);
      window.__park.setYaw(yaw);
    },
    { x, z, yaw },
  );
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `artifacts/${name}.png` });
  console.log(name, await page.evaluate(() => window.__park.state()));
}
await browser.close();
