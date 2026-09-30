import { MAIN_ROAD, ROAD_STOPS } from "./roads.js";
import { VOICE, HELIPADS } from "./config.js";
// Shared deterministic geography used by rendering, movement and the game server.
export const BOUNDS = { minX: -244, maxX: 720, minZ: -720, maxZ: 290 };
export const TICK_RATE = 20;
export const SEAT_COUNT = 20;
import { smooth } from "./terrain-base.js";
export { smooth };
export {
  terrainHeight as heightAt,
  surfaceHeight,
  walkingHeight,
} from "./roads.js";
export const HILL_ROAD = MAIN_ROAD.points
  .filter((p) => p.z < -230 || p.x > 223)
  .map((p) => [p.x, p.z]);
export const PARK = {
  id: "sarovaram",
  name: "Sarovaram Park",
  local: "സരോവരം പാർക്ക്",
  x: 459,
  z: -260,
  width: 160,
  depth: 160,
  entrance: { x: 552, z: -259 },
  spawn: { x: 535, z: -259 },
};
export const STOPS = ROAD_STOPS;
export const ROUTE = MAIN_ROAD.points.map((p) => [p.x, p.z]);
/** @type {[string,number,number][]} */
const cars = [
  ["car-town", 21, 54],
  ["car-park", 595, -239],
  ["car-village", 140, -198],
  ["car-riverside", 137, -119],
  ["car-hill", 326, -420],
  ["car-valley", 518, -22],
  ["car-residential", -30, 126],
];
/** @type {[string,number,number][]} */
const bikes = [
  ["bike-town", -19, 43],
  ["scooter-park", 575, -280],
  ["bike-shops", 20, 4],
  ["bike-residential", -26, 154],
  ["bike-fuel", 30, 108],
  ["bike-riverside", 133, -113],
  ["bike-village", 140, -221],
  ["bike-hill", 312, -414],
  ["bike-ridge", 391, -454],
  ["bike-valley", 520, -27],
  ["bike-east", 315, 48],
  ["bike-park-gate", 551, -243],
  ["bike-north", 192, -547],
  ["bike-lakeside", 407, -238],
];
export const VEHICLE_SPAWNS = [
  ...cars.map(([id, x, z], i) => ({
    id,
    kind: "car",
    x,
    z,
    yaw: 0,
    color: ["#dbb866", "#9bbbbe", "#b57564"][i % 3],
  })),
  ...bikes.map(([id, x, z], i) => ({
    id,
    kind: "bike",
    x,
    z,
    yaw: i % 2 ? 1.57 : -1.57,
    color: ["#af6354", "#9da66e", "#679baf"][i % 3],
  })),
  ...HELIPADS.map((p) => ({
    id: p.id,
    kind: "helicopter",
    x: p.x,
    z: p.z,
    yaw: 0,
    color: "#507f73",
  })),
];
export function nearRoad(x, z, padding = 15) {
  return HILL_ROAD.some((a, i) => {
    const b = HILL_ROAD[(i + 1) % HILL_ROAD.length];
    return segmentDistance(x, z, a, b) < padding;
  });
}
export function segmentDistance(x, z, a, b) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1),
      ),
    );
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}
export function sanitizeName(value) {
  return typeof value === "string"
    ? value
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N}\p{M} _-]/gu, "")
        .trim()
        .slice(0, 20)
    : "";
}
export function voiceVolume(distance) {
  if (distance <= VOICE.fullVolumeRadius) return 1;
  if (distance >= VOICE.radius) return 0;
  return (
    1 -
    smooth(
      (distance - VOICE.fullVolumeRadius) /
        (VOICE.radius - VOICE.fullVolumeRadius),
    )
  );
}
export function seatOffset(index) {
  return {
    x: index % 4 < 2 ? -1.1 + (index % 2) * 0.55 : 0.55 + (index % 2) * 0.55,
    z: -2.3 + Math.floor(index / 4) * 1.15,
  };
}
export function worldSeat(bus, index) {
  const seat = seatOffset(index),
    pitch = bus.pitch || 0,
    yy = 0.9 * Math.cos(pitch) - seat.z * Math.sin(pitch),
    zz = 0.9 * Math.sin(pitch) + seat.z * Math.cos(pitch);
  return {
    x: bus.x + seat.x * Math.cos(bus.yaw) + zz * Math.sin(bus.yaw),
    y: bus.y + yy,
    z: bus.z - seat.x * Math.sin(bus.yaw) + zz * Math.cos(bus.yaw),
  };
}
export const PARK_COLLIDERS = [
  { x: 458, z: -280, w: 72, d: 49, h: 2, water: true },
  { x: 535, z: -247, w: 3, d: 3, h: 8 },
  { x: 535, z: -271, w: 3, d: 3, h: 8 },
  { x: 403, z: -215, w: 15, d: 11, h: 6 },
  { x: 480, z: -208, w: 12, d: 10, h: 6 },
];
