import { HELIPADS, PARK_PARKING } from "./config.js";
export const smooth = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
export function naturalHeight(x, z) {
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
export function baseHeight(x, z) {
  let h = naturalHeight(x, z);
  for (const pad of HELIPADS) {
    const weight = 1 - smooth((Math.hypot(x - pad.x, z - pad.z) - 14) / 12);
    h =
      h * (1 - weight) +
      (pad.elevation ?? naturalHeight(pad.x, pad.z)) * weight;
  }
  const parking = PARK_PARKING,
    edge = Math.max(
      Math.abs(x - parking.x) - parking.width / 2,
      Math.abs(z - parking.z) - parking.depth / 2,
    ),
    blend = 1 - smooth(edge / 10);
  return h * (1 - blend) + parking.elevation * blend;
}
