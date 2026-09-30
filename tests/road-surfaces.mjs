import { chromium } from "@playwright/test";
import { ROADS, roadFrame } from "../shared/roads.js";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome" }),
  page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
try {
  await page.goto("http://localhost:3000");
  await page.waitForFunction(() => window.__park?.state().ready);
  const samples = [];
  for (const road of ROADS)
    for (let s = 0.5; s < road.length; s += 2)
      for (const offset of [0, -road.width / 2 + 1, road.width / 2 - 1]) {
        const p = roadFrame(road, s, offset);
        samples.push([p.x, p.z, road.id, s, offset]);
      }
  const results = [];
  for (let i = 0; i < samples.length; i += 100)
    results.push(
      ...(await page.evaluate(
        (points) => window.__park.sampleSurfaces(points),
        samples.slice(i, i + 100),
      )),
    );
  const failures = results
    .map((r, i) => ({ ...r, sample: samples[i] }))
    .filter(
      (r) =>
        r.road === undefined ||
        r.terrain > r.road + 0.015 ||
        r.shoulder > r.road + 0.015 ||
        Math.abs(r.road - r.expected) > 0.12,
    );
  console.log(
    "Rendered surface samples",
    results.length,
    "failures",
    failures.length,
    JSON.stringify(failures.slice(0, 20), null, 2),
  );
  assert.equal(failures.length, 0);
  await page.locator("#username").fill("Road QA");
  await page.getByRole("button", { name: "Enter Park Kerala" }).click();
  await page.waitForFunction(() => window.__park.state().started);
  for (const [name, x, z] of [
    ["hill", 335, -400],
    ["park", 556, -305],
    ["bridge", 150, -90],
  ]) {
    await page.evaluate(({ x, z }) => window.__park.teleport(x, z), { x, z });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `artifacts/road-${name}.png` });
  }
} finally {
  await browser.close();
}
