import { chromium } from "@playwright/test";
import WebSocket from "ws";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({ channel: "chrome" }),
  bots = [],
  contexts = [],
  errors = [];
let bytes = 0,
  count = 0,
  maxGap = 0,
  last = 0;
try {
  for (let i = 0; i < 4; i++) {
    const ws = new WebSocket("ws://localhost:3001/world", {
      origin: "http://localhost:3000",
    });
    bots.push(ws);
    await new Promise((resolve, reject) => {
      ws.on("open", () =>
        ws.send(JSON.stringify({ type: "join", name: "Load Bot " + i })),
      );
      ws.on("message", (raw) => {
        const d = JSON.parse(raw);
        if (d.type === "welcome") resolve();
        if (d.type === "error") reject(Error(d.message));
        if (i === 0 && d.type === "snapshot") {
          const now = Date.now();
          if (last) maxGap = Math.max(maxGap, now - last);
          last = now;
          bytes += raw.length;
          count++;
        }
      });
      ws.on("error", reject);
    });
  }
  const pages = [];
  for (let i = 0; i < 4; i++) {
    const context = await browser.newContext({
      viewport: { width: 800, height: 600 },
    });
    contexts.push(context);
    const p = await context.newPage();
    pages.push(p);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto("http://localhost:3000");
    await p.waitForFunction(() => window.__park?.state().ready);
    await p.locator("#username").fill("Load Browser " + i);
    await p.getByRole("button", { name: "Enter Park Kerala" }).click();
    await p.waitForFunction(() => window.__park.state().started);
  }
  const start = Date.now(),
    timer = setInterval(() => {
      const t = (Date.now() - start) / 1000;
      bots.forEach((b, i) =>
        b.send(
          JSON.stringify({
            type: "move",
            x: Math.sin(t + i) * 1.5,
            y: 0.25,
            z: 28 + Math.cos(t + i) * 1.5,
            yaw: t,
            moving: true,
            vx: Math.cos(t + i) * 1.5,
            vz: -Math.sin(t + i) * 1.5,
            grounded: true,
          }),
        ),
      );
    }, 50);
  await pages[0].waitForTimeout(20000);
  clearInterval(timer);
  const stats = [];
  for (const p of pages)
    stats.push(
      await p.evaluate(() => {
        const s = window.__park.state();
        return {
          players: s.social.snapshot.players.length,
          fps: s.fps,
          remotes: s.social.remotePlayers.length,
          transports: s.social.transports.length,
        };
      }),
    );
  const report = {
    durationSeconds: 20,
    browserClients: 4,
    simulatedClients: 4,
    snapshots: count,
    maxSnapshotGapMs: maxGap,
    receivedKiB: Math.round(bytes / 1024),
    clients: stats,
    errors,
  };
  console.log(report);
  writeFileSync("artifacts/stress.json", JSON.stringify(report, null, 2));
  assert.deepEqual(errors, []);
  assert.ok(stats.every((s) => s.players >= 8 && s.remotes >= 7 && s.fps > 25));
  assert.ok(maxGap < 500);
  assert.ok(count > 300);
} finally {
  bots.forEach((b) => b.close());
  await browser.close();
}
