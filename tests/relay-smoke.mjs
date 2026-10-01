import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
// Real relay audit; fake microphone audio only. No production test hooks.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const url = process.env.PARK_URL || "https://parkkerala.online";
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
  const context = await browser.newContext({
      permissions: ["microphone"],
      viewport: { width: 1000, height: 700 },
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ tls }) => {
      window.relayQA = { pcs: [], sources: new Map(), token: null };
      const WS = WebSocket;
      window.WebSocket = class extends WS {
        constructor(...args) {
          super(...args);
          this.addEventListener("message", (e) => {
            const d = JSON.parse(e.data);
            if (d.type === "welcome") window.relayQA.token = d.voiceToken;
          });
        }
      };
      const PC = RTCPeerConnection;
      window.RTCPeerConnection = class extends PC {
        constructor(config) {
          if (tls)
            config.iceServers = (config.iceServers || [])
              .map((s) => ({
                ...s,
                urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) =>
                  /^turns:.*:443(?:\?|$)/.test(u),
                ),
              }))
              .filter((s) => s.urls.length);
          super({ ...config, iceTransportPolicy: "relay" });
          window.relayQA.pcs.push(this);
        }
        setConfiguration(config) {
          if (tls)
            config.iceServers = (config.iceServers || [])
              .map((s) => ({
                ...s,
                urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) =>
                  /^turns:.*:443(?:\?|$)/.test(u),
                ),
              }))
              .filter((s) => s.urls.length);
          super.setConfiguration({ ...config, iceTransportPolicy: "relay" });
        }
      };
      const AC = AudioContext;
      window.AudioContext = class extends AC {
        createMediaStreamSource(stream) {
          const source = super.createMediaStreamSource(stream),
            analyser = this.createAnalyser();
          source.connect(analyser);
          window.relayQA.sources.set(stream.id, analyser);
          return source;
        }
      };
    },
    { tls: process.env.TURN_TRANSPORT === "tls" },
  );
  await page.goto(url);
  await page.locator("#username").fill(name);
  await page.getByRole("button", { name: "Enter Park Kerala" }).click();
  await page.waitForFunction(() => window.relayQA.token);
  const ready = await page.evaluate(async () => {
    const r = await fetch("/api/config", {
      headers: { Authorization: `Bearer ${window.relayQA.token}` },
    });
    return r.ok && (await r.json()).turnConfigured;
  });
  assert.ok(
    ready,
    "TURN provider is not configured; a direct connection cannot pass the relay audit",
  );
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.locator("#quality").selectOption("low");
  await page.getByRole("button", { name: "Back to the world" }).click();
  return page;
}
try {
  const a = await join("Relay Hadi"),
    b = await join("Relay Sinan");
  for (const p of [a, b])
    await p.getByRole("button", { name: "Toggle microphone" }).click();
  for (const p of [a, b])
    await expect
      .poll(
        () =>
          p.evaluate(async () => {
            const q = window.relayQA;
            for (const pc of q.pcs) {
              if (pc.connectionState !== "connected") continue;
              const stats = await pc.getStats();
              let selected,
                bytes = 0;
              for (const r of stats.values()) {
                if (r.type === "transport" && r.selectedCandidatePairId)
                  selected = stats.get(r.selectedCandidatePairId);
                if (r.type === "inbound-rtp" && r.kind === "audio")
                  bytes += r.bytesReceived || 0;
              }
              if (!selected) continue;
              const local = stats.get(selected.localCandidateId),
                remote = stats.get(selected.remoteCandidateId);
              if (
                local?.candidateType !== "relay" ||
                remote?.candidateType !== "relay" ||
                bytes < 100
              )
                continue;
              for (const audio of document.querySelectorAll(
                "audio[data-peer]",
              )) {
                const node = q.sources.get(audio.srcObject?.id);
                if (!node) continue;
                const samples = new Float32Array(node.fftSize);
                node.getFloatTimeDomainData(samples);
                const rms = Math.sqrt(
                  samples.reduce((s, v) => s + v * v, 0) / samples.length,
                );
                if (rms > 0.001) {
                  q.result = {
                    local: local.candidateType,
                    remote: remote.candidateType,
                    protocol: local.relayProtocol || local.protocol,
                    bytes,
                    decodedRms: rms,
                  };
                  return true;
                }
              }
            }
            return false;
          }),
        { timeout: 45000 },
      )
      .toBe(true);
  assert.deepEqual(errors, []);
  console.log(
    "PASS two-way decoded audio over selected relay candidates",
    await a.evaluate(() => window.relayQA.result),
    await b.evaluate(() => window.relayQA.result),
  );
} finally {
  await browser.close();
  rmSync(audioDir, { recursive: true, force: true });
}
