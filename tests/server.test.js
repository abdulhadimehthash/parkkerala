import { groundPose } from "../shared/roads.js";
import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../server/game.js";
import { heightAt, voiceVolume, sanitizeName, STOPS } from "../shared/world.js";
import {
  stepVehicle,
  createBusSchedule,
  busAt,
  countdown,
} from "../shared/simulation.js";
function setup() {
  let now = 0;
  const game = new Game({ now: () => now });
  return {
    game,
    advance: (seconds) => {
      for (let i = 0; i < seconds * 20; i++) {
        now += 50;
        game.tick(0.05);
      }
    },
  };
}
test("username validation and capacity are bounded", () => {
  const { game } = setup();
  assert.throws(() => game.add(" < > "));
  assert.equal(sanitizeName("<Hadi>"), "Hadi");
  game.add("Hadi");
  assert.throws(() => game.add("hadi"));
  assert.equal(sanitizeName("x".repeat(40)).length, 20);
});
test("only one driver can claim a vehicle and disconnect frees it", () => {
  const { game } = setup(),
    a = game.add("Hadi"),
    b = game.add("Sinan"),
    v = game.vehicles[0];
  Object.assign(a, { x: v.x, z: v.z });
  Object.assign(b, { x: v.x, z: v.z });
  game.interact(a.id, v.id);
  assert.throws(() => game.interact(b.id, v.id), /driver/);
  game.remove(a.id);
  game.interact(b.id, v.id);
  assert.equal(v.owner, b.id);
  game.input(b.id, { throttle: 1 });
  for (let i = 0; i < 20; i++) game.tick(0.05);
  assert.notEqual(v.z, 54);
  game.input(b.id, { brake: true });
  for (let i = 0; i < 30; i++) game.tick(0.05);
  game.exit(b.id);
  assert.equal(b.mode, "walk");
});
test("server rejects invalid positions, distant claims and malformed input", () => {
  const { game } = setup(),
    a = game.add("Hadi");
  game.move(a.id, { x: NaN, y: 0, z: 0, yaw: 0 });
  assert.equal(a.x, 0);
  game.move(a.id, { x: 600, y: 1, z: -500, yaw: 0 });
  assert.equal(a.x, 0);
  assert.throws(() => game.interact(a.id, "car-park"), /closer/);
  game.input(a.id, { throttle: Infinity });
});
test("20 unique bus seats, full rejection, stop-only exit and disconnect cleanup", () => {
  const { game, advance } = setup(),
    bus = game.buses.find((b) => b.stop === "town");
  const players = [];
  for (let i = 0; i < 21; i++) {
    const p = game.add("Guest " + i);
    Object.assign(p, { x: bus.x + 4, y: bus.y, z: bus.z });
    players.push(p);
    if (i < 20) game.interact(p.id, bus.id);
  }
  assert.equal(new Set(players.slice(0, 20).map((p) => p.seat)).size, 20);
  assert.throws(() => game.interact(players[20].id, bus.id), /BUS FULL/);
  game.remove(players[4].id);
  game.interact(players[20].id, bus.id);
  assert.equal(players[20].seat, 4);
  advance(16);
  assert.equal(game.buses.find((b) => b.id === bus.id).doors, false);
  assert.throws(() => game.exit(players[0].id), /next bus stop/);
  assert.notEqual(players[0].x, bus.x);
});
test("bus countdown decreases and every stop has scheduled open doors", () => {
  const schedule = createBusSchedule(30);
  assert.equal(schedule.interval, 30);
  for (const stop of STOPS) {
    const next = countdown(schedule, 17, stop.id);
    assert.ok(Number.isFinite(next));
    let found = false;
    for (let t = 0; t < schedule.cycle; t += 0.5)
      for (let i = 0; i < schedule.fleet; i++) {
        const b = busAt(schedule, t, i);
        if (b.stop === stop.id && b.doors) found = true;
      }
    assert.ok(found, stop.name);
  }
  const t = Array.from({ length: 30 }, (_, i) => i).find(
    (t) => countdown(schedule, t, "viewpoint") > 6,
  );
  const start = countdown(schedule, t, "viewpoint"),
    later = countdown(schedule, t + 3, "viewpoint");
  assert.equal(start - later, 3);
});
test("terrain is elevated and stable vehicle physics follows slopes", () => {
  assert.equal(heightAt(0, 0), 0);
  assert.ok(heightAt(335, -400) > 25);
  assert.ok(heightAt(459, -260) > 35);
  const v = {
    kind: "car",
    x: 150,
    z: -230,
    y: heightAt(150, -230),
    yaw: 0,
    speed: 0,
    pitch: 0,
    vy: 0,
  };
  for (let i = 0; i < 120; i++)
    stepVehicle(v, { throttle: 1, steer: 0 }, 0.05, []);
  assert.equal(v.y, groundPose(v.x, v.z, v.yaw, v.kind).y);
  assert.ok(v.z < -245);
  const before = v.z;
  for (let i = 0; i < 20; i++) stepVehicle(v, { brake: true }, 0.05, []);
  assert.ok(v.z < before);
  assert.ok(Math.abs(v.speed) < 1);
});
test("100m proximity attenuation is smooth, audible at 75m and silent beyond 100m", () => {
  const distances = [5, 25, 50, 75, 99, 100, 110];
  const volumes = distances.map(voiceVolume);
  assert.equal(volumes[0], 1);
  assert.ok(volumes[1] > 0.95);
  assert.ok(volumes[2] > 0.6);
  assert.ok(volumes[3] > 0.1);
  assert.ok(volumes[4] > 0 && volumes[4] < 0.002);
  assert.equal(volumes[5], 0);
  assert.equal(volumes[6], 0);
  for (let i = 1; i < volumes.length; i++)
    assert.ok(volumes[i] <= volumes[i - 1]);
});

test("curated Malayalam names preserve originals and safely fall back", () => {
  const { game } = setup();
  for (const [name, expected] of [
    ["Hadi", "ഹാദി"],
    ["Sinan", "സിനാൻ"],
    ["Javeed", "ജാവീദ്"],
    ["Xyqwerty", "Xyqwerty"],
    ["ഹാദി", "ഹാദി"],
  ]) {
    const p = game.add(name);
    assert.equal(p.originalUsername, name);
    assert.equal(p.displayNameMalayalam, expected);
  }
});
test("continuous arrivals stay 30 seconds apart at every stop for 30 simulated minutes", () => {
  const schedule = createBusSchedule();
  assert.ok(schedule.fleet > 2);
  const arrivals = Object.fromEntries(STOPS.map((s) => [s.id, []]));
  const previous = new Map();
  for (let t = 0; t < 1800; t += 0.25) {
    const buses = Array.from({ length: schedule.fleet }, (_, i) =>
      busAt(schedule, t, i),
    );
    for (const b of buses) {
      if (b.doors && previous.get(b.id) !== b.stop) arrivals[b.stop].push(t);
      previous.set(b.id, b.stop);
    }
    for (let i = 0; i < buses.length; i++)
      for (let j = i + 1; j < buses.length; j++)
        assert.ok(
          Math.hypot(buses[i].x - buses[j].x, buses[i].z - buses[j].z) > 4.3,
          "buses overlap",
        );
  }
  for (const [id, times] of Object.entries(arrivals)) {
    assert.ok(times.length >= 59, id);
    for (let i = 2; i < times.length; i++)
      assert.ok(Math.abs(times[i] - times[i - 1] - 30) < 0.3, id);
  }
});
test("full bus leaves the public world open and next bus accepts the waiting passenger", () => {
  const { game, advance } = setup(),
    bus = game.buses.find((b) => b.stop === "town");
  for (let i = 0; i < 20; i++) {
    const p = game.add("Rider " + i);
    Object.assign(p, { x: bus.x + 4, z: bus.z });
    game.interact(p.id, bus.id);
  }
  const waiting = game.add("Waiting");
  Object.assign(waiting, { x: bus.x + 4, z: bus.z });
  assert.throws(() => game.interact(waiting.id, bus.id), /Next bus/);
  assert.equal(waiting.mode, "walk");
  assert.equal(
    game.snapshot().stops.find((s) => s.id === "town").state,
    "full",
  );
  assert.equal(game.snapshot().stops.find((s) => s.id === "town").next, 30);
  advance(30);
  const next = game.buses.find((b) => b.stop === "town");
  assert.notEqual(next.id, bus.id);
  game.interact(waiting.id, next.id);
  assert.equal(waiting.mode, "bus");
});
test("abandoned vehicles reset while owned vehicles remain with their driver", () => {
  let now = 0;
  const game = new Game({ now: () => now, respawnSeconds: 30 });
  const v = game.vehicles[0],
    home = { x: v.x, z: v.z };
  v.x = 200;
  v.z = 220;
  now = 31000;
  game.tick(0.05);
  assert.equal(v.x, home.x);
  assert.equal(v.z, home.z);
  const p = game.add("Driver");
  Object.assign(p, { x: v.x, z: v.z });
  game.interact(p.id, v.id);
  v.x = 200;
  v.z = 220;
  now = 62000;
  game.tick(0.05);
  assert.equal(v.x, 200);
  assert.equal(v.owner, p.id);
});
