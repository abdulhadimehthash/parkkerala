import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../server/game.js";
import { encodeSnapshot } from "../server/snapshot-wire.js";

test("compact snapshots preserve simulation state and bound wire error below a millimetre", () => {
  const game = new Game();
  for (let i = 0; i < 100; i++) game.tick(0.05);
  const original = game.snapshot(),
    raw = JSON.stringify(original),
    encoded = encodeSnapshot(original),
    received = JSON.parse(encoded);
  const compare = (a, b) => {
    if (typeof a === "number") {
      if (Number.isInteger(a)) assert.equal(b, a);
      else assert.ok(Math.abs(a - b) <= 0.00050001, `${a} -> ${b}`);
    } else if (a !== null && typeof a === "object") {
      assert.deepEqual(Object.keys(b), Object.keys(a));
      for (const key of Object.keys(a)) compare(a[key], b[key]);
    } else assert.equal(a, b);
  };
  compare(JSON.parse(raw), received);
  assert.equal(
    JSON.stringify(original),
    raw,
    "serialization cannot alter physics",
  );
  assert.ok(
    encoded.length < raw.length * 0.92,
    "wire size should fall at least 8%",
  );
  console.log(`Snapshot bytes ${raw.length} -> ${encoded.length}`);
});
