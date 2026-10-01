// Authoritative production road simulation check. Browser controls are tested separately.
import WebSocket from "ws";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  MAIN_ROAD,
  projectOnRoad,
  roadFrame,
  walkingHeight,
  surfaceHeight,
} from "../shared/roads.js";
const publicURL = new URL(process.env.PARK_URL || "https://parkkerala.online");
const worldURL = new URL("/world", publicURL);
worldURL.protocol = publicURL.protocol === "https:" ? "wss:" : "ws:";
fs.mkdirSync("artifacts", { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const angle = (x) => Math.atan2(Math.sin(x), Math.cos(x));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
async function run(kind) {
  const ws = new WebSocket(worldURL, { origin: publicURL.origin });
  let state,
    id,
    error,
    closed = false,
    seq = 0;
  ws.on("message", (raw) => {
    const d = JSON.parse(raw);
    if (d.type === "welcome") id = d.id;
    if (d.players) state = d;
    if (d.type === "error") error = Error(d.message);
  });
  ws.on("close", () => (closed = true));
  ws.on("error", (e) => (error = e));
  const send = (d) => {
    if (error) throw error;
    if (closed) throw Error("World disconnected");
    ws.send(JSON.stringify(d));
  };
  try {
    await new Promise((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    send({ type: "join", name: `${kind} route QA` });
    while (!id) {
      if (error) throw error;
      await pause(50);
    }
    const vehicleId = kind + "-town";
    let v = state.vehicles.find((v) => v.id === vehicleId);
    assert.equal(v.owner, null);
    const dest = { x: v.x, z: v.z - 4 };
    const start = Date.now();
    while (true) {
      const p = state.players.find((p) => p.id === id);
      const d = Math.hypot(dest.x - p.x, dest.z - p.z);
      if (Math.hypot(v.x - p.x, v.z - p.z) < 5.3) break;
      assert.ok(Date.now() - start < 60000, "setup walking blocked");
      const step = Math.min(d, 0.8),
        x = p.x + ((dest.x - p.x) * step) / d,
        z = p.z + ((dest.z - p.z) * step) / d;
      send({
        type: "move",
        x,
        z,
        y: walkingHeight(x, z),
        yaw: 0,
        moving: false,
        grounded: true,
      });
      await pause(110);
    }
    send({ type: "interact", target: vehicleId });
    const entry = Date.now();
    while (state.players.find((p) => p.id === id).mode !== kind) {
      assert.ok(Date.now() - entry < 10000, "entry timeout");
      await pause(50);
    }
    let previous = projectOnRoad(MAIN_ROAD, v.x, v.z).s,
      progress = 0,
      checkpoint = 0,
      maxError = 0,
      lastAdvance = Date.now();
    const begin = Date.now();
    while (progress < MAIN_ROAD.length + 15) {
      assert.ok(Date.now() - begin < 420000, "route timeout");
      v = state.vehicles.find((v) => v.id === vehicleId);
      assert.equal(v.owner, id);
      const p = projectOnRoad(MAIN_ROAD, v.x, v.z),
        t = roadFrame(MAIN_ROAD, p.s + 9 + Math.max(0, v.speed) * 0.4, -3),
        err = angle(Math.atan2(-(t.x - v.x), -(t.z - v.z)) - v.yaw);
      send({
        type: "input",
        seq: ++seq,
        throttle: clamp((8 - v.speed) * 0.4 + 0.12, 0, 1),
        steer: clamp(err * 1.8, -1, 1),
        brake: v.speed > 10,
      });
      let advance = p.s - previous;
      if (advance < -MAIN_ROAD.length / 2) advance += MAIN_ROAD.length;
      if (advance > MAIN_ROAD.length / 2) advance -= MAIN_ROAD.length;
      progress += advance;
      previous = p.s;
      if (advance > 0.02) lastAdvance = Date.now();
      assert.ok(Date.now() - lastAdvance < 15000, "vehicle stuck");
      if (progress > 130) {
        maxError = Math.max(maxError, Math.abs(p.lateral + 3));
        assert.ok(
          p.distance < MAIN_ROAD.width / 2 + 0.5,
          kind + " left road " + JSON.stringify(v),
        );
        assert.ok(v.y >= surfaceHeight(v.x, v.z) - 0.06, "vehicle below road");
      }
      if (progress >= checkpoint) {
        console.log(
          kind,
          Math.round(progress) + "m",
          Math.round(v.y) + "m elevation",
        );
        checkpoint += 400;
      }
      await pause(100);
    }
    send({ type: "input", seq: ++seq, throttle: 0, steer: 0, brake: true });
    await pause(2000);
    send({ type: "interact", target: vehicleId });
    await pause(500);
    assert.equal(state.players.find((p) => p.id === id).mode, "walk");
    const result = {
      kind,
      pass: true,
      metres: progress,
      seconds: (Date.now() - begin) / 1000,
      maxLaneError: maxError,
    };
    fs.writeFileSync(
      `artifacts/public-route-${kind}.json`,
      JSON.stringify(result, null, 2),
    );
    console.log("PASS production authoritative route", result);
  } finally {
    ws.close();
  }
}
await Promise.all([run("car"), run("bike")]);
