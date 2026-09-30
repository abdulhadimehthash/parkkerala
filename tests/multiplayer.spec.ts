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
  await join(hadi, "Hadi QA");
  await join(sinan, "Sinan QA");
  await expect
    .poll(async () =>
      (await state(hadi)).social.remotePlayers.map((p: any) => p.name),
    )
    .toContain("Sinan QA");
  await expect
    .poll(async () =>
      (await state(sinan)).social.remotePlayers.map((p: any) => p.name),
    )
    .toContain("Hadi QA");
  await hold(hadi, "w", 700);
  await expect
    .poll(
      async () =>
        (await state(sinan)).social.remotePlayers.find(
          (p: any) => p.name === "Hadi QA",
        ).position[2],
    )
    .toBeLessThan(27);
  await hold(sinan, "d", 500);
  await expect
    .poll(
      async () =>
        (await state(hadi)).social.remotePlayers.find(
          (p: any) => p.name === "Sinan QA",
        ).position[0],
    )
    .toBeGreaterThan(1);
  const car=(await state(hadi)).social.snapshot.vehicles.find((v:any)=>v.id==='car-town');
  await teleport(hadi, car.x+3, car.z);
  await teleport(sinan, car.x+3, car.z);
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
  const bike=(await state(hadi)).social.snapshot.vehicles.find((v:any)=>v.id==='bike-town');
  await teleport(hadi, bike.x-3, bike.z);
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
      { timeout: 35000 },
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
      { timeout: 35000 },
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
  const browser = await playwright.chromium.launch({
    channel: "chrome",
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
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
  await teleport(q, 0, 53);
  await expect
    .poll(
      async () =>
        (await state(p)).social.voice.find((v: any) => v.id === remoteId)
          ?.volume,
    )
    .toBeLessThan(0.5);
  await teleport(q, 0, 74);
  await expect
    .poll(async () => {
      const v = (await state(p)).social.voice.find(
        (v: any) => v.id === remoteId,
      );
      return !v || v.volume === 0;
    })
    .toBeTruthy();
  await p.getByRole("button", { name: "Toggle microphone" }).click();
  expect((await state(p)).social.mic).toBeFalsy();
  await browser.close();
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
