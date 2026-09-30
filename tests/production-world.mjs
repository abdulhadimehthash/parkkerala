// Public-build audit using only visible controls; observers read ordinary game packets.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const url = process.env.PARK_URL || "https://parkkerala.online",
  browser = await chromium.launch({
    channel: "chrome",
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  }),
  errors = [];
const angle = (x) => Math.atan2(Math.sin(x), Math.cos(x)),
  self = (p) =>
    p.evaluate(() =>
      window.qa.snapshot.players.find((p) => p.id === window.qa.id),
    ),
  match = (p) => p.evaluate(() => window.qa.snapshot.football);
async function join(name) {
  const c = await browser.newContext({
      permissions: ["microphone"],
      viewport: { width: 1440, height: 900 },
    }),
    p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.addInitScript(() => {
    window.qa = { id: null, snapshot: null, yaw: 0, pcs: [], decoded: [] };
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
    const rotate = CanvasRenderingContext2D.prototype.rotate;
    CanvasRenderingContext2D.prototype.rotate = function (a) {
      if (this.canvas.id === "minimap") window.qa.yaw = -a;
      return rotate.call(this, a);
    };
    const PC = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends PC {
      constructor(...args) {
        super(...args);
        window.qa.pcs.push(this);
      }
    };
    const AC = window.AudioContext;
    window.AudioContext = class extends AC {
      createMediaStreamSource(stream) {
        const node = super.createMediaStreamSource(stream),
          analyser = this.createAnalyser();
        analyser.fftSize = 256;
        node.connect(analyser);
        window.qa.decoded.push({ stream, analyser });
        return node;
      }
    };
  });
  await p.goto(url);
  await p.locator("#username").fill(name);
  await p.getByRole("button", { name: "Enter Park Kerala" }).click();
  await p.waitForFunction(() => window.qa.id && window.qa.snapshot);
  assert.equal(await p.evaluate(() => typeof window.__park), "undefined");
  return p;
}
async function face(p, target) {
  for (let i = 0; i < 5; i++) {
    const current = await p.evaluate(() => window.qa.yaw),
      error = angle(target - current);
    if (Math.abs(error) < 0.025) return;
    const step = Math.max(-0.85, Math.min(0.85, error));
    await p.mouse.move(900, 550);
    await p.mouse.down();
    await p.mouse.move(900 - step / 0.003, 550, { steps: 2 });
    await p.mouse.up();
    await p.waitForTimeout(30);
  }
}
async function walk(p, x, z, sprint = true, tolerance = 1.1) {
  const begin = Date.now();
  let last = await self(p),
    stalled = Date.now();
  for (let i = 0; i < 650; i++) {
    const s = await self(p),
      d = Math.hypot(x - s.x, z - s.z);
    if (d < tolerance) {
      await p.keyboard.up("w");
      await p.keyboard.up("Shift");
      await p.waitForTimeout(250);
      return;
    }
    if (Math.hypot(s.x - last.x, s.z - last.z) > 0.03) {
      stalled = Date.now();
      last = s;
    }
    assert.ok(
      Date.now() - stalled < 8000,
      "walking blocked " + JSON.stringify({ s, target: [x, z] }),
    );
    assert.ok(Date.now() - begin < 65000, "walking timeout");
    await face(p, Math.atan2(-(x - s.x), -(z - s.z)));
    await p.keyboard.down("w");
    if (sprint && d > 8) await p.keyboard.down("Shift");
    else await p.keyboard.up("Shift");
    await p.waitForTimeout(100);
  }
  throw Error("waypoint not reached");
}
async function audio(p) {
  await p.waitForFunction(
    async () => {
      let packets = false;
      for (const pc of window.qa.pcs) {
        let sent = 0,
          received = 0;
        for (const r of (await pc.getStats()).values()) {
          if (r.type === "inbound-rtp") received += r.bytesReceived || 0;
          if (r.type === "outbound-rtp") sent += r.bytesSent || 0;
        }
        if (sent > 500 && received > 500) packets = true;
      }
      const streams = [...document.querySelectorAll("audio")].map(
        (a) => a.srcObject,
      );
      return (
        packets &&
        window.qa.decoded.some(({ stream, analyser }) => {
          if (!streams.includes(stream)) return false;
          const a = new Float32Array(256);
          analyser.getFloatTimeDomainData(a);
          return Math.sqrt(a.reduce((s, v) => s + v * v, 0) / 256) > 0.001;
        })
      );
    },
    null,
    { timeout: 20000 },
  );
}
try {
  const p = await join("Hadi Turf"),
    q = await join("Sinan Turf");
  for (const page of [p, q]) {
    await walk(page, 0, 235);
    await walk(page, 43, 235);
    await walk(page, page === p ? 68 : 75, page === p ? 244 : 241, false);
  }
  console.log(
    "PASS both public players walked from town through the road entrance to the turf",
  );
  await p.locator("#football-blue").click();
  await q.locator("#football-amber").click();
  await p.waitForFunction(
    () => window.qa.snapshot.football.status === "playing",
  );
  for (const page of [p, q])
    await page.getByRole("button", { name: "Toggle microphone" }).click();
  await audio(p);
  await audio(q);
  console.log("PASS decoded two-way public Opus audio at the football turf");
  let ball = (await match(p)).ball;
  await walk(p, ball.x, ball.z + 1.7, false, 0.6);
  await face(p, 0);
  await p.keyboard.down("w");
  await p.waitForTimeout(130);
  await p.keyboard.press("f");
  await p.keyboard.up("w");
  await q.waitForFunction(() => window.qa.snapshot.football.ball.vz < -1);
  console.log("PASS Hadi kick is visible to Sinan");
  await q.waitForTimeout(2600);
  ball = (await match(q)).ball;
  await walk(q, ball.x, ball.z - 3, false, 0.8);
  await face(q, Math.PI);
  await q.keyboard.down("w");
  await q.waitForTimeout(240);
  await q.keyboard.press("f");
  await q.keyboard.up("w");
  await p.waitForFunction(() => window.qa.snapshot.football.ball.vz > 1);
  console.log("PASS Sinan returns the same public ball");
  for (let shot = 0; shot < 9 && (await match(p)).scores.A === 0; shot++) {
    await p.waitForFunction(
      () =>
        Math.hypot(
          window.qa.snapshot.football.ball.vx,
          window.qa.snapshot.football.ball.vz,
        ) < 0.6 || window.qa.snapshot.football.scores.A > 0,
      null,
      { timeout: 10000 },
    );
    if ((await match(p)).scores.A > 0) break;
    ball = (await match(p)).ball;
    const dx = 68 - ball.x,
      dz = 210 - ball.z,
      len = Math.hypot(dx, dz),
      yaw = Math.atan2(-dx, -dz);
    await walk(
      p,
      ball.x - (dx / len) * 3.3,
      ball.z - (dz / len) * 3.3,
      true,
      0.8,
    );
    await face(p, yaw);
    await p.keyboard.down("Shift");
    await p.keyboard.down("w");
    await p.waitForTimeout(180);
    await p.keyboard.press("f");
    await p.keyboard.up("w");
    await p.keyboard.up("Shift");
    await p.waitForTimeout(800);
  }
  await q.waitForFunction(
    () => window.qa.snapshot.football.scores.A > 0,
    null,
    { timeout: 8000 },
  );
  assert.ok((await match(p)).scores.A > 0);
  await p.screenshot({ path: "artifacts/public-football-goal.png" });
  console.log("PASS public goal and synchronized score");
  await p.waitForFunction(
    () =>
      window.qa.snapshot.football.ball.x === 68 &&
      window.qa.snapshot.football.ball.z === 241,
    null,
    { timeout: 7000 },
  );
  console.log("PASS public kickoff reset");
  await p.locator("#football-leave").click();
  await q.locator("#football-leave").click();
  await walk(p, 43, 235);
  await walk(p, 28, 235);
  await walk(p, 0, 235);
  await walk(p, 0, 193);
  await walk(p, 43, 193, false, 1);
  await p.keyboard.press("e");
  await p.waitForFunction(
    () =>
      window.qa.snapshot.players.find((p) => p.id === window.qa.id).mode ===
      "helicopter",
  );
  const before = await self(p);
  await p.keyboard.down("Space");
  await p.keyboard.down("q");
  await p.waitForTimeout(1100);
  await p.keyboard.up("Space");
  await p.keyboard.up("q");
  const flying = await self(p);
  assert.ok(flying.y > before.y + 1);
  assert.ok(Math.abs(angle(flying.yaw - before.yaw)) > 0.4);
  await p.keyboard.down("w");
  await p.waitForTimeout(500);
  await p.keyboard.up("w");
  await p.keyboard.down("s");
  await p.waitForTimeout(350);
  await p.keyboard.up("s");
  assert.ok(
    Math.hypot((await self(p)).x - flying.x, (await self(p)).z - flying.z) > 1,
    "helicopter horizontal flight",
  );
  await p.keyboard.down("c");
  await p.waitForTimeout(2800);
  await p.keyboard.up("c");
  await p.waitForTimeout(600);
  await p.keyboard.press("e");
  await p.waitForFunction(
    () =>
      window.qa.snapshot.players.find((p) => p.id === window.qa.id).mode ===
      "walk",
  );
  console.log(
    "PASS public helicopter enter, takeoff, turn, altitude, land and exit",
  );
  assert.deepEqual(errors, []);
  console.log("PASS public world audit without browser errors");
} finally {
  await browser.close();
}
