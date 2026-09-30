import test from "node:test";
import assert from "node:assert/strict";
import { SnapshotBuffer } from "../shared/interpolation.js";
const snap = (seq, time, x, yaw = 0) => ({
  seq,
  time,
  players: [{ id: "a", x, y: 0, z: 0, yaw, mode: "walk" }],
  vehicles: [],
  buses: [],
});
test("snapshot playback rejects old sequences and interpolates shortest rotation", () => {
  const b = new SnapshotBuffer(150);
  b.push(snap(1, 1000, 0, 3.1), 1100);
  b.push(snap(2, 1100, 1, -3.1), 1200);
  assert.equal(b.push(snap(1, 1000, -5), 1300), false);
  const p = b.sample(1300).players[0];
  assert.equal(p.x, 0.5);
  assert.ok(Math.abs(p.yaw - Math.PI) < 0.01);
  assert.equal(b.rejected, 1);
});
test("late packets cannot cause unlimited extrapolation or overwrite a reconnect", () => {
  const b = new SnapshotBuffer(150);
  b.push(snap(1, 1000, 0), 1100);
  b.push(snap(2, 1100, 1), 1200);
  assert.equal(b.sample(5000).players[0].x, 1.8);
  b.clear();
  assert.equal(b.push(snap(1, 10, 30), 6000), true);
  assert.equal(b.sample(6000).players[0].x, 30);
});
