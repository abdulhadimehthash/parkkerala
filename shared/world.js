// Shared deterministic geography used by rendering, movement and the game server.
export const BOUNDS = { minX: -244, maxX: 720, minZ: -720, maxZ: 290 };
export const TICK_RATE = 20;
export const SEAT_COUNT = 20;
export const smooth = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
export function heightAt(x, z) {
  const north = smooth((-z - 170) / 190),
    east = smooth((x - 235) / 170);
  const hills =
    42 +
    22 * Math.sin(x / 130) +
    19 * Math.cos(z / 150) +
    12 * Math.sin((x + z) / 90);
  const raw = Math.max(north, east) * Math.max(9, hills);
  const parkBlend =
    1 -
    smooth(
      (Math.max(Math.abs(x - 459) / 90, Math.abs(z + 260) / 90) - 0.8) / 0.55,
    );
  return raw * (1 - parkBlend) + 40 * parkBlend;
}
export const HILL_ROAD = [
  [150, -230],
  [167, -265],
  [208, -282],
  [258, -307],
  [306, -348],
  [335, -400],
  [393, -436],
  [462, -431],
  [517, -389],
  [551, -329],
  [565, -259],
  [601, -203],
  [614, -135],
  [578, -78],
  [505, -39],
  [414, 3],
  [318, 34],
  [223, 34],
];
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
export const STOPS = [
  { id: "town", name: "Chayapuram", local: "ചായപ്പുറം", x: 26, z: 34 },
  {
    id: "riverside",
    name: "Neela Riverside",
    local: "നീലക്കായൽ",
    x: 150,
    z: -116,
  },
  {
    id: "village",
    name: "Vellaram Village",
    local: "വെള്ളാരം",
    x: 150,
    z: -209,
  },
  {
    id: "viewpoint",
    name: "Malar Viewpoint",
    local: "മലർ മല",
    x: 335,
    z: -400,
  },
  {
    id: "sarovaram",
    name: "Sarovaram Park",
    local: "സരോവരം പാർക്ക്",
    x: 565,
    z: -259,
  },
  {
    id: "east",
    name: "Eastern Valley",
    local: "കിഴക്കൻ താഴ്വര",
    x: 505,
    z: -39,
  },
];
export const ROUTE = [
  [26, 34],
  [100, 34],
  [150, 34],
  [150, -70],
  [150, -116],
  [150, -170],
  [150, -209],
  ...HILL_ROAD,
  [150, 34],
  [90, 34],
  [26, 34],
];
export const VEHICLE_SPAWNS = [
  { id: "car-town", kind: "car", x: 21, z: 54, yaw: 0, color: "#dbb866" },
  { id: "car-park", kind: "car", x: 584, z: -239, yaw: 0, color: "#9bbbbe" },
  {
    id: "bike-town",
    kind: "bike",
    x: -19,
    z: 43,
    yaw: -1.57,
    color: "#af6354",
  },
  {
    id: "scooter-park",
    kind: "bike",
    x: 580,
    z: -280,
    yaw: 1.57,
    color: "#9da66e",
  },
  {
    id: "helicopter",
    kind: "helicopter",
    x: 48,
    z: 193,
    yaw: 0,
    color: "#507f73",
  },
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
  return distance <= 10
    ? 1
    : distance >= 40
      ? 0
      : Math.pow((40 - distance) / 30, 2);
}
export function seatOffset(index) {
  return {
    x: index % 4 < 2 ? -1.1 + (index % 2) * 0.55 : 0.55 + (index % 2) * 0.55,
    z: -2.3 + Math.floor(index / 4) * 1.15,
  };
}
export function worldSeat(bus, index) {
  const s = seatOffset(index);
  return {
    x: bus.x + s.x * Math.cos(bus.yaw) + s.z * Math.sin(bus.yaw),
    y: bus.y + 0.9,
    z: bus.z - s.x * Math.sin(bus.yaw) + s.z * Math.cos(bus.yaw),
  };
}
export const PARK_COLLIDERS = [
  { x: 458, z: -280, w: 72, d: 49, h: 2, water: true },
  { x: 535, z: -247, w: 3, d: 3, h: 8 },
  { x: 535, z: -271, w: 3, d: 3, h: 8 },
  { x: 403, z: -215, w: 15, d: 11, h: 6 },
  { x: 480, z: -208, w: 12, d: 10, h: 6 },
];
