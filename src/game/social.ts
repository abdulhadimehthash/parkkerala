import * as T from "three";
import {
  Network,
  type VehicleState,
  type PlayerState,
} from "../network/client";
import { ProximityVoice } from "../network/voice";
import { person, animatePerson, type Person, type Collider } from "../world";
import { vehicleModel, nameplate } from "./models";
import { Interactions } from "./interactions";
import { stepVehicle, worldSeat } from "../../shared/simulation.js";
import { STOPS, heightAt } from "../../shared/world.js";
export class SocialGame {
  network = new Network();
  voice = new ProximityVoice(this.network);
  interactions = new Interactions();
  mode = "walk";
  vehicleId: string | null = null;
  models = new Map<string, T.Group>();
  remotes = new Map<
    string,
    { person: Person; label: T.Sprite; name: string; state: PlayerState }
  >();
  private boards = new Map<
    string,
    { sprite: T.Sprite; canvas: HTMLCanvasElement; second: number }
  >();
  private sent = 0;
  private voiceAt = 0;
  private seen = 0;
  private predicted: VehicleState | null = null;
  private previousMode = "walk";
  private previousId: string | null = "";
  onControls: (mode: string) => void = () => {};
  onStatus: (text: string) => void = () => {};
  constructor(
    private scene: T.Scene,
    private player: Person,
    private colliders: Collider[],
    private notice: (text: string) => void,
  ) {
    this.network.onError = notice;
    this.network.onStatus = (text) => {
      this.onStatus(text);
      if (!this.network.connected) {
        this.mode = "walk";
        this.player.group.visible = true;
        this.voice.update([], undefined);
      }
    };
    this.network.onCorrection = (p) =>
      this.player.group.position.set(p.x, p.y, p.z);
    this.voice.onStatus = (message) => {
      notice(message);
      const mic = document.getElementById("microphone")!;
      mic.setAttribute("aria-pressed", String(this.voice.enabled));
      mic.classList.toggle("enabled", this.voice.enabled);
      mic.title=this.voice.enabled?"Microphone on":"Microphone off";
      document.getElementById("voice-status")!.textContent = message;
    };
    for (const stop of STOPS) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 128;
      const texture = new T.CanvasTexture(canvas);
      texture.colorSpace = T.SRGBColorSpace;
      const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture }));
      sprite.position.set(
        stop.x + 11,
        heightAt(stop.x + 11, stop.z) + 5.9,
        stop.z,
      );
      sprite.scale.set(6.5, 1.625, 1);
      scene.add(sprite);
      this.boards.set(stop.id, { sprite, canvas, second: -1 });
    }
    void this.voice.configure();
  }
  join(name: string) {
    this.network.connect(name);
  }
  interact() {
    if (!this.network.connected) {
      this.notice("Reconnect to the world to use transport.");
      return;
    }
    this.sendMovement();
    const p = this.player.group.position;
    const target = this.interactions.closest(p.x, p.y, p.z);
    if (this.mode === "walk" && !target) return;
    if (target && !target.enabled && this.mode === "walk") {
      this.notice(target.label);
      return;
    }
    this.network.send({
      type: "interact",
      target: this.mode === "walk" ? target?.id : this.vehicleId,
    });
  }
  sendMovement() {
    const p = this.player.group.position;
    this.network.send({
      type: "move",
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: this.player.group.rotation.y,
      moving: this.player.legs.some((l) => Math.abs(l.rotation.x) > 0.1),
    });
  }
  update(dt: number, time: number, keys: Set<string>, paused: boolean) {
    const snapshot = this.network.snapshot,
      self = this.network.self;
    if (!snapshot || !self) return;
    this.mode = self.mode;
    this.vehicleId = self.vehicleId;
    if (this.mode !== this.previousMode || this.vehicleId !== this.previousId) {
      this.player.group.position.set(self.x, self.y, self.z);
      this.player.group.visible = !["car", "helicopter"].includes(this.mode);
      this.previousMode = this.mode;
      this.previousId = this.vehicleId;
      this.predicted = null;
      this.onControls(this.mode);
    }
    const input = {
      throttle: paused
        ? 0
        : (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0),
      steer: paused
        ? 0
        : (keys.has("KeyA") ? 1 : 0) - (keys.has("KeyD") ? 1 : 0),
      brake: paused || keys.has("Space"),
      lift: paused
        ? 0
        : (keys.has("Space") ? 1 : 0) - (keys.has("KeyC") ? 1 : 0),
      turn: paused
        ? 0
        : (keys.has("KeyQ") ? 1 : 0) - (keys.has("KeyR") ? 1 : 0),
    };
    if (performance.now() - this.sent > 100) {
      this.sent = performance.now();
      if (this.mode === "walk") this.sendMovement();
      else if (this.mode !== "bus")
        this.network.send({ type: "input", ...input });
    }
    const fresh = this.seen !== snapshot.time;
    this.seen = snapshot.time;
    this.interactions.items = [];
    for (const v of snapshot.vehicles) {
      let model = this.models.get(v.id);
      if (!model) {
        model = vehicleModel(v.kind, v.color);
        this.scene.add(model);
        model.position.set(v.x, v.y, v.z);
        this.models.set(v.id, model);
      }
      let display = v;
      if (v.owner === self.id) {
        if (!this.predicted || fresh) {
          this.predicted = { ...v };
        }
        stepVehicle(this.predicted, input, dt, this.colliders);
        display = this.predicted;
        this.player.group.position.set(display.x, display.y, display.z);
        this.player.group.rotation.y = display.yaw;
      }
      const goal = new T.Vector3(display.x, display.y, display.z);
      model.position.lerp(goal, 1 - Math.exp(-14 * dt));
      model.rotation.y +=
        Math.atan2(
          Math.sin(display.yaw - model.rotation.y),
          Math.cos(display.yaw - model.rotation.y),
        ) *
        (1 - Math.exp(-14 * dt));
      model.userData.body.rotation.x = display.pitch || 0;
      if (model.userData.rotor)
        model.userData.rotor.rotation.y += dt * (v.owner ? 35 : 1);
      this.interactions.items.push({
        id: v.id,
        label: v.owner
          ? "VEHICLE IN USE"
          : v.kind === "car"
            ? "ENTER CAR"
            : v.kind === "bike"
              ? "RIDE BIKE"
              : "ENTER HELICOPTER",
        x: v.x,
        y: v.y,
        z: v.z,
        range: 5.7,
        enabled: !v.owner,
      });
    }
    for (const bus of snapshot.buses) {
      let model = this.models.get(bus.id);
      if (!model) {
        model = vehicleModel("bus");
        this.scene.add(model);
        model.position.set(bus.x, bus.y, bus.z);
        this.models.set(bus.id, model);
        const label = nameplate("PK • SAROVARAM LOOP");
        label.position.y = 4.2;
        model.add(label);
      }
      model.position.lerp(
        new T.Vector3(bus.x, bus.y, bus.z),
        1 - Math.exp(-13 * dt),
      );
      model.rotation.y +=
        Math.atan2(
          Math.sin(bus.yaw - model.rotation.y),
          Math.cos(bus.yaw - model.rotation.y),
        ) *
        (1 - Math.exp(-13 * dt));
      model.userData.door.visible = !bus.doors;
      if (this.mode === "bus" && bus.id === self.vehicleId) {
        const seat = worldSeat(
          {
            x: model.position.x,
            y: model.position.y,
            z: model.position.z,
            yaw: model.rotation.y,
          },
          self.seat ?? 0,
        );
        this.player.group.position.set(seat.x, seat.y, seat.z);
        this.player.group.rotation.y = model.rotation.y;
        this.player.legs.forEach((l) => (l.rotation.x = -Math.PI / 2));
        this.player.arms.forEach((l) => (l.rotation.x = -0.6));
      }
      if (bus.doors)
        this.interactions.items.push({
          id: bus.id,
          label: bus.seats.every(Boolean) ? "BUS FULL" : "ENTER BUS",
          x: bus.x,
          y: bus.y,
          z: bus.z,
          range: 7.8,
          enabled: bus.seats.some((s) => !s),
        });
    }
    const seen = new Set<string>();
    for (const p of snapshot.players) {
      if (p.id === self.id) continue;
      seen.add(p.id);
      let remote = this.remotes.get(p.id);
      if (!remote) {
        const avatar = person("#85b7ab", "#aa7654", true),
          label = nameplate(p.name);
        avatar.group.add(label);
        avatar.group.position.set(p.x, p.y, p.z);
        this.scene.add(avatar.group);
        remote = { person: avatar, label, name: p.name, state: p };
        this.remotes.set(p.id, remote);
      }
      remote.state = p;
      remote.person.group.position.lerp(
        new T.Vector3(p.x, p.y, p.z),
        1 - Math.exp(-12 * dt),
      );
      remote.person.group.rotation.y +=
        Math.atan2(
          Math.sin(p.yaw - remote.person.group.rotation.y),
          Math.cos(p.yaw - remote.person.group.rotation.y),
        ) *
        (1 - Math.exp(-12 * dt));
      remote.person.group.visible =
        Math.hypot(p.x - self.x, p.z - self.z) < 160;
      remote.label.material.color.set(p.speaking ? "#b9f179" : "#ffffff");
      remote.label.scale.setScalar(p.speaking ? 1.08 : 1);
      remote.label.scale.multiply(new T.Vector3(3.4, 0.64, 1));
      animatePerson(remote.person, time, p.moving ? 0.75 : 0);
      if (p.mode === "bus")
        remote.person.legs.forEach((l) => (l.rotation.x = -Math.PI / 2));
      if (["car", "helicopter"].includes(p.mode))
        remote.person.group.position.y += 1;
    }
    for (const [id, remote] of this.remotes)
      if (!seen.has(id)) {
        remote.person.group.removeFromParent();
        remote.label.material.map?.dispose();
        remote.label.material.dispose();
        this.remotes.delete(id);
      }
    if (performance.now() - this.voiceAt > 150) {
      this.voiceAt = performance.now();
      this.voice.update(snapshot.players, {
        ...self,
        x: this.player.group.position.x,
        y: this.player.group.position.y,
        z: this.player.group.position.z,
      });
      this.updateUI();
    }
  }
  private updateUI() {
    this.updateBoards();
    const p = this.player.group.position,
      context = document.getElementById("interaction")!,
      target = this.interactions.closest(p.x, p.y, p.z);
    let text = "";
    if (this.mode !== "walk") {
      const bus = this.network.snapshot?.buses.find(
        (b) => b.id === this.vehicleId,
      );
      text =
        this.mode === "bus"
          ? bus?.doors
            ? "[E] EXIT BUS · DOORS OPEN"
            : "SEATED · EXIT AT NEXT STOP"
          : "[E] EXIT " + this.mode.toUpperCase();
    } else if (target) text = `${target.enabled ? "[E] " : ""}${target.label}`;
    context.textContent = text;
    context.classList.toggle("hidden", !text);
    const stop = STOPS.find((s) => Math.hypot(s.x - p.x, s.z - p.z) < 26),
      el = document.getElementById("bus-countdown")!;
    el.classList.toggle("hidden", !stop && this.mode !== "bus");
    if (stop) {
      const next =
        this.network.snapshot?.stops.find((s) => s.id === stop.id)?.next ?? 0;
      el.textContent = `${stop.name.toUpperCase()} · ${next === 0 ? "BUS AT STOP" : `NEXT BUS ${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`}`;
    } else if (this.mode === "bus") {
      const b = this.network.snapshot?.buses.find(
        (b) => b.id === this.vehicleId,
      );
      el.textContent = `SAROVARAM LOOP · SEAT ${(this.network.self?.seat ?? 0) + 1} / 20 · ${b?.doors ? "DOORS OPEN" : "EN ROUTE"}`;
    }
    document.getElementById("online-status")!.textContent =
      `● ${this.network.snapshot?.players.length ?? 1} ONLINE · ${this.network.name}`;
  }
  private updateBoards() {
    for (const stop of this.network.snapshot?.stops ?? []) {
      const board = this.boards.get(stop.id);
      if (!board || board.second === stop.next) continue;
      board.second = stop.next;
      const c = board.canvas.getContext("2d")!;
      c.fillStyle = "#244a39";
      c.fillRect(0, 0, 512, 128);
      c.fillStyle = "#f4df9b";
      c.textAlign = "center";
      c.font = "bold 22px sans-serif";
      c.fillText("PARK KERALA • SAROVARAM LOOP", 256, 35);
      c.font = "bold 38px sans-serif";
      c.fillText(
        stop.next === 0
          ? "BUS AT STOP"
          : `NEXT BUS  ${String(Math.floor(stop.next / 60)).padStart(2, "0")}:${String(stop.next % 60).padStart(2, "0")}`,
        256,
        92,
      );
      board.sprite.material.map!.needsUpdate = true;
    }
  }
  obstructed(x: number, z: number, y: number) {
    for (const v of [
      ...(this.network.snapshot?.vehicles ?? []),
      ...(this.network.snapshot?.buses ?? []),
    ]) {
      if (v.id === this.vehicleId || y > v.y + 3.5) continue;
      const dx = x - v.x,
        dz = z - v.z,
        lx = dx * Math.cos(v.yaw) - dz * Math.sin(v.yaw),
        lz = dx * Math.sin(v.yaw) + dz * Math.cos(v.yaw);
      const bus = v.id.startsWith("bus");
      if (Math.abs(lx) < (bus ? 1.8 : 1.4) && Math.abs(lz) < (bus ? 5.3 : 2.6))
        return true;
    }
    return false;
  }
  drawMap(
    c: CanvasRenderingContext2D,
    X: (n: number) => number,
    Z: (n: number) => number,
    mini: boolean,
  ) {
    for (const stop of STOPS) {
      c.fillStyle = "#f9edc6";
      c.strokeStyle = "#53745c";
      c.lineWidth = 1;
      c.fillRect(X(stop.x) - 3, Z(stop.z) - 3, 6, 6);
      c.strokeRect(X(stop.x) - 3, Z(stop.z) - 3, 6, 6);
      if (!mini) {
        c.fillStyle = "#335842";
        c.font = "10px sans-serif";
        c.fillText("BUS", X(stop.x) + 10, Z(stop.z));
      }
    }
    for (const bus of this.network.snapshot?.buses ?? []) {
      c.fillStyle = "#ac644b";
      c.fillRect(X(bus.x) - 4, Z(bus.z) - 3, 8, 6);
    }
    for (const p of this.network.snapshot?.players ?? []) {
      if (p.id === this.network.id) continue;
      c.fillStyle = "#396e99";
      c.beginPath();
      c.arc(X(p.x), Z(p.z), 4, 0, Math.PI * 2);
      c.fill();
    }
  }
  diagnostics() {
    return {
      connected: this.network.connected,
      id: this.network.id,
      mode: this.mode,
      vehicleId: this.vehicleId,
      remotePlayers: [...this.remotes.values()].map((r) => ({
        name: r.name,
        position: r.person.group.position.toArray(),
        mode: r.state.mode,
      })),
      snapshot: this.network.snapshot,
      voice: this.voice.diagnostics(),
      mic: this.voice.enabled,
    };
  }
}
