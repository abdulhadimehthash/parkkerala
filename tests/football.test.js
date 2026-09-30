import test from "node:test";
import assert from "node:assert/strict";
import { FootballMatch } from "../shared/football.js";
import { FOOTBALL as F } from "../shared/football-config.js";
const player = (id, x = F.x, z = F.z + 2) => ({
  id,
  x,
  y: 0.25,
  z,
  yaw: 0,
  mode: "walk",
  grounded: true,
  moving: false,
  sprinting: false,
});
test("one authoritative ball, balanced teams, five seats each and cleanup", () => {
  const match = new FootballMatch(),
    players = new Map();
  for (let i = 0; i < 10; i++) {
    const p = player("p" + i);
    players.set(p.id, p);
    match.join(p, i % 2 ? "B" : "A", 1000);
  }
  assert.equal(match.status, "playing");
  assert.equal(match.snapshot(1000).remaining, 300);
  assert.throws(() => match.join(player("extra"), "A", 1000), /full/);
  assert.throws(() => match.join(player("far", 0, 0), "A", 1000), /turf/);
  match.leave(players.get("p0"));
  match.join(player("extra"), "A", 1000);
  assert.equal(match.teams.size, 10);
  match.tick(0.05, 2000, new Map());
  assert.equal(match.teams.size, 0);
});
test("kick validates team, distance, facing, grounded state and cooldown; running is stronger", () => {
  const m = new FootballMatch(),
    p = player("a");
  assert.throws(() => m.kick(p, 1000), /Join/);
  m.join(p, "A", 1000);
  p.yaw = Math.PI;
  assert.equal(m.kick(p, 1000), false);
  p.yaw = 0;
  assert.equal(m.kick(p, 1000), true);
  const touch = Math.hypot(m.ball.vx, m.ball.vz);
  assert.equal(m.kick(p, 1100), false);
  m.ball = m.centerBall();
  p.sprinting = true;
  assert.equal(m.kick(p, 1500), true);
  assert.ok(Math.hypot(m.ball.vx, m.ball.vz) > touch);
  p.grounded = false;
  assert.equal(m.kick(p, 1900), false);
});
test("ball rolls, slows, bounces on boundaries and scores only after fully crossing", () => {
  const m = new FootballMatch(),
    p = player("a");
  m.join(p, "A", 0);
  m.kick(p, 1000);
  const players = new Map([[p.id, p]]);
  for (let i = 0; i < 10; i++) m.tick(0.05, 1000 + i * 50, players);
  assert.ok(m.ball.z < F.z - 3);
  assert.ok(Math.abs(m.ball.vz) < 11);
  m.ball = { ...m.centerBall(), x: F.x + F.width / 2 - 0.1, vx: 20 };
  m.tick(0.05, 2000, players);
  assert.ok(m.ball.vx < 0);
  m.ball = {
    ...m.centerBall(),
    z: F.z - F.length / 2 - F.radius + 0.02,
    vz: 0,
  };
  m.tick(0.001, 3000, players);
  assert.equal(m.scores.A, 0);
  m.ball.vz = -3;
  m.tick(0.05, 3050, players);
  assert.equal(m.scores.A, 1);
  assert.equal(m.goal, "A");
  for (let i = 0; i < 20; i++) m.tick(0.05, 3100 + i * 50, players);
  assert.equal(m.scores.A, 1);
  m.tick(0.05, 7051, players);
  assert.equal(m.ball.z, F.z);
  assert.equal(m.goal, null);
  m.ball = {
    ...m.centerBall(),
    x: F.x + 9,
    z: F.z - F.length / 2 + 0.1,
    vz: -20,
  };
  m.tick(0.05, 8000, players);
  assert.equal(m.scores.A, 1);
  assert.ok(m.ball.vz > 0);
});
test("match ends after five minutes and can start again", () => {
  const m = new FootballMatch(),
    a = player("a"),
    b = player("b"),
    players = new Map([
      [a.id, a],
      [b.id, b],
    ]);
  m.join(a, "A", 0);
  m.join(b, "B", 0);
  m.tick(0.05, 300001, players);
  assert.equal(m.status, "finished");
  m.leave(b);
  m.join(b, "B", 300050);
  assert.equal(m.status, "playing");
  assert.equal(m.snapshot(300050).remaining, 300);
});
