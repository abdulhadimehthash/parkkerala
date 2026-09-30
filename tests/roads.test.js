import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ROADS,
  MAIN_ROAD,
  ROAD_STOPS,
  roadFrame,
  projectOnRoad,
  laneOffset,
  groundPose,
  wheelGeometry,
  surfaceHeight,
  nearestRoad,
  validateRoads,
  clearRoadFootprint,
} from "../shared/roads.js";
import {
  stepVehicle,
  blockedAt,
  createBusSchedule,
  busAt,
  BusRecovery,
} from "../shared/simulation.js";
import { VEHICLE_SPAWNS } from "../shared/world.js";
const colliders = JSON.parse(
  fs.readFileSync(new URL("../shared/colliders.json", import.meta.url)),
);
const angle = (x) => Math.atan2(Math.sin(x), Math.cos(x));
function wheelGaps(v) {
  const { half, width, hub, radius } = wheelGeometry(v.kind || "bus"),
    gaps = [];
  for (const xx of [-width, width])
    for (const zz of [-half, half]) {
      const z = hub * Math.sin(v.pitch) + zz * Math.cos(v.pitch),
        y = v.y + hub * Math.cos(v.pitch) - zz * Math.sin(v.pitch) - radius;
      const wx = v.x + xx * Math.cos(v.yaw) + z * Math.sin(v.yaw),
        wz = v.z - xx * Math.sin(v.yaw) + z * Math.cos(v.yaw);
      gaps.push(y - surfaceHeight(wx, wz));
    }
  return gaps;
}
test("all road profiles are continuous with bounded grades and rounded turns", () => {
  assert.deepEqual(validateRoads(), []);
  for (const road of ROADS) {
    let previous = null;
    for (let s = 1; s < road.length - 2; s += 1) {
      const p = roadFrame(road, s),
        q = roadFrame(road, s + 1);
      assert.ok(Math.abs(q.y - p.y) < 0.145, road.id + " grade");
      if (previous)
        assert.ok(
          Math.abs(angle(p.yaw - previous.yaw)) < 0.17,
          road.id + " turn",
        );
      previous = p;
    }
  }
});
test("entire bus lane and every spawn is clear, stop shelters are outside the corridor", () => {
  for (let s = 0; s < MAIN_ROAD.length; s += 1) {
    const f = roadFrame(MAIN_ROAD, s, laneOffset(s)),
      p = { ...f, ...groundPose(f.x, f.z, f.yaw, "bus") };
    assert.equal(
      blockedAt(p.x, p.z, p.y, 1.7, colliders),
      false,
      "blocked route metre " + s,
    );
    assert.ok(nearestRoad(p.x, p.z).edge <= 0);
  }
  for (const v of VEHICLE_SPAWNS)
    assert.equal(
      blockedAt(
        v.x,
        v.z,
        surfaceHeight(v.x, v.z),
        v.kind === "helicopter" ? 3 : v.kind === "car" ? 1.4 : 0.7,
        colliders,
      ),
      false,
      v.id,
    );
  for (const stop of ROAD_STOPS)
    assert.equal(
      clearRoadFootprint(stop.shelter.x, stop.shelter.z, 4, 4),
      false,
      stop.id,
    );
});
test("bridge contact uses the deck surface instead of ground, on both crossings", () => {
  for (const x of [0, 150])
    for (let z = -107; z <= -77; z += 2) {
      assert.ok(surfaceHeight(x, z) >= 0.359);
      for (const kind of ["car", "bike", "bus"]) {
        const v = { x, z, yaw: 0, kind, ...groundPose(x, z, 0, kind) };
        assert.ok(Math.min(...wheelGaps(v)) >= -1e-6);
      }
    }
});
test("eight buses complete four loops with no wheel penetration, blockage or normal recovery", () => {
  const schedule = createBusSchedule(),
    recovery = new BusRecovery(),
    stops = new Map();
  assert.equal(schedule.fleet, 8);
  for (let t = 0; t < schedule.cycle * 4; t += 0.2) {
    const buses = [];
    for (let i = 0; i < schedule.fleet; i++) {
      const b = recovery.update(busAt(schedule, t, i), t);
      buses.push(b);
      assert.ok(Math.min(...wheelGaps(b)) >= -1e-5, "wheel underground");
      assert.equal(
        blockedAt(b.x, b.z, b.y, 1.7, colliders),
        false,
        "bus obstruction",
      );
      if (b.doors) stops.set(`${i}:${b.stop}`, true);
    }
    for (let i = 0; i < buses.length; i++)
      for (let j = i + 1; j < buses.length; j++)
        assert.ok(
          Math.hypot(buses[i].x - buses[j].x, buses[i].z - buses[j].z) > 10,
          "bus spacing",
        );
  }
  assert.equal(stops.size, ROAD_STOPS.length * schedule.fleet);
  assert.equal(recovery.recoveries, 0);
});
test("fallback restores a damaged bus to its last valid route sample", () => {
  const recovery = new BusRecovery(),
    schedule = createBusSchedule(),
    a = busAt(schedule, 15, 0);
  recovery.update(a, 15);
  const b = { ...a, x: NaN, y: -100, routeS: NaN };
  recovery.update(b, 15.05);
  assert.ok(Number.isFinite(b.x));
  assert.ok(b.y >= surfaceHeight(b.x, b.z));
  assert.equal(recovery.recoveries, 1);
});
for (const kind of ["car", "bike"])
  test(
    kind + " drives a complete 2km loop using steering, throttle and collision",
    () => {
      const start = roadFrame(MAIN_ROAD, ROAD_STOPS[0].s + 12, -3),
        v = {
          id: "road-test",
          kind,
          ...start,
          ...groundPose(start.x, start.z, start.yaw, kind),
          speed: 0,
          vy: 0,
        };
      let previous = start.s,
        progress = 0,
        stalled = 0,
        maxCrossTrack = 0;
      for (let tick = 0; tick < 9000 && progress < MAIN_ROAD.length; tick++) {
        const projected = projectOnRoad(MAIN_ROAD, v.x, v.z),
          target = roadFrame(
            MAIN_ROAD,
            projected.s + 6 + Math.max(0, v.speed) * 0.45,
            -3,
          ),
          desired = Math.atan2(-(target.x - v.x), -(target.z - v.z)),
          error = angle(desired - v.yaw);
        stepVehicle(
          v,
          {
            throttle: v.speed < 9 ? 1 : 0,
            steer: Math.max(-1, Math.min(1, error * 2.4)),
            brake: Math.abs(error) > 1 && v.speed > 5,
          },
          0.05,
          colliders,
        );
        const current = projectOnRoad(MAIN_ROAD, v.x, v.z);
        let advance = current.s - previous;
        if (advance < -MAIN_ROAD.length / 2) advance += MAIN_ROAD.length;
        if (advance > MAIN_ROAD.length / 2) advance -= MAIN_ROAD.length;
        progress += advance;
        previous = current.s;
        stalled = advance < 0.01 ? stalled + 1 : 0;
        maxCrossTrack = Math.max(maxCrossTrack, Math.abs(current.lateral + 3));
        assert.ok(
          stalled < 100,
          `${kind} stuck at ${JSON.stringify({ x: v.x, z: v.z, s: current.s })}`,
        );
        assert.ok(nearestRoad(v.x, v.z).edge < 0.5, kind + " left asphalt");
        assert.ok(Math.min(...wheelGaps(v)) >= -1e-5);
      }
      assert.ok(progress >= MAIN_ROAD.length, kind + " incomplete");
      console.log(kind, "max lane tracking", maxCrossTrack);
      assert.ok(maxCrossTrack < 2.5, "lane tracking");
      console.log(
        kind,
        "full-loop metres",
        progress.toFixed(1),
        "max lane error",
        maxCrossTrack.toFixed(2),
      );
    },
  );

test("every branch corridor is clear for its intended vehicles", () => {
  for (const road of ROADS)
    for (let s = 1; s < road.length; s += 1) {
      const f = roadFrame(road, s);
      assert.equal(
        blockedAt(
          f.x,
          f.z,
          surfaceHeight(f.x, f.z),
          road.width < 7 ? 0.6 : 1.4,
          colliders,
        ),
        false,
        road.id + " obstruction at " + s,
      );
    }
});
for (const kind of ["car", "bike"])
  test(kind + " traverses every vehicle branch in both directions", () => {
    for (const road of ROADS.filter((r) => r.id !== "main" && r.width >= 7))
      for (const direction of [1, -1]) {
        const start = roadFrame(road, direction === 1 ? 3 : road.length - 3),
          v = {
            id: "branch-test",
            kind,
            ...start,
            yaw: start.yaw + (direction === 1 ? 0 : Math.PI),
            speed: 0,
            vy: 0,
            pitch: 0,
          };
        Object.assign(v, groundPose(v.x, v.z, v.yaw, kind));
        let previous = start.s,
          progress = 0,
          stalled = 0;
        for (let tick = 0; tick < 4000 && progress < road.length - 8; tick++) {
          const p = projectOnRoad(road, v.x, v.z),
            target = roadFrame(
              road,
              p.s + direction * (4 + Math.max(0, v.speed) * 0.35),
            ),
            error = angle(
              Math.atan2(-(target.x - v.x), -(target.z - v.z)) - v.yaw,
            );
          stepVehicle(
            v,
            {
              throttle: v.speed < 7 ? 1 : 0,
              steer: Math.max(-1, Math.min(1, error * 2.4)),
              brake: Math.abs(error) > 1 && v.speed > 4,
            },
            0.05,
            colliders,
          );
          const current = projectOnRoad(road, v.x, v.z);
          let delta = (current.s - previous) * direction;
          if (road.closed && delta < -road.length / 2) delta += road.length;
          progress += delta;
          previous = current.s;
          stalled = delta < 0.005 ? stalled + 1 : 0;
          assert.ok(
            stalled < 100,
            kind +
              " stuck " +
              road.id +
              " " +
              direction +
              " " +
              JSON.stringify(v),
          );
          assert.ok(
            current.distance < road.width / 2 + 0.25,
            kind + " leaves " + road.id + " " + current.s,
          );
          assert.ok(Math.min(...wheelGaps(v)) >= -1e-5);
        }
        assert.ok(
          progress >= road.length - 8,
          kind + " incomplete " + road.id + " " + direction,
        );
      }
  });
