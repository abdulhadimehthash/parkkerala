import { FOOTBALL as F, inFootballArea } from "./football-config.js";
// The server owns the only ball. Clients send intent, never ball coordinates.
export class FootballMatch {
  constructor() {
    this.teams = new Map();
    this.lastKick = new Map();
    this.scores = { A: 0, B: 0 };
    this.goal = null;
    this.resetAt = 0;
    this.endsAt = 0;
    this.status = "waiting";
    this.revision = 0;
    this.ball = this.centerBall();
  }
  centerBall() {
    return {
      id: "football",
      kind: "ball",
      x: F.x,
      y: F.elevation + F.radius,
      z: F.z,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      pitch: 0,
    };
  }
  join(player, team, now) {
    if (player.mode !== "walk" || !inFootballArea(player.x, player.z, 14))
      throw Error("Walk to the football turf to join.");
    if (!["A", "B"].includes(team))
      team =
        [...this.teams.values()].filter((t) => t === "A").length <=
        [...this.teams.values()].filter((t) => t === "B").length
          ? "A"
          : "B";
    const already = this.teams.get(player.id) === team;
    if (already && this.status !== "finished") return;
    if (
      !already &&
      [...this.teams.values()].filter((t) => t === team).length >= F.teamSize
    )
      throw Error("That team is full. Join the other team.");
    this.teams.set(player.id, team);
    player.footballTeam = team;
    if (this.status === "finished") {
      this.scores = { A: 0, B: 0 };
      this.ball = this.centerBall();
      this.goal = null;
      this.status = "waiting";
      this.revision++;
    }
    if (
      this.status === "waiting" &&
      [...this.teams.values()].includes("A") &&
      [...this.teams.values()].includes("B")
    ) {
      this.status = "playing";
      this.endsAt = now + F.matchSeconds * 1000;
      this.scores = { A: 0, B: 0 };
      this.ball = this.centerBall();
      this.revision++;
    }
  }
  leave(player) {
    this.teams.delete(player.id);
    this.lastKick.delete(player.id);
    player.footballTeam = null;
    if (!this.teams.size) {
      this.status = "waiting";
      this.endsAt = 0;
      this.scores = { A: 0, B: 0 };
      this.goal = null;
      this.resetAt = 0;
      this.ball = this.centerBall();
      this.revision++;
    }
  }
  kick(player, now) {
    if (!this.teams.has(player.id))
      throw Error("Join Blue or Amber before kicking.");
    if (
      player.mode !== "walk" ||
      player.grounded === false ||
      this.status === "finished" ||
      this.resetAt > now
    )
      return false;
    if (now - (this.lastKick.get(player.id) ?? -Infinity) < 250) return false;
    const b = this.ball,
      dx = b.x - player.x,
      dz = b.z - player.z,
      d = Math.hypot(dx, dz);
    if (d > 2.8 || Math.abs(player.y - b.y) > 1.8) return false;
    const fx = -Math.sin(player.yaw),
      fz = -Math.cos(player.yaw),
      nx = dx / Math.max(0.1, d),
      nz = dz / Math.max(0.1, d);
    if (d > 0.4 && fx * nx + fz * nz < 0.2) return false;
    let vx = fx * 0.78 + nx * 0.22,
      vz = fz * 0.78 + nz * 0.22;
    const norm = Math.hypot(vx, vz) || 1,
      speed = player.sprinting ? 22 : player.moving ? 16 : 11;
    b.vx = (vx / norm) * speed;
    b.vz = (vz / norm) * speed;
    b.vy = player.sprinting ? 3.2 : 1.4;
    this.lastKick.set(player.id, now);
    player.kickingUntil = now + 300;
    return true;
  }
  tick(dt, now, players) {
    for (const [id] of this.teams) {
      const p = players.get(id);
      if (!p) this.teams.delete(id);
      else if (p.mode !== "walk" || !inFootballArea(p.x, p.z, 30))
        this.leave(p);
    }
    if (this.status === "playing" && now >= this.endsAt) {
      this.status = "finished";
      this.ball.vx = this.ball.vy = this.ball.vz = 0;
      this.resetAt = 0;
      return;
    }
    if (this.resetAt) {
      if (now >= this.resetAt) {
        this.ball = this.centerBall();
        this.resetAt = 0;
        this.goal = null;
        this.revision++;
      }
      return;
    }
    if (this.status === "finished") return;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120))),
      h = dt / steps;
    for (let step = 0; step < steps; step++) {
      const b = this.ball;
      b.vy -= 14 * h;
      b.x += b.vx * h;
      b.z += b.vz * h;
      b.y += b.vy * h;
      if (b.y < F.elevation + F.radius) {
        b.y = F.elevation + F.radius;
        b.vy = Math.abs(b.vy) > 0.7 ? -b.vy * 0.36 : 0;
      }
      const drag = Math.exp(
        -(b.y <= F.elevation + F.radius + 0.02 ? 1.1 : 0.16) * h,
      );
      b.vx *= drag;
      b.vz *= drag;
      for (const axis of ["x", "z"]) {
        const half = axis === "x" ? F.width / 2 : F.length / 2,
          center = F[axis],
          sign = Math.sign(b[axis] - center) || 1;
        if (
          axis === "z" &&
          Math.abs(b.x - F.x) < F.goalWidth / 2 - F.radius &&
          b.y + F.radius < F.goalHeight
        ) {
          if (Math.abs(b.z - F.z) - F.radius > half) {
            const team = sign < 0 ? "A" : "B";
            this.scores[team]++;
            this.goal = team;
            this.resetAt = now + F.resetSeconds * 1000;
            b.vx = b.vy = b.vz = 0;
            return;
          }
          continue;
        }
        if (Math.abs(b[axis] - center) > half - F.radius) {
          b[axis] = center + sign * (half - F.radius);
          b["v" + axis] *= -0.64;
        }
      }
      if (Math.hypot(b.vx, b.vz) < 0.035) b.vx = b.vz = 0;
    }
  }
  snapshot(now) {
    return {
      ball: { ...this.ball },
      scores: { ...this.scores },
      teams: Object.fromEntries(this.teams),
      status: this.status,
      goal: this.goal,
      resetIn: Math.max(0, (this.resetAt - now) / 1000),
      remaining: this.endsAt
        ? Math.max(0, Math.ceil((this.endsAt - now) / 1000))
        : F.matchSeconds,
      revision: this.revision,
    };
  }
}
