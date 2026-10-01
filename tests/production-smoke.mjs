import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
// Runs real browser clients against the public build, without development hooks.
// Uses synthetic audio; never opens the operator's real microphone.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { voiceVolume } from "../shared/world.js";
const url = process.env.PARK_URL || "https://parkkerala.onrender.com";
const audioDir = mkdtempSync(pathJoin(tmpdir(), "park-voice-"));
const audioPath = pathJoin(audioDir, "speech-signal.wav");
const samples = 48000 * 2,
  wav = Buffer.alloc(44 + samples * 2);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(48000, 24);
wav.writeUInt32LE(96000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) {
  const t = i / 48000;
  const wave =
    (Math.sin(t * 220 * Math.PI * 2) + 0.4 * Math.sin(t * 440 * Math.PI * 2)) *
    0.32 *
    (0.65 + 0.35 * Math.sin(t * 5 * Math.PI * 2));
  wav.writeInt16LE(Math.round(wave * 32767), 44 + i * 2);
}
writeFileSync(audioPath, wav);
const browser = await chromium.launch({
  channel: "chrome",
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${audioPath}`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const errors = [];
async function join(name) {
  const ctx = await browser.newContext({
      permissions: ["microphone"],
      viewport: { width: 1000, height: 700 },
    }),
    p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.addInitScript(() => {
    window.qa = {
      snapshot: null,
      id: null,
      pcs: [],
      gains: {},
      decoded: {},
      socket: null,
    };
    const WS = window.WebSocket;
    window.WebSocket = class extends WS {
      constructor(...args) {
        super(...args);
        window.qa.socket = this;
        window.qa.url = args[0].toString();
        this.addEventListener("message", (e) => {
          const d = JSON.parse(e.data);
          if (d.type === "welcome") window.qa.id = d.id;
          if (d.players) window.qa.snapshot = d;
        });
      }
    };
    const PC = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends PC {
      constructor(...args) {
        super(...args);
        window.qa.pcs.push(this);
      }
    };
    const streams = new WeakMap();
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (target, ...args) {
      const id =
        this instanceof MediaStreamAudioSourceNode
          ? this.mediaStream.id
          : streams.get(this);
      if (
        this instanceof MediaStreamAudioSourceNode &&
        target instanceof AnalyserNode
      )
        window.qa.decoded[id] = target;
      if (id && target instanceof AudioNode) {
        streams.set(target, id);
        if (target instanceof GainNode) window.qa.gains[id] = target;
      }
      return connect.call(this, target, ...args);
    };
  });
  await p.goto(url);
  await p.locator("#username").fill(name);
  await p.getByRole("button", { name: "Enter Park Kerala" }).click();
  await p.waitForFunction(() => window.qa.id, null, { timeout: 30000 });
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: "Open settings" }).click();
  await p.locator("#quality").selectOption("low");
  await p.getByRole("button", { name: "Back to the world" }).click();
  return p;
}
const self = (p) =>
  p.evaluate(() =>
    window.qa.snapshot.players.find((p) => p.id === window.qa.id),
  );
async function hold(p, key, ms) {
  await p.keyboard.down(key);
  await p.waitForTimeout(ms);
  await p.keyboard.up(key);
  await p.waitForTimeout(250);
}
async function audioFlow(p) {
  await expect
    .poll(
      () =>
        p.evaluate(async () => {
          for (const pc of window.qa.pcs) {
            if (pc.connectionState !== "connected") continue;
            let sent = 0,
              received = 0;
            for (const s of (await pc.getStats()).values()) {
              if (s.type === "outbound-rtp") sent += s.bytesSent || 0;
              if (s.type === "inbound-rtp") received += s.bytesReceived || 0;
            }
            if (sent > 100 && received > 100) {
              for (const node of Object.values(window.qa.decoded)) {
                const samples = new Float32Array(node.fftSize);
                node.getFloatTimeDomainData(samples);
                if (
                  Math.sqrt(
                    samples.reduce((n, v) => n + v * v, 0) / samples.length,
                  ) > 0.001
                )
                  return true;
              }
            }
          }
          return false;
        }),
      { timeout: 30000 },
    )
    .toBe(true);
}
try {
  const p = await join("Hadi"),
    q = await join("Sinan");
  await p.waitForFunction(() =>
    window.qa.snapshot.players.some((p) => p.name === "Sinan"),
  );
  assert.match(await p.evaluate(() => window.qa.url), /^wss:/);
  assert.equal(await p.evaluate(() => window.__park), undefined);
  assert.equal((await self(p)).mic, false);
  assert.equal((await self(p)).displayNameMalayalam, "ഹാദി");
  assert.equal((await self(q)).displayNameMalayalam, "സിനാൻ");
  assert.equal(await p.evaluate(() => window.qa.snapshot.interval), 30);
  const vehicles = await p.evaluate(() => window.qa.snapshot.vehicles),
    buses = await p.evaluate(() => window.qa.snapshot.buses);
  assert.equal(vehicles.length, 25);
  assert.equal(buses.length, 8);
  assert.ok(buses.every((b) => b.seats.length === 20));
  console.log(
    "PASS HTTPS/WSS, public usernames/Malayalam, 25 vehicles, 8 buses, 20 seats each, no production test hooks",
  );
  await p.getByRole("button", { name: "Toggle microphone" }).click();
  await q.getByRole("button", { name: "Toggle microphone" }).click();
  await audioFlow(p);
  await audioFlow(q);
  console.log("PASS bidirectional public WebRTC audio");
  const other = (await self(q)).id;
  await q.keyboard.down("s");
  for (const target of [5, 25, 50, 75, 99, 105]) {
    await p.waitForFunction(
      ({ id, target }) => {
        const a = window.qa.snapshot.players.find((a) => a.id === window.qa.id),
          b = window.qa.snapshot.players.find((b) => b.id === id);
        return b && Math.hypot(a.x - b.x, a.z - b.z) >= target;
      },
      { id: other, target },
      { timeout: 18000 },
    );
    const sample = await p.evaluate((id) => {
      const a = window.qa.snapshot.players.find((a) => a.id === window.qa.id),
        b = window.qa.snapshot.players.find((b) => b.id === id),
        el = document.querySelector(`audio[data-peer="${id}"]`);
      return {
        distance: Math.hypot(a.x - b.x, a.z - b.z),
        gain: el
          ? (window.qa.gains[el.srcObject?.id]?.gain.value ?? el.volume)
          : 0,
      };
    }, other);
    // Account for the gain ramp and 10Hz server snapshots during continuous movement.
    assert.ok(
      Math.abs(sample.gain - voiceVolume(sample.distance)) < 0.12,
      JSON.stringify(sample),
    );
    console.log("PASS voice range", target, sample);
  }
  await q.keyboard.up("s");
  await q.waitForTimeout(700);
  await p.getByRole("button", { name: "Toggle microphone" }).click();
  await q.getByRole("button", { name: "Toggle microphone" }).click();
  await p.waitForFunction(
    () =>
      window.qa.snapshot.players.find((p) => p.id === window.qa.id)?.mic ===
      false,
  );
  assert.equal((await self(p)).mic, false);
  console.log("PASS mute");
  await p.keyboard.press("m");
  await p.screenshot({ path: "artifacts/live-world-map.png" });
  await p.keyboard.press("Escape");
  const car = vehicles.find((v) => v.id === "car-town");
  if (Math.hypot(car.x - 21, car.z - 54) < 2 && !car.owner) {
    await p.keyboard.down("s");
    await p.keyboard.down("d");
    await p.waitForTimeout(3500);
    await p.keyboard.up("s");
    await p.keyboard.up("d");
    await p.waitForTimeout(300);
    await p.keyboard.press("e");
    await p.waitForFunction(
      () =>
        window.qa.snapshot.players.find((p) => p.id === window.qa.id).mode ===
        "car",
      null,
      { timeout: 7000 },
    );
    const before = await self(p);
    await hold(p, "s", 1200);
    assert.ok(
      Math.hypot((await self(p)).x - before.x, (await self(p)).z - before.z) >
        2,
    );
    await hold(p, "Space", 1200);
    await p.keyboard.press("e");
    await p.waitForFunction(
      () =>
        window.qa.snapshot.players.find((p) => p.id === window.qa.id).mode ===
        "walk",
    );
    console.log("PASS production car enter/drive/brake/exit");
  } else console.log("SKIP car smoke: public car currently moved or in use");
  for (const page of [p, q]) {
    await page.getByRole("button", { name: "Open settings" }).click();
    await page
      .getByRole("button", { name: "Return to the town square" })
      .click();
    await page.waitForTimeout(500);
    await page.keyboard.down("d");
    await page.keyboard.down("s");
    await page.waitForTimeout(500);
    await page.keyboard.up("s");
    await page.waitForTimeout(2100);
    await page.keyboard.up("d");
    await page.waitForTimeout(300);
  }
  await p.waitForFunction(
    () =>
      window.qa.snapshot.buses.some(
        (b) => b.stop === "town" && b.departure > 4,
      ),
    null,
    { timeout: 35000 },
  );
  await p.keyboard.press("e");
  await q.keyboard.press("e");
  for (const page of [p, q])
    await page.waitForFunction(
      () =>
        window.qa.snapshot.players.find((p) => p.id === window.qa.id).mode ===
        "bus",
      null,
      { timeout: 7000 },
    );
  const riderA = await self(p),
    riderB = await self(q);
  assert.equal(riderA.vehicleId, riderB.vehicleId);
  assert.notEqual(riderA.seat, riderB.seat);
  console.log(
    "PASS production shared bus boarding and exclusive seats",
    riderA.seat,
    riderB.seat,
  );
  await p.waitForFunction(
    (id) => window.qa.snapshot.buses.find((b) => b.id === id)?.doors === false,
    riderA.vehicleId,
    { timeout: 10000 },
  );
  await p.waitForTimeout(1800);
  assert.ok(
    Math.hypot((await self(p)).x - riderA.x, (await self(p)).z - riderA.z) > 2,
  );
  await p.keyboard.press("e");
  await p.waitForTimeout(500);
  assert.equal((await self(p)).mode, "bus");
  await p.waitForFunction(
    (id) => window.qa.snapshot.buses.find((b) => b.id === id)?.doors === true,
    riderA.vehicleId,
    { timeout: 45000 },
  );
  await p.keyboard.press("e");
  await q.keyboard.press("e");
  for (const page of [p, q])
    await page.waitForFunction(
      () =>
        window.qa.snapshot.players.find((p) => p.id === window.qa.id).mode ===
        "walk",
    );
  console.log("PASS production synchronized bus ride and stop-only exit");
  await p.screenshot({ path: "artifacts/live-gameplay.png" });
  assert.deepEqual(errors, []);
  console.log("PASS no browser errors");
} finally {
  await browser.close();
  rmSync(audioDir, { recursive: true, force: true });
}
