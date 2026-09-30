import { test, expect } from "@playwright/test";
const state = (p: any) => p.evaluate(() => (window as any).__park.state());
async function place(p: any, x: number, z: number, yaw = 0) {
  await p.evaluate(
    ({ x, z, yaw }: any) => {
      (window as any).__park.teleport(x, z);
      (window as any).__park.setYaw(yaw);
    },
    { x, z, yaw },
  );
  await p.waitForTimeout(250);
}
test("two players share football, kick both ways, score and reset without stopping the world", async ({
  browser,
}) => {
  test.setTimeout(100000);
  const a = await browser.newContext(),
    b = await browser.newContext(),
    p = await a.newPage(),
    q = await b.newPage(),
    errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  q.on("pageerror", (e) => errors.push(e.message));
  try {
    for (const [page, name] of [
      [p, "Football Hadi"],
      [q, "Football Sinan"],
    ] as const) {
      await page.goto("/");
      await page.waitForFunction(() => (window as any).__park?.state().ready);
      await page.locator("#username").fill(name);
      await page.getByRole("button", { name: "Enter Park Kerala" }).click();
      await page.waitForFunction(() => (window as any).__park.state().started);
    }
    await place(p, 68, 243);
    await place(q, 73, 241);
    await p.locator("#football-blue").click();
    await q.locator("#football-amber").click();
    await expect
      .poll(async () => (await state(p)).social.snapshot.football.status)
      .toBe("playing");
    const before = (await state(q)).social.snapshot.football.ball.z;
    await p.keyboard.press("f");
    await expect
      .poll(async () => (await state(q)).social.snapshot.football.ball.z)
      .toBeLessThan(before - 2);
    await p.waitForTimeout(1200);
    let ball = (await state(q)).social.snapshot.football.ball;
    await place(q, ball.x, ball.z - 2, Math.PI);
    await q.keyboard.down("w");
    await q.waitForTimeout(120);
    await q.keyboard.up("w");
    await q.keyboard.press("f");
    await expect
      .poll(async () => (await state(p)).social.snapshot.football.ball.vz)
      .toBeGreaterThan(1);
    await p.waitForTimeout(1000);
    const first = (await state(p)).social.snapshot,
      rendered = (await state(p)).social.football.position;
    expect(
      Math.hypot(
        rendered[0] - first.football.ball.x,
        rendered[2] - first.football.ball.z,
      ),
    ).toBeLessThan(2);
    const bus = first.buses[0];
    for (let i = 0; i < 6; i++) {
      ball = (await state(p)).social.snapshot.football.ball;
      if ((await state(p)).social.snapshot.football.scores.A > 0) break;
      const dx = 68 - ball.x,
        dz = 210 - ball.z,
        len = Math.hypot(dx, dz),
        yaw = Math.atan2(-dx, -dz);
      await place(p, ball.x - (dx / len) * 3.5, ball.z - (dz / len) * 3.5, yaw);
      await p.keyboard.down("Shift");
      await p.keyboard.down("w");
      await p.waitForTimeout(220);
      await p.keyboard.press("f");
      await p.keyboard.up("w");
      await p.keyboard.up("Shift");
      await p.waitForTimeout(1800);
      console.log(
        "Shot",
        i,
        (await state(p)).social.snapshot.football.ball,
        (await state(p)).social.snapshot.football.scores,
      );
    }
    await expect
      .poll(async () => (await state(q)).social.snapshot.football.scores.A)
      .toBe(1);
    await expect(q.locator("#football-score")).toContainText("BLUE 1");
    await p.screenshot({ path: "artifacts/football-goal.png" });
    await expect
      .poll(async () => (await state(p)).social.snapshot.football.ball.z, {
        timeout: 7000,
      })
      .toBe(241);
    expect((await state(p)).social.snapshot.buses[0].routeS).not.toBe(
      bus.routeS,
    );
    expect((await state(p)).social.snapshot.vehicles).toHaveLength(25);
    await q.locator("#football-leave").click();
    await expect
      .poll(
        async () =>
          (await state(p)).social.snapshot.football.teams[
            (await state(q)).social.id
          ],
      )
      .toBeUndefined();
    await place(p, 30, 235, -Math.PI / 2);
    await p.screenshot({ path: "artifacts/football-turf.png" });
    expect(errors).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});
