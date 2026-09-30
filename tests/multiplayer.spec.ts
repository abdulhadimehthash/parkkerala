import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
import { test, expect, Page } from "@playwright/test";
const state = (p: Page) => p.evaluate(() => (window as any).__park.state());
async function join(p: Page, name: string) {
  await p.goto("/");
  await p.waitForFunction(() => (window as any).__park?.state().ready);
  await p.locator("#username").fill(name);
  await p.getByRole("button", { name: "Enter Park Kerala" }).click();
  await p.waitForFunction(() => (window as any).__park.state().started);
}
async function teleport(p: Page, x: number, z: number) {
  await p.evaluate(({ x, z }) => (window as any).__park.teleport(x, z), {
    x,
    z,
  });
  await p.waitForTimeout(300);
}
async function hold(p: Page, key: string, ms: number) {
  await p.keyboard.down(key);
  await p.waitForTimeout(ms);
  await p.keyboard.up(key);
}
test("two real clients see usernames, movement, car ownership, bike and helicopter", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext(),
    hadi = await a.newPage(),
    sinan = await b.newPage();
  const errors: string[] = [];
  hadi.on("pageerror", (e) => errors.push(e.message));
  sinan.on("pageerror", (e) => errors.push(e.message));
  await join(hadi, "Hadi Sinan");
  await join(sinan, "Sinan Javeed");
  await expect
    .poll(async () =>
      (await state(hadi)).social.remotePlayers.map((p: any) => p.name),
    )
    .toContain("Sinan Javeed");
  await expect
    .poll(async () =>
      (await state(sinan)).social.remotePlayers.map((p: any) => p.name),
    )
    .toContain("Hadi Sinan");
  expect(
    (await state(sinan)).social.remotePlayers.find(
      (p: any) => p.name === "Hadi Sinan",
    ).displayName,
  ).toBe("ഹാദി സിനാൻ");
  await hold(hadi, "w", 700);
  await expect
    .poll(
      async () =>
        (await state(sinan)).social.remotePlayers.find(
          (p: any) => p.name === "Hadi Sinan",
        ).position[2],
    )
    .toBeLessThan(27);
  await hold(sinan, "d", 500);
  await expect
    .poll(
      async () =>
        (await state(hadi)).social.remotePlayers.find(
          (p: any) => p.name === "Sinan Javeed",
        ).position[0],
    )
    .toBeGreaterThan(1);
  const car = (await state(hadi)).social.snapshot.vehicles.find(
    (v: any) => v.id === "car-town",
  );
  await teleport(hadi, car.x + 3, car.z);
  await teleport(sinan, car.x + 3, car.z);
  await hadi.keyboard.press("e");
  await expect.poll(async () => (await state(hadi)).social.mode).toBe("car");
  await sinan.keyboard.press("e");
  await expect.poll(async () => (await state(sinan)).social.mode).toBe("walk");
  const z = (await state(hadi)).position[2];
  await hold(hadi, "s", 1100);
  await expect
    .poll(
      async () =>
        (await state(sinan)).social.snapshot.vehicles.find(
          (v: any) => v.id === "car-town",
        ).z,
    )
    .toBeGreaterThan(z + 2);
  await hold(hadi, "Space", 900);
  await hadi.keyboard.press("e");
  await expect.poll(async () => (await state(hadi)).social.mode).toBe("walk");
  const bike = (await state(hadi)).social.snapshot.vehicles.find(
    (v: any) => v.id === "bike-town",
  );
  await teleport(hadi, bike.x - 3, bike.z);
  await hadi.keyboard.press("e");
  await expect.poll(async () => (await state(hadi)).social.mode).toBe("bike");
  await hold(hadi, "w", 800);
  await hold(hadi, "Space", 800);
  await hadi.keyboard.press("e");
  await expect.poll(async () => (await state(hadi)).social.mode).toBe("walk");
  await teleport(hadi, 52, 193);
  await hadi.keyboard.press("e");
  await expect
    .poll(async () => (await state(hadi)).social.mode)
    .toBe("helicopter");
  await hold(hadi, "Space", 1500);
  expect((await state(hadi)).position[1]).toBeGreaterThan(3);
  await hadi.keyboard.press("e");
  expect((await state(hadi)).social.mode).toBe("helicopter");
  await hold(hadi, "c", 2700);
  await hadi.keyboard.press("e");
  await expect.poll(async () => (await state(hadi)).social.mode).toBe("walk");
  await teleport(hadi, 520, -259);
  await hold(hadi, "w", 800);
  expect((await state(hadi)).position[1]).toBeGreaterThan(30);
  await hadi.keyboard.press("m");
  await hadi.screenshot({ path: "artifacts/expanded-map.png" });
  await hadi.keyboard.press("Escape");
  await hadi.getByRole("button", { name: "Open settings" }).click();
  await hadi.getByRole("button", { name: "View the roadmap" }).click();
  await expect(
    hadi.getByRole("dialog", { name: "A world growing together." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await a.close();
  await b.close();
});
test("two clients board separate bus seats, travel together and exit at a stop", async ({
  browser,
}) => {
  test.setTimeout(100000);
  const a = await browser.newContext(),
    b = await browser.newContext(),
    p = await a.newPage(),
    q = await b.newPage();
  await join(p, "Bus Hadi");
  await join(q, "Bus Sinan");
  await expect
    .poll(
      async () =>
        (await state(p)).social.snapshot.buses.some(
          (b: any) => b.doors && b.departure > 5,
        ),
      { timeout: 60000 },
    )
    .toBeTruthy();
  const bus = (await state(p)).social.snapshot.buses.find(
    (b: any) => b.doors && b.departure > 5,
  );
  await teleport(p, bus.x + 4, bus.z);
  await teleport(q, bus.x + 4, bus.z);
  await p.keyboard.press("e");
  await q.keyboard.press("e");
  await expect.poll(async () => (await state(p)).social.mode).toBe("bus");
  await expect.poll(async () => (await state(q)).social.mode).toBe("bus");
  const s = (await state(p)).social.snapshot.players;
  expect(s.find((x: any) => x.name === "Bus Hadi").seat).not.toBe(
    s.find((x: any) => x.name === "Bus Sinan").seat,
  );
  const before = (await state(p)).position;
  await p.waitForTimeout((bus.departure + 2) * 1000);
  expect((await state(p)).position).not.toEqual(before);
  await p.keyboard.press("e");
  expect((await state(p)).social.mode).toBe("bus");
  await expect
    .poll(
      async () =>
        (await state(p)).social.snapshot.buses.find((b: any) => b.id === bus.id)
          .doors,
      { timeout: 60000 },
    )
    .toBeTruthy();
  await p.keyboard.press("e");
  await expect.poll(async () => (await state(p)).social.mode).toBe("walk");
  await a.close();
  await b.close();
});
test("live WebRTC audio connects nearby and becomes silent at distance", async ({
  playwright,
}) => {
  test.setTimeout(90000);
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
  const a = await browser.newContext({ permissions: ["microphone"] }),
    b = await browser.newContext({ permissions: ["microphone"] });
  const p = await a.newPage(),
    q = await b.newPage();
  await join(p, "Voice Hadi");
  await join(q, "Voice Sinan");
  await p.getByRole("button", { name: "Toggle microphone" }).click();
  await q.getByRole("button", { name: "Toggle microphone" }).click();
  await expect
    .poll(
      async () =>
        (await state(p)).social.voice.some((v: any) => v.state === "connected"),
      { timeout: 20000 },
    )
    .toBeTruthy();
  await expect
    .poll(async () =>
      (await state(q)).social.voice.some((v: any) => v.state === "connected"),
    )
    .toBeTruthy();
  await expect
    .poll(
      async () =>
        await p.evaluate(async () => {
          const stats = await (window as any).__park.voiceStats();
          return stats.some((s: any) => s.received > 0 && s.sent > 0);
        }),
    )
    .toBeTruthy();
  const remoteId = (await state(q)).social.id;
  expect(
    (await state(p)).social.voice.find((v: any) => v.id === remoteId).volume,
  ).toBe(1);
  for (const [distance, min, max] of [
    [5, 1, 1],
    [25, 0.95, 1],
    [50, 0.6, 0.75],
    [75, 0.1, 0.3],
    [99, 0, 0.002],
    [105, 0, 0],
  ]) {
    await teleport(q, 0, 29 + distance);
    await expect
      .poll(async () => {
        const v = (await state(p)).social.voice.find(
          (v: any) => v.id === remoteId,
        );
        return v?.volume ?? 0;
      })
      .toBeGreaterThanOrEqual(min);
    await expect
      .poll(async () => {
        const v = (await state(p)).social.voice.find(
          (v: any) => v.id === remoteId,
        );
        return v?.volume ?? 0;
      })
      .toBeLessThanOrEqual(max);
  }
  await teleport(q, 20, 29);
  await expect
    .poll(
      async () =>
        (await state(p)).social.voice.find((v: any) => v.id === remoteId)
          ?.pan ?? 0,
    )
    .toBeGreaterThan(0.2);
  await expect
    .poll(async () =>
      (await state(p)).social.snapshot.players.some(
        (v: any) => v.id === remoteId && v.speaking,
      ),
    )
    .toBeTruthy();
  // Force a real signalling reconnect through a transient WebSocket close.
  await q.evaluate(() => {
    (window as any).__park.reconnect();
  });
  await expect
    .poll(async () => (await state(q)).social.id, { timeout: 15000 })
    .not.toBe(remoteId);
  await expect
    .poll(
      async () =>
        await q.evaluate(async () =>
          (await (window as any).__park.voiceStats()).some(
            (s: any) => s.received > 0 && s.sent > 0,
          ),
        ),
      { timeout: 20000 },
    )
    .toBeTruthy()
    .catch(async (e) => {
      console.log(
        "RECONNECT",
        JSON.stringify([(await state(p)).social, (await state(q)).social]),
      );
      throw e;
    });
  await p.getByRole("button", { name: "Toggle microphone" }).click();
  expect((await state(p)).social.mic).toBeFalsy();
  await browser.close();
  rmSync(audioDir, { recursive: true, force: true });
});
test("microphone denial leaves mic off and explains the browser permission", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () =>
        Promise.reject(new DOMException("Denied", "NotAllowedError")),
    });
  });
  await join(page, "Denied mic");
  await page.getByRole("button", { name: "Toggle microphone" }).click();
  await expect(page.locator("#toast")).toContainText("permission denied");
  expect((await state(page)).social.mic).toBeFalsy();
  await context.close();
});

test("distributed public vehicles are reachable and all four helicopters fly", async ({
  page,
}) => {
  await join(page, "Transport survey");
  await page.waitForTimeout(600);
  const vehicles = (await state(page)).social.snapshot.vehicles;
  expect(vehicles.filter((v: any) => v.kind === "car")).toHaveLength(7);
  expect(vehicles.filter((v: any) => v.kind === "bike")).toHaveLength(14);
  expect(vehicles.filter((v: any) => v.kind === "helicopter")).toHaveLength(4);
  for (const v of vehicles) {
    const current = (await state(page)).social.snapshot.vehicles.find(
      (s: any) => s.id === v.id,
    );
    await teleport(page, current.x + 3.9, current.z);
    await page.keyboard.press("e");
    await expect
      .poll(async () => (await state(page)).social.mode, { message: v.id })
      .toBe(v.kind);
    if (v.kind === "helicopter") {
      const before = (await state(page)).position[1];
      await hold(page, "Space", 800);
      expect((await state(page)).position[1]).toBeGreaterThan(before + 1);
      await hold(page, "c", 2000);
    }
    await page.keyboard.press("e");
    await expect
      .poll(async () => (await state(page)).social.mode, {
        message: v.id + " exit",
      })
      .toBe("walk");
  }
});
test("fast sprint jumps retain forward momentum and terrain movement stays grounded", async ({
  page,
}) => {
  await join(page, "Movement survey");
  await page.waitForTimeout(600);
  await teleport(page, 0, 193);
  await page.evaluate(() => (window as any).__park.setYaw(0));
  const before = await state(page);
  await hold(page, "w", 1000);
  const walk = await state(page);
  expect(before.position[2] - walk.position[2]).toBeGreaterThan(7);
  await page.keyboard.down("Shift");
  await page.keyboard.down("w");
  await page.waitForTimeout(800);
  const run = await state(page);
  expect(walk.position[2] - run.position[2]).toBeGreaterThan(10);
  await page.keyboard.press("Space");
  await page.keyboard.up("w");
  await page.keyboard.up("Shift");
  await page.waitForTimeout(240);
  const airborne = await state(page);
  expect(airborne.grounded).toBeFalsy();
  expect(run.position[2] - airborne.position[2]).toBeGreaterThan(2.5);
  await page.keyboard.down("Shift");
  await page.keyboard.down("w");
  await page.waitForTimeout(750);
  expect((await state(page)).grounded).toBeTruthy();
  expect(
    airborne.position[2] - (await state(page)).position[2],
  ).toBeGreaterThan(8);
  await page.keyboard.up("w");
  await page.keyboard.up("Shift");
  for (const [x, z, key] of [
    [150, -235, "w"],
    [150, -268, "s"],
    [515, -259, "w"],
  ] as const) {
    await teleport(page, x, z);
    await page.evaluate(() => (window as any).__park.setYaw(0));
    const start = await state(page);
    await hold(page, key, 1000);
    const end = await state(page);
    expect(Math.abs(end.position[2] - start.position[2])).toBeGreaterThan(6);
    expect(end.grounded).toBeTruthy();
    if (key === "w" && x === 150)
      expect(end.position[1]).toBeGreaterThan(start.position[1]);
    if (key === "s") expect(end.position[1]).toBeLessThan(start.position[1]);
  }
});
