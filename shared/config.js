// Shared world-scale tuning. Server environment overrides transport timings only.
export const MOVEMENT = {
  walk: 8.5,
  sprint: 14,
  acceleration: 13,
  airControl: 2.5,
  jump: 7.8,
  gravity: 22,
};
export const VOICE = {
  fullVolumeRadius: 20,
  radius: 100,
  connectionRadius: 110,
  signalRadius: 120,
  maxPan: 0.55,
};
export const TRANSPORT = {
  busStopTargetIntervalSeconds: 30,
  dwellSeconds: 8,
  cruiseSpeed: 13,
  maxBuses: 16,
  abandonedVehicleSeconds: 180,
};
export const HELIPADS = [
  { id: "helicopter", x: 48, z: 193, name: "Town" },
  { id: "helicopter-park", x: 634, z: -281, name: "Sarovaram" },
  { id: "helicopter-hill", x: 375, z: -481, name: "Malar ridge" },
  { id: "helicopter-north", x: 188, z: -566, name: "Northern outlook" },
];
