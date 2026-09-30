import { test, expect } from "@playwright/test";
import { worldSeat } from "../shared/world.js";
test("two passengers ride the pitched hill bus from viewpoint to Sarovaram", async ({
  browser,
}) => {
  test.setTimeout(100000);
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const state = (p: any) => p.evaluate(() => (window as any).__park.state());
  try {
    for (const [i, p] of pages.entries()) {
      await p.goto("/");
      await p.waitForFunction(() => (window as any).__park?.state().ready);
      await p.locator("#username").fill("Hill Passenger " + i);
      await p.getByRole("button", { name: "Enter Park Kerala" }).click();
      await p.waitForFunction(() => (window as any).__park.state().started);
    }
    const p = pages[0];
    await expect
      .poll(
        async () =>
          (await state(p)).social.snapshot.buses.some(
            (b: any) => b.stop === "viewpoint" && b.departure > 5,
          ),
        { timeout: 35000 },
      )
      .toBeTruthy();
    const bus = (await state(p)).social.snapshot.buses.find(
      (b: any) => b.stop === "viewpoint" && b.departure > 5,
    );
    for (const q of pages) {
      await q.evaluate(
        (b) => (window as any).__park.teleport(b.x + 3, b.z),
        bus,
      );
      await q.waitForTimeout(200);
      await q.keyboard.press("e");
      await expect.poll(async () => (await state(q)).social.mode).toBe("bus");
    }
    const snap = (await state(p)).social.snapshot,
      seats = snap.players
        .filter((x: any) => x.name.startsWith("Hill Passenger"))
        .map((x: any) => x.seat);
    expect(new Set(seats).size).toBe(2);
    await p.waitForTimeout((bus.departure + 1) * 1000);
    let moving = 0,
      sloped = 0;
    for (let i = 0; i < 130; i++) {
      const s = (await state(p)).social.snapshot,
        b = s.buses.find((x: any) => x.id === bus.id);
      if (b.doors) {
        expect(b.stop).toBe("sarovaram");
        break;
      }
      moving++;
      if (Math.abs(b.pitch) > 0.025) sloped++;
      for (const person of s.players.filter((x: any) =>
        x.name.startsWith("Hill Passenger"),
      )) {
        const expected = worldSeat(b, person.seat);
        expect(
          Math.hypot(
            person.x - expected.x,
            person.y - expected.y,
            person.z - expected.z,
          ),
        ).toBeLessThan(0.01);
        expect(person.y).toBeGreaterThan(25);
      }
      const display = await state(p),
        vehicle = display.social.transports.find((v: any) => v.id === bus.id),
        remote = display.social.remotePlayers.find(
          (r: any) => r.name === "Hill Passenger 1",
        ),
        passenger = display.social.snapshot.players.find(
          (r: any) => r.name === "Hill Passenger 1",
        );
      if (remote && vehicle) {
        const seat = worldSeat(vehicle, passenger.seat);
        expect(
          Math.hypot(
            remote.position[0] - seat.x,
            remote.position[1] - seat.y,
            remote.position[2] - seat.z,
          ),
        ).toBeLessThan(0.015);
      }
      await p.waitForTimeout(300);
    }
    expect(moving).toBeGreaterThan(15);
    expect(sloped).toBeGreaterThan(10);
    for (const q of pages) {
      await q.keyboard.press("e");
      await expect.poll(async () => (await state(q)).social.mode).toBe("walk");
    }
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
