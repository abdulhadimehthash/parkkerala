import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
import { test, expect } from "@playwright/test";

test("credential expiry refreshes existing browser peers and preserves two-way audio", async ({
  playwright,
}) => {
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
      (Math.sin(t * 220 * Math.PI * 2) +
        0.4 * Math.sin(t * 440 * Math.PI * 2)) *
      0.32 *
      (0.65 + 0.35 * Math.sin(t * 5 * Math.PI * 2));
    wav.writeInt16LE(Math.round(wave * 32767), 44 + i * 2);
  }
  writeFileSync(audioPath, wav);
  const browser = await playwright.chromium.launch({
    channel: "chrome",
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${audioPath}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  let generation = 1;
  try {
    const pages = [];
    for (const name of ["Refresh Hadi", "Refresh Sinan"]) {
      const context = await browser.newContext({ permissions: ["microphone"] });
      const page = await context.newPage();
      pages.push(page);
      await page.addInitScript(() => {
        const qa = ((window as any).refreshQA = {
          peers: [],
          restarts: 0,
          requested: 0,
          offers: [],
          configErrors: [],
        });
        const Original = RTCPeerConnection;
        window.RTCPeerConnection = class extends Original {
          constructor(config?: RTCConfiguration) {
            super(config);
            qa.peers.push(this);
          }
          setConfiguration(config: RTCConfiguration) {
            try {
              super.setConfiguration(config);
            } catch (e: any) {
              qa.configErrors.push(e.message);
              throw e;
            }
          }
          restartIce() {
            qa.requested++;
            super.restartIce();
          }
          async createOffer(options?: RTCOfferOptions) {
            qa.offers.push(options || {});
            if (options?.iceRestart) qa.restarts++;
            return super.createOffer(options);
          }
        };
      });
      // This test uses direct local audio plus dummy credentials to exercise renewal.
      // The separate relay-smoke script requires an actual selected relay candidate.
      await page.route("**/api/config", async (route) => {
        const joined = !!route.request().headers().authorization;
        await route.fulfill({
          json: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              ...(joined
                ? [
                    {
                      urls: "turn:127.0.0.1:9?transport=tcp",
                      username: `rotation-${generation}`,
                      credential: `test-${generation}`,
                    },
                  ]
                : []),
            ],
            turnConfigured: joined,
            expiresAt: Date.now() + 3600000,
          },
        });
      });
      await page.goto("/");
      await page.locator("#username").fill(name);
      await page.getByRole("button", { name: "Enter Park Kerala" }).click();
      await page.waitForFunction(
        () => (window as any).__park.state().social.connected,
      );
    }
    for (const page of pages)
      await page.getByRole("button", { name: "Toggle microphone" }).click();
    for (const page of pages)
      await expect
        .poll(
          () =>
            page.evaluate(async () =>
              ((await (window as any).__park.voiceStats()) as any[]).some(
                (s) => s.received > 100 && s.decodedRms > 0.001,
              ),
            ),
          { timeout: 25000 },
        )
        .toBe(true);
    const counts = await Promise.all(
      pages.map((p) =>
        p.evaluate(() => ({
          peers: (window as any).refreshQA.peers.length,
          restarts: (window as any).refreshQA.restarts,
        })),
      ),
    );
    generation = 2;
    for (const page of pages)
      await page.evaluate(() => {
        const original = Date.now.bind(Date);
        Date.now = () => original() + 3600000;
      });
    for (const page of pages)
      await page.waitForFunction(() => {
        const peers = (window as any).refreshQA.peers as RTCPeerConnection[];
        return peers.some(
          (pc) =>
            pc.connectionState === "connected" &&
            pc
              .getConfiguration()
              .iceServers?.some((s) => s.username === "rotation-2"),
        );
      });
    await expect
      .poll(async () => {
        let restarts = 0;
        for (const page of pages)
          restarts += await page.evaluate(
            () => (window as any).refreshQA.restarts,
          );
        return restarts;
      })
      .toBeGreaterThan(counts.reduce((n, c) => n + c.restarts, 0));
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      expect(
        await p.evaluate(() => (window as any).refreshQA.peers.length),
      ).toBe(counts[i].peers);
      expect(
        await p.evaluate(() => (window as any).refreshQA.configErrors),
      ).toEqual([]);
      const before = await p.evaluate(async () =>
        ((await (window as any).__park.voiceStats()) as any[]).reduce(
          (n, s) => n + s.received,
          0,
        ),
      );
      await expect
        .poll(
          () =>
            p.evaluate(async (before) => {
              const stats = await (window as any).__park.voiceStats();
              return (
                stats.reduce((n: number, s: any) => n + s.received, 0) >
                  before + 100 && stats.some((s: any) => s.decodedRms > 0.001)
              );
            }, before),
          { timeout: 10000 },
        )
        .toBe(true);
    }
  } finally {
    await browser.close();
    rmSync(audioDir, { recursive: true, force: true });
  }
});
