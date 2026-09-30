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
    y: heightAt(s.x, s.z) + 0.25,
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
    const floor = heightAt(v.x, v.z) + 0.25;
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
    ny = helicopter ? v.y : heightAt(nx, nz) + 0.25;
  if (!blockedAt(nx, nz, ny, bike ? 0.6 : helicopter ? 2 : 1.35, colliders)) {
    v.x = nx;
    v.z = nz;
    if (!helicopter) v.y = ny;
  } else {
    v.speed *= 0.1;
    v.vy = Math.max(0, v.vy);
  }
  if (!helicopter) {
    const h1 = heightAt(
        v.x - Math.sin(v.yaw) * 1.5,
        v.z - Math.cos(v.yaw) * 1.5,
      ),
      h2 = heightAt(v.x + Math.sin(v.yaw) * 1.5, v.z + Math.cos(v.yaw) * 1.5);
    v.pitch = Math.atan2(h2 - h1, 3);
  }
}
export function safeExit(v, colliders) {
  for (const distance of [3.8, 5.5, 7])
    for (const angle of [Math.PI / 2, -Math.PI / 2, Math.PI, 0]) {
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
  const timeline = [];
  let t = 0;
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const a = ROUTE[i],
      b = ROUTE[i + 1],
      stop = STOPS.find((s) => Math.hypot(s.x - a[0], s.z - a[1]) < 1);
    if (stop) {
      timeline.push({ start: t, end: t + dwell, a, b: a, stop: stop.id });
      t += dwell;
    }
    const duration =
      Math.hypot(b[0] - a[0], b[1] - a[1]) / TRANSPORT.cruiseSpeed;
    timeline.push({ start: t, end: t + duration, a, b, stop: null });
    t += duration;
  }
  const fleet = Math.min(
      TRANSPORT.maxBuses,
      Math.max(1, Math.ceil(t / interval)),
    ),
    cycle = Math.max(t, fleet * interval);
  // Stretch travel, never dwell, to space arrivals evenly around the loop.
  const dwellTotal = timeline
    .filter((l) => l.stop)
    .reduce((n, l) => n + l.end - l.start, 0);
  const scale = (cycle - dwellTotal) / (t - dwellTotal);
  let cursor = 0;
  for (const leg of timeline) {
    const duration = (leg.end - leg.start) * (leg.stop ? 1 : scale);
    leg.start = cursor;
    leg.end = cursor + duration;
    cursor += duration;
  }
  interval = cycle / fleet;

  return { timeline, cycle, fleet, interval };
}
export function busAt(schedule, seconds, index) {
  const phase =
    (((seconds - index * schedule.interval) % schedule.cycle) +
      schedule.cycle) %
    schedule.cycle;
  const leg =
    schedule.timeline.find((l) => phase >= l.start && phase < l.end) ||
    schedule.timeline[0];
  const f = clamp((phase - leg.start) / (leg.end - leg.start), 0, 1),
    ease = f * f * (3 - 2 * f);
  let x = leg.a[0] + (leg.b[0] - leg.a[0]) * ease,
    z = leg.a[1] + (leg.b[1] - leg.a[1]) * ease;
  let yaw = Math.atan2(-(leg.b[0] - leg.a[0]), -(leg.b[1] - leg.a[1]));
  if (leg.stop) {
    const next =
      schedule.timeline[
        (schedule.timeline.indexOf(leg) + 1) % schedule.timeline.length
      ];
    yaw = Math.atan2(-(next.b[0] - next.a[0]), -(next.b[1] - next.a[1]));
  }
  x += Math.cos(yaw) * 2.2;
  z -= Math.sin(yaw) * 2.2;
  return {
    id: `bus-${index}`,
    x,
    z,
    y: heightAt(x, z) + 0.25,
    yaw,
    doors: !!leg.stop,
    stop: leg.stop,
    phase,
    departure: leg.stop ? leg.end - phase : 0,
  };
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
