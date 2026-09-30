import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({
    channel: "chrome",
    args: ["--disable-background-timer-throttling"],
  }),
  contexts = await Promise.all([browser.newContext(), browser.newContext()]),
  [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
try {
  await b.addInitScript(() => {
    const WS = window.WebSocket;
    window.WebSocket = class extends WS {
      set onmessage(fn) {
        let i = 0;
        super.onmessage = (e) => {
          const d = JSON.parse(e.data);
          if (d.type === "snapshot") {
            i++;
            if (i % 13 === 0) return;
            setTimeout(
              () => fn.call(this, e),
              [20, 15, 190, 20, 80, 0, 150, 20][i % 8],
            );
          } else fn.call(this, e);
        };
      }
    };
  });
  for (const [p, name] of [
    [a, "Jitter Hadi"],
    [b, "Jitter Sinan"],
  ]) {
    await p.goto("http://localhost:3000");
    await p.waitForFunction(() => window.__park?.state().ready);
    await p.locator("#username").fill(name);
    await p.getByRole("button", { name: "Enter Park Kerala" }).click();
    await p.waitForFunction(() => window.__park.state().started);
  }
  await b.waitForFunction(
    () => window.__park.state().social.remotePlayers.length > 0,
  );
  await a.evaluate(() => {
    window.__park.teleport(0, 29);
    window.__park.setYaw(0);
  });
  if (process.env.MODE === "car") {
    const v = await a.evaluate(() =>
      window.__park
        .state()
        .social.snapshot.vehicles.find((v) => v.id === "car-town"),
    );
    await a.evaluate((v) => window.__park.teleport(v.x + 3, v.z), v);
    await a.waitForTimeout(350);
    await a.keyboard.press("e");
    await a.waitForFunction(() => window.__park.state().social.mode === "car");
  }
  await b.evaluate(
    (duration) => {
      window.samples = [];
      let start = performance.now();
      function frame() {
        const r = window.__park
          .state()
          .social.remotePlayers.find((p) => p.name === "Jitter Hadi");
        if (r) window.samples.push({ t: performance.now(), z: r.position[2] });
        if (performance.now() - start < duration) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    },
    process.env.MODE === "car" ? 5000 : 7500,
  );
  const car = process.env.MODE === "car",
    key = car ? "s" : "w";
  if (!car) await a.keyboard.down("Shift");
  await a.keyboard.down(key);
  await a.waitForTimeout(car ? 4700 : 7200);
  await a.keyboard.up(key);
  await a.keyboard.up("Shift");
  await b.waitForTimeout(400);
  const samples = await b.evaluate(() => window.samples),
    speeds = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].t - samples[i - 1].t) / 1000;
    if (dt > 0.008 && dt < 0.06 && i > 75 && i < samples.length - 30)
      speeds.push(
        ((samples[i - 1].z - samples[i].z) / dt) *
          (process.env.MODE === "car" ? -1 : 1),
      );
  }
  const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length,
    sd = Math.sqrt(
      speeds.reduce((a, b) => a + (b - mean) ** 2, 0) / speeds.length,
    ),
    report = {
      frames: speeds.length,
      meanSpeed: mean,
      speedVariation: sd,
      reverseFrames: speeds.filter((v) => v < -0.3).length,
      slowFrames: speeds.filter((v) => v < 3).length,
      maxSpeed: Math.max(...speeds),
    };
  console.log(report);
  if (process.env.STAGE && process.env.STAGE !== "baseline") {
    assert.equal(report.reverseFrames, 0);
    assert.ok(report.slowFrames < 3);
    assert.ok(report.speedVariation < 1.2);
  }
  writeFileSync(
    `artifacts/jitter-${process.env.MODE || "player"}-${process.env.STAGE || "baseline"}.json`,
    JSON.stringify({ report, samples }, null, 2),
  );
} finally {
  await browser.close();
}
