import {
  MAIN_ROAD,
  ROAD_STOPS,
  roadFrame,
  laneOffset,
  groundPose,
  surfaceHeight,
} from "./roads.js";
import { TRANSPORT } from "./config.js";
import {
  BOUNDS,
  heightAt,
  ROUTE,
  STOPS,
  VEHICLE_SPAWNS,
  seatOffset,
  worldSeat,
} from "./world.js";
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function blockedAt(x, z, y, radius, colliders) {
  if (
    x - radius < BOUNDS.minX ||
    x + radius > BOUNDS.maxX ||
    z - radius < BOUNDS.minZ ||
    z + radius > BOUNDS.maxZ
  )
    return true;
  return colliders.some(
    (c) =>
      y < c.h + 0.1 &&
      y + 2 > (c.base ?? 0) &&
      Math.abs(x - c.x) < c.w / 2 + radius &&
      Math.abs(z - c.z) < c.d / 2 + radius,
  );
}
export function makeVehicles() {
  return VEHICLE_SPAWNS.map((s) => ({
    ...s,
    y:
      s.kind === "helicopter"
        ? surfaceHeight(s.x, s.z) - 0.2
        : groundPose(s.x, s.z, s.yaw, s.kind).y,
    speed: 0,
    vy: 0,
    pitch: 0,
    owner: null,
    input: {},
    inputAt: 0,
  }));
}
export function stepVehicle(v, input, dt, colliders) {
  const helicopter = v.kind === "helicopter",
    bike = v.kind === "bike";
  const throttle = clamp(Number(input.throttle) || 0, -1, 1),
    steer = clamp(Number(input.steer) || 0, -1, 1);
  if (helicopter) {
    v.yaw += (Number(input.turn) || 0) * dt * 0.9;
    v.speed += (throttle * 19 - v.speed * 0.75) * dt;
    v.vy += ((Number(input.lift) || 0) * 13 - v.vy * 2) * dt;
    v.y += v.vy * dt;
    const floor = surfaceHeight(v.x, v.z) - 0.2;
    if (v.y < floor) {
      v.y = floor;
      v.vy = 0;
    }
    v.y = clamp(v.y, floor, 200);
  } else {
    const acceleration =
      throttle * (v.speed * throttle < 0 ? 20 : bike ? 12 : 10);
    v.speed += acceleration * dt;
    v.speed *= Math.exp(-(input.brake ? 5 : throttle ? 0.13 : 1) * dt);
    v.speed = clamp(v.speed, -8, bike ? 25 : 29);
    v.yaw += steer * dt * (bike ? 1.6 : 1.15) * clamp(v.speed / 5, -1, 1);
  }
  const vx =
      -Math.sin(v.yaw) * v.speed +
      (helicopter ? Math.cos(v.yaw) * steer * 11 : 0),
    vz =
      -Math.cos(v.yaw) * v.speed -
      (helicopter ? Math.sin(v.yaw) * steer * 11 : 0);
  const nx = v.x + vx * dt,
    nz = v.z + vz * dt,
    ny = helicopter ? v.y : groundPose(nx, nz, v.yaw, v.kind).y;
  if (!blockedAt(nx, nz, ny, bike ? 0.6 : helicopter ? 2 : 1.35, colliders)) {
    v.x = nx;
    v.z = nz;
    if (!helicopter) v.y = ny;
  } else {
    v.speed *= 0.1;
    v.vy = Math.max(0, v.vy);
  }
  if (!helicopter) Object.assign(v, groundPose(v.x, v.z, v.yaw, v.kind));
}
export function safeExit(v, colliders) {
  for (const distance of [3.8, 5.5, 7])
    for (const angle of [-Math.PI / 2, Math.PI / 2, Math.PI, 0]) {
      const x = v.x + Math.sin(v.yaw + angle) * distance,
        z = v.z + Math.cos(v.yaw + angle) * distance,
        y = heightAt(x, z) + 0.25;
      if (!blockedAt(x, z, y, 0.45, colliders)) return { x, y, z };
    }
  return null;
}
export function createBusSchedule(
  interval = TRANSPORT.busStopTargetIntervalSeconds,
  dwell = TRANSPORT.dwellSeconds,
) {
  const minTravel = MAIN_ROAD.length / TRANSPORT.cruiseSpeed,
    minimum = minTravel + dwell * ROAD_STOPS.length;
  const fleet = Math.min(
      TRANSPORT.maxBuses,
      Math.max(1, Math.ceil(minimum / interval)),
    ),
    cycle = Math.max(minimum, fleet * interval),
    travel = cycle - dwell * ROAD_STOPS.length;
  const timeline = [];
  let t = 0;
  for (let i = 0; i < ROAD_STOPS.length; i++) {
    const from = ROAD_STOPS[i].s,
      to =
        i + 1 < ROAD_STOPS.length
          ? ROAD_STOPS[i + 1].s
          : ROAD_STOPS[0].s + MAIN_ROAD.length;
    timeline.push({
      start: t,
      end: t + dwell,
      from,
      to: from,
      stop: ROAD_STOPS[i].id,
    });
    t += dwell;
    const duration = (travel * (to - from)) / MAIN_ROAD.length;
    timeline.push({ start: t, end: t + duration, from, to, stop: null });
    t += duration;
  }
  return { timeline, cycle, fleet, interval: cycle / fleet };
}
export function busAt(schedule, seconds, index) {
  const phase =
    (((seconds - index * schedule.interval) % schedule.cycle) +
      schedule.cycle) %
    schedule.cycle;
  const leg =
    schedule.timeline.find((l) => phase >= l.start && phase < l.end) ||
    schedule.timeline[0];
  const t = clamp((phase - leg.start) / (leg.end - leg.start), 0, 1);
  // Ease only on departure/arrival, preserving continuous speed through road bends.
  const ramp = Math.min(0.16, 2 / (leg.end - leg.start)),
    normal = 1 - ramp;
  const travel =
    t < ramp
      ? (t * t) / (2 * ramp)
      : t > 1 - ramp
        ? normal - ((1 - t) * (1 - t)) / (2 * ramp)
        : t - ramp / 2;
  const progress = leg.stop ? 0 : travel / normal,
    s = leg.from + (leg.to - leg.from) * progress;
  const f = roadFrame(MAIN_ROAD, s, laneOffset(s)),
    pose = groundPose(f.x, f.z, f.yaw, "bus");
  return {
    id: `bus-${index}`,
    x: f.x,
    z: f.z,
    ...pose,
    yaw: f.yaw,
    routeS: s % MAIN_ROAD.length,
    doors: !!leg.stop,
    stop: leg.stop,
    phase,
    departure: leg.stop ? leg.end - phase : 0,
  };
}
// Timetable-controlled buses do not depend on rigid-body collision impulses. Detect
// damaged/stalled cached state and safely restore the authoritative road sample.
export class BusRecovery {
  constructor() {
    this.previous = new Map();
    this.recoveries = 0;
  }
  update(expected, seconds) {
    const previous = this.previous.get(expected.id);
    const finite = [expected.x, expected.y, expected.z, expected.routeS].every(
      Number.isFinite,
    );
    const frame = finite
      ? roadFrame(MAIN_ROAD, expected.routeS, laneOffset(expected.routeS))
      : null;
    const valid =
      finite &&
      Math.hypot(expected.x - frame.x, expected.z - frame.z) < 2 &&
      Math.abs(
        expected.y - groundPose(expected.x, expected.z, expected.yaw, "bus").y,
      ) < 0.3;
    if (!valid && previous) {
      const frame = roadFrame(
        MAIN_ROAD,
        previous.routeS,
        laneOffset(previous.routeS),
      );
      Object.assign(
        expected,
        frame,
        groundPose(frame.x, frame.z, frame.yaw, "bus"),
        { routeS: previous.routeS },
      );
      this.recoveries++;
    }
    if (previous && !expected.doors && seconds - previous.changedAt > 5) {
      const f = roadFrame(
        MAIN_ROAD,
        expected.routeS,
        laneOffset(expected.routeS),
      );
      Object.assign(
        expected,
        { x: f.x, z: f.z, yaw: f.yaw },
        groundPose(f.x, f.z, f.yaw, "bus"),
      );
      this.recoveries++;
    }
    const moved =
      !previous ||
      Math.abs(expected.routeS - previous.routeS) > 0.01 ||
      expected.doors;
    this.previous.set(expected.id, {
      routeS: expected.routeS,
      changedAt: moved ? seconds : previous.changedAt,
    });
    return expected;
  }
}
export function countdown(schedule, seconds, stopId, excludeBoarding = false) {
  let best = Infinity;
  for (let i = 0; i < schedule.fleet; i++) {
    const bus = busAt(schedule, seconds, i);
    if (bus.stop === stopId) {
      if (!excludeBoarding) return 0;
      else continue;
    }
    for (const leg of schedule.timeline) {
      if (leg.stop === stopId)
        best = Math.min(
          best,
          (leg.start - bus.phase + schedule.cycle) % schedule.cycle,
        );
    }
  }
  return Math.ceil(best);
}
export { worldSeat, seatOffset };
