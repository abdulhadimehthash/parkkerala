// Millimetre positions and sub-degree angles are finer than visible movement.
// Quantize only the transmitted copy; simulation and collision keep full precision.
// This reduces traffic even when a hosting proxy disables WebSocket compression.
export function encodeSnapshot(snapshot) {
  return JSON.stringify(snapshot, (_key, value) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    !Number.isInteger(value)
      ? Math.round(value * 1000) / 1000
      : value,
  );
}
