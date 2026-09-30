export const FOOTBALL = {
  x: 68,
  z: 241,
  width: 56,
  length: 60,
  elevation: 0,
  radius: 0.32,
  goalWidth: 10,
  goalHeight: 3,
  goalDepth: 3,
  teamSize: 5,
  matchSeconds: 300,
  resetSeconds: 4,
  entrance: { x: 36, z: 235 },
};
export const inFootballArea = (x, z, padding = 6) =>
  Math.abs(x - FOOTBALL.x) <= FOOTBALL.width / 2 + padding &&
  Math.abs(z - FOOTBALL.z) <= FOOTBALL.length / 2 + padding;
