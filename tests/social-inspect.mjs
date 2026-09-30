import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
});
const pages = [];
for (const name of ["Hadi", "Sinan"]) {
  const p = await context.newPage();
  p.on("pageerror", (e) => console.log("ERROR", e.message));
  await p.goto("http://localhost:3000");
  await p.waitForFunction(() => window.__park?.state().ready);
  await p.locator("#username").fill(name);
  await p.getByRole("button", { name: "Enter Park Kerala" }).click();
  await p.waitForFunction(() => window.__park?.state().started);
  pages.push(p);
}
await pages[0].waitForTimeout(1200);
for (let i = 0; i < pages.length; i++) {
  console.log(
    i,
    await pages[i].evaluate(() => {
      const s = window.__park.state();
      return {
        connected: s.social.connected,
        remotes: s.social.remotePlayers,
        draw: s.drawCalls,
      };
    }),
  );
}
await pages[0].screenshot({ path: "artifacts/social.png" });
await browser.close();
