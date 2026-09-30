// Actual browser keyboard controls, server ownership, authoritative physics and visible models.
import { chromium } from "@playwright/test";
import {
  MAIN_ROAD,
  projectOnRoad,
  roadFrame,
  surfaceHeight,
} from "../shared/roads.js";
import assert from "node:assert/strict";
const browser = await chromium.launch({
    channel: "chrome",
    args: [
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
    ],
  }),
  errors = [];
const publicRun = process.env.PARK_PUBLIC === "1",
  url = process.env.PARK_URL || "http://localhost:3000";
const angle = (x) => Math.atan2(Math.sin(x), Math.cos(x));
async function drive(kind) {
  const context = await browser.newContext({
      viewport: { width: 1000, height: 700 },
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.qa = { id: null, snapshot: null };
    const WS = window.WebSocket;
    window.WebSocket = class extends WS {
      constructor(...args) {
        super(...args);
        this.addEventListener("message", (e) => {
          const d = JSON.parse(e.data);
          if (d.type === "welcome") window.qa.id = d.id;
          if (d.players) window.qa.snapshot = d;
        });
      }
    };
  });
  await page.goto(url);
  if (!publicRun)
    await page.waitForFunction(() => window.__park?.state().ready);
  await page.locator("#username").fill(kind + " road driver");
  await page.getByRole("button", { name: "Enter Park Kerala" }).click();
  await page.waitForFunction(() => window.qa.id && window.qa.snapshot);
  const id = kind + "-town";
  let v = await page.evaluate(
    (id) => window.qa.snapshot.vehicles.find((v) => v.id === id),
    id,
  );
  assert.equal(v.owner, null, kind + " town vehicle is already in use");
  if (publicRun) {
    assert.equal(await page.evaluate(() => typeof window.__park), "undefined");
    const side = kind === "car" ? "d" : "a";
    await page.keyboard.down(side);
    await page.keyboard.down("s");
    await page.waitForTimeout(kind === "car" ? 3500 : 2700);
    await page.keyboard.up(side);
    await page.keyboard.up("s");
  } else await page.evaluate((v) => window.__park.teleport(v.x + 3, v.z), v);
  await page.waitForTimeout(500);
  await page.keyboard.press("e");
  await page.waitForFunction(
    (kind) =>
      window.qa.snapshot.players.find((p) => p.id === window.qa.id)?.mode ===
      kind,
    kind,
  );
  if (process.env.PARK_SETUP_ONLY === "1") {
    console.log("PASS", kind, "ordinary walk and enter");
    await context.close();
    return;
  }
  let previous = projectOnRoad(MAIN_ROAD, v.x, v.z).s,
    progress = 0,
    checkpoint = 0,
    maxError = 0,
    lastAdvance = Date.now();
  const begin = Date.now(),
    keys = new Set();
  while (progress < MAIN_ROAD.length + 15 && Date.now() - begin < 360000) {
    v = await page.evaluate(
      (id) => window.qa.snapshot.vehicles.find((v) => v.id === id),
      id,
    );
    const projected = projectOnRoad(MAIN_ROAD, v.x, v.z),
      target = roadFrame(
        MAIN_ROAD,
        projected.s + 7 + Math.max(0, v.speed) * 0.45,
        -3,
      ),
      desired = Math.atan2(-(target.x - v.x), -(target.z - v.z)),
      error = angle(desired - v.yaw);
    const wanted = new Set();
    if (v.speed < (publicRun ? 8 : 10)) wanted.add("w");
    if (error > 0.055) wanted.add("a");
    if (error < -0.055) wanted.add("d");
    if (Math.abs(error) > 1 && v.speed > 5) wanted.add("Space");
    for (const key of keys)
      if (!wanted.has(key)) {
        await page.keyboard.up(key);
        keys.delete(key);
      }
    for (const key of wanted)
      if (!keys.has(key)) {
        await page.keyboard.down(key);
        keys.add(key);
      }
    let advance = projected.s - previous;
    if (advance < -MAIN_ROAD.length / 2) advance += MAIN_ROAD.length;
    if (advance > MAIN_ROAD.length / 2) advance -= MAIN_ROAD.length;
    progress += advance;
    previous = projected.s;
    if (advance > 0.02) lastAdvance = Date.now();
    assert.ok(
      Date.now() - lastAdvance < 12000,
      kind + " stuck " + JSON.stringify(v),
    );
    if (progress > 40) {
      maxError = Math.max(maxError, Math.abs(projected.lateral + 3));
      assert.ok(
        projected.distance < MAIN_ROAD.width / 2 + 0.4,
        kind + " left road " + JSON.stringify(v),
      );
      assert.ok(v.y >= surfaceHeight(v.x, v.z) - 0.06, kind + " below road");
    }
    if (progress >= checkpoint) {
      console.log(
        kind,
        Math.round(progress) + "m",
        Math.round(v.y) + "m elevation",
        "fps",
        await page.evaluate(() => window.__park?.state().fps ?? "production"),
      );
      await page.screenshot({
        path: `artifacts/${publicRun ? "public" : "local"}-drive-${kind}-${checkpoint}.png`,
      });
      checkpoint += 400;
    }
    await page.waitForTimeout(100);
  }
  for (const key of keys) await page.keyboard.up(key);
  await page.keyboard.down("Space");
  await page.waitForTimeout(1500);
  await page.keyboard.up("Space");
  await page.keyboard.press("e");
  assert.ok(progress >= MAIN_ROAD.length, kind + " incomplete " + progress);
  console.log(
    "PASS",
    kind,
    "browser keyboard full route",
    progress.toFixed(1),
    "metres",
    ((Date.now() - begin) / 1000).toFixed(1),
    "seconds",
    "max lane error",
    maxError.toFixed(2),
  );
  await context.close();
}
try {
  await Promise.all([drive("car"), drive("bike")]);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
