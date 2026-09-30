const angle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
// A bounded playback timeline decouples display frames from packet arrival bursts.
export class SnapshotBuffer {
  constructor(delay = 150) {
    this.delay = delay;
    this.offset = Infinity;
    this.lastTime = -Infinity;
    this.lastSequence = -1;
    /** @type {any[]} */ this.frames = [];
    this.rejected = 0;
  }
  clear() {
    this.frames = [];
    this.offset = Infinity;
    this.lastTime = -Infinity;
    this.lastSequence = -1;
  }
  push(snapshot, receivedAt) {
    if (
      snapshot.time <= this.lastTime ||
      (snapshot.seq !== undefined && snapshot.seq <= this.lastSequence)
    ) {
      this.rejected++;
      return false;
    }
    this.lastTime = snapshot.time;
    this.lastSequence = snapshot.seq ?? this.lastSequence + 1;
    this.offset = Math.min(this.offset, receivedAt - snapshot.time);
    this.frames.push(snapshot);
    if (this.frames.length > 32) this.frames.shift();
    return true;
  }
  sample(now) {
    if (!this.frames.length) return null;
    const target = now - this.offset - this.delay;
    let b = this.frames.find((s) => s.time >= target),
      a;
    if (b) {
      const i = this.frames.indexOf(b);
      a = this.frames[Math.max(0, i - 1)];
    } else {
      b = this.frames.at(-1);
      a = this.frames.at(-2) || b;
    }
    const dt = b.time - a.time,
      t = dt > 0 ? (target - a.time) / dt : 1,
      extra = Math.max(0, Math.min(80, target - b.time)) / 1000;
    const mix = (old, current) => {
      if (
        !old ||
        old.mode !== current.mode ||
        old.vehicleId !== current.vehicleId ||
        Math.hypot(current.x - old.x, current.z - old.z) > 40
      )
        return { ...current };
      const result = { ...current };
      for (const key of ["x", "y", "z", "pitch", "speed", "vy"])
        if (typeof current[key] === "number" && typeof old[key] === "number")
          result[key] =
            old[key] + (current[key] - old[key]) * Math.max(0, Math.min(1, t));
      result.yaw = angle(
        old.yaw || 0,
        current.yaw || 0,
        Math.max(0, Math.min(1, t)),
      );
      if (t > 1 && dt > 0) {
        const cap =
          current.kind === "ball"
            ? 30
            : current.kind
              ? 32
              : current.routeS !== undefined
                ? 22
                : 16;
        for (const key of ["x", "y", "z"]) {
          let velocity = (current[key] - old[key]) / (dt / 1000);
          velocity = Math.max(-cap, Math.min(cap, velocity));
          result[key] = current[key] + velocity * extra;
        }
      }
      return result;
    };
    const list = (key) => {
      const old = new Map((a[key] || []).map((p) => [p.id, p]));
      return (b[key] || []).map((p) => mix(old.get(p.id), p));
    };
    return {
      ...b,
      players: list("players"),
      vehicles: list("vehicles"),
      buses: list("buses"),
      football: b.football
        ? {
            ...b.football,
            ball:
              a.football?.revision === b.football.revision
                ? mix(a.football?.ball, b.football.ball)
                : { ...b.football.ball },
          }
        : undefined,
    };
  }
}
