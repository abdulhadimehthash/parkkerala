import { MOVEMENT, TRANSPORT } from "../shared/config.js";
import { malayalamDisplayName } from "../shared/names.js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { heightAt, sanitizeName, SEAT_COUNT, STOPS } from "../shared/world.js";
import {
  makeVehicles,
  stepVehicle,
  safeExit,
  createBusSchedule,
  busAt,
  countdown,
  worldSeat,
  blockedAt,
} from "../shared/simulation.js";
const collisionData = JSON.parse(
  readFileSync(new URL("../shared/colliders.json", import.meta.url)),
);
export class Game {
  constructor({
    interval = TRANSPORT.busStopTargetIntervalSeconds,
    dwell = TRANSPORT.dwellSeconds,
    respawnSeconds = TRANSPORT.abandonedVehicleSeconds,
    now = () => Date.now(),
  } = {}) {
    this.respawnSeconds = respawnSeconds;
    this.players = new Map();
    this.vehicles = makeVehicles();
    this.schedule = createBusSchedule(interval, dwell);
    this.now = now;
    this.epoch = now();
    this.vehicles.forEach((v) => (v.lastUsed = now()));
    this.buses = [];
    this.seats = Array.from({ length: this.schedule.fleet }, () =>
      Array(SEAT_COUNT).fill(null),
    );
    this.tick(0);
  }
  add(name) {
    name = sanitizeName(name);
    if (!name) throw Error("Choose a username with letters or numbers.");
    if (this.players.size >= 64)
      throw Error("This world is full. Please try again shortly.");
    if (
      [...this.players.values()].some(
        (p) => p.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw Error("That name is already in this world. Try another.");
    const p = {
      id: randomUUID(),
      name,
      originalUsername: name,
      displayNameMalayalam: malayalamDisplayName(name),
      sprinting: false,
      x: 0,
      y: 0.25,
      z: 29,
      yaw: 0,
      moving: false,
      mode: "walk",
      vehicleId: null,
      seat: null,
      mic: false,
      speaking: false,
      lastMove: this.now(),
    };
    this.players.set(p.id, p);
    return p;
  }
  remove(id) {
    const p = this.players.get(id);
    if (!p) return;
    for (const v of this.vehicles)
      if (v.owner === id) {
        v.owner = null;
        v.lastUsed = this.now();
        v.input = {};
        v.speed = 0;
      }
    for (const seats of this.seats)
      seats.forEach((owner, i) => {
        if (owner === id) seats[i] = null;
      });
    this.players.delete(id);
  }
  move(id, data) {
    const p = this.players.get(id);
    if (!p || p.mode !== "walk") return;
    if (![data.x, data.y, data.z, data.yaw].every(Number.isFinite)) return;
    const dt = Math.min(1, (this.now() - p.lastMove) / 1000);
    if (
      Math.hypot(data.x - p.x, data.z - p.z) >
      dt * (MOVEMENT.sprint + 2) + 1.5
    )
      return;
    const floor = heightAt(data.x, data.z);
    if (
      data.y < floor - 0.2 ||
      data.y > floor + 3.5 ||
      blockedAt(data.x, data.z, data.y, 0.3, collisionData)
    )
      return;
    Object.assign(p, {
      x: data.x,
      y: data.y,
      z: data.z,
      yaw: data.yaw,
      moving: !!data.moving,
      sprinting: !!data.sprinting,
      lastMove: this.now(),
    });
  }
  interact(id, target) {
    const p = this.players.get(id);
    if (!p) throw Error("Join the world first.");
    if (p.mode !== "walk") return this.exit(id);
    const v = this.vehicles.find((v) => v.id === target);
    if (v) {
      if (Math.hypot(p.x - v.x, p.z - v.z) > 6 || Math.abs(p.y - v.y) > 5)
        throw Error("Move closer to the vehicle.");
      if (v.owner) throw Error("This vehicle already has a driver.");
      v.owner = id;
      v.lastUsed = this.now();
      v.input = {};
      v.inputAt = this.now();
      p.mode = v.kind;
      p.vehicleId = v.id;
      p.moving = false;
      return;
    }
    const b = this.buses.find((b) => b.id === target);
    if (!b) throw Error("No interaction here.");
    if (!b.doors) throw Error("Wait until the bus stops and opens its doors.");
    if (Math.hypot(p.x - b.x, p.z - b.z) > 8)
      throw Error("Move closer to the bus.");
    const seats = this.seats[Number(b.id.split("-")[1])],
      seat = seats.indexOf(null);
    if (seat < 0) throw Error("BUS FULL · Next bus arriving soon.");
    seats[seat] = id;
    p.mode = "bus";
    p.vehicleId = b.id;
    p.seat = seat;
    p.moving = false;
  }
  exit(id) {
    const p = this.players.get(id);
    const v =
      p.mode === "bus"
        ? this.buses.find((b) => b.id === p.vehicleId)
        : this.vehicles.find((v) => v.id === p.vehicleId);
    if (!v) return;
    if (p.mode === "bus" && !v.doors)
      throw Error("You can exit at the next bus stop.");
    if (p.mode === "helicopter" && v.y - heightAt(v.x, v.z) > 0.9)
      throw Error("Land the helicopter before exiting.");
    if (p.mode !== "bus" && Math.abs(v.speed) > 1.5)
      throw Error("Stop the vehicle before exiting.");
    const spot = safeExit(v, collisionData);
    if (!spot) throw Error("No clear place to exit. Move to an open area.");
    if (p.mode === "bus") this.seats[Number(v.id.split("-")[1])][p.seat] = null;
    else {
      v.owner = null;
      v.lastUsed = this.now();
      v.input = {};
      v.speed = 0;
    }
    Object.assign(p, spot, {
      mode: "walk",
      vehicleId: null,
      seat: null,
      lastMove: this.now(),
    });
  }
  input(id, input) {
    const v = this.vehicles.find((v) => v.owner === id);
    if (!v) return;
    v.input = {
      throttle: Math.max(-1, Math.min(1, Number(input.throttle) || 0)),
      steer: Math.max(-1, Math.min(1, Number(input.steer) || 0)),
      turn: Math.max(-1, Math.min(1, Number(input.turn) || 0)),
      lift: Math.max(-1, Math.min(1, Number(input.lift) || 0)),
      brake: !!input.brake,
    };
    v.inputAt = this.now();
  }
  tick(dt) {
    const now = this.now(),
      seconds = (now - this.epoch) / 1000;
    this.buses = Array.from({ length: this.schedule.fleet }, (_, i) => ({
      ...busAt(this.schedule, seconds, i),
      seats: this.seats[i],
    }));
    for (const v of this.vehicles) {
      if (v.owner) v.lastUsed = now;
      else if (now - v.lastUsed > this.respawnSeconds * 1000) {
        const spawn = makeVehicles().find((s) => s.id === v.id);
        const nearPlayer = [...this.players.values()].some(
          (p) =>
            Math.hypot(p.x - v.x, p.z - v.z) < 12 ||
            Math.hypot(p.x - spawn.x, p.z - spawn.z) < 12,
        );
        if (!nearPlayer) {
          Object.assign(v, spawn, { lastUsed: now });
        }
      }
      if (now - v.inputAt > 450) v.input = { brake: true };
      stepVehicle(v, v.input, dt, collisionData);
    }
    for (const p of this.players.values()) {
      if (p.mode === "walk") continue;
      const v =
        p.mode === "bus"
          ? this.buses.find((b) => b.id === p.vehicleId)
          : this.vehicles.find((v) => v.id === p.vehicleId);
      if (!v) continue;
      const spot = p.mode === "bus" ? worldSeat(v, p.seat) : v;
      p.x = spot.x;
      p.y = spot.y;
      p.z = spot.z;
      p.yaw = v.yaw;
      p.lastMove = now;
    }
  }
  snapshot() {
    return {
      type: "snapshot",
      time: this.now(),
      players: [...this.players.values()].map(({ lastMove, ...p }) => p),
      vehicles: this.vehicles.map(({ input, inputAt, lastUsed, ...v }) => v),
      buses: this.buses,
      stops: STOPS.map((s) => {
        const seconds = (this.now() - this.epoch) / 1000;
        const boarding = this.buses.find((b) => b.stop === s.id && b.doors);
        const full = !!boarding && boarding.seats.every(Boolean);
        const next = countdown(this.schedule, seconds, s.id, !!boarding);
        return {
          id: s.id,
          next: boarding && !full ? 0 : next,
          nextService: next,
          state: boarding
            ? full
              ? "full"
              : "boarding"
            : next <= 3
              ? "arriving"
              : "waiting",
        };
      }),
      interval: this.schedule.interval,
    };
  }
}
