import { FOOTBALL, inFootballArea } from "../../shared/football-config.js";
import { footballModel } from "../world/football";
import { groundPose } from "../../shared/roads.js";
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
  private ball = footballModel();
  private footballScore = "";
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
    {
      sprite: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial>;
      canvas: HTMLCanvasElement;
      second: string;
    }
  >();
  private sent = 0;
  private voiceAt = 0;
  private seen = 0;
  private predicted: VehicleState | null = null;
  private inputSequence = 0;
  private inputs: { seq: number; input: any }[] = [];
  private correction = new T.Vector3();
  private rotationCorrection = 0;
  private previousMode = "walk";
  private sessionId = "";
  private previousId: string | null = "";
  onControls: (mode: string) => void = () => {};
  onStatus: (text: string) => void = () => {};
  constructor(
    private scene: T.Scene,
    private player: Person,
    private colliders: Collider[],
    private notice: (text: string) => void,
  ) {
    scene.add(this.ball);
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
      mic.title = this.voice.enabled ? "Microphone on" : "Microphone off";
      document.getElementById("voice-status")!.textContent = message;
    };
    for (const stop of STOPS) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 128;
      const texture = new T.CanvasTexture(canvas);
      texture.colorSpace = T.SRGBColorSpace;
      const sprite = new T.Mesh(
        new T.PlaneGeometry(3, 0.9),
        new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide }),
      );
      sprite.rotation.y = stop.sign.yaw;
      sprite.position.set(
        stop.sign.x,
        heightAt(stop.sign.x, stop.sign.z) + 2.65,
        stop.sign.z,
      );

      scene.add(sprite);
      this.boards.set(stop.id, { sprite, canvas, second: "" });
    }
    void this.voice.configure();
  }
  join(name: string) {
    this.network.connect(name);
  }
  footballAction(action: string, team?: string) {
    if (!this.network.connected || this.mode !== "walk") return;
    if (
      action === "kick" &&
      !inFootballArea(
        this.player.group.position.x,
        this.player.group.position.z,
        5,
      )
    )
      return;
    this.sendMovement();
    this.network.send({ type: "football", action, team });
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
      sprinting: !!this.player.group.userData.sprinting,
      grounded: this.player.group.userData.grounded !== false,
      moving: !!this.player.group.userData.moving,
      vx: this.player.group.userData.velocity?.[0] ?? 0,
      vy: this.player.group.userData.velocity?.[1] ?? 0,
      vz: this.player.group.userData.velocity?.[2] ?? 0,
    });
  }
  update(
    dt: number,
    time: number,
    keys: Set<string>,
    paused: boolean,
    cameraYaw = 0,
  ) {
    const snapshot = this.network.snapshot,
      self = this.network.self;
    if (!snapshot || !self) return;
    if (this.sessionId !== self.id) {
      this.sessionId = self.id;
      this.player.group.position.set(self.x, self.y, self.z);
      this.previousMode = "";
      this.predicted = null;
      this.inputs = [];
      this.correction.set(0, 0, 0);
      this.rotationCorrection = 0;
    }
    this.mode = self.mode;
    this.vehicleId = self.vehicleId;
    if (this.mode !== this.previousMode || this.vehicleId !== this.previousId) {
      this.player.group.position.set(self.x, self.y, self.z);
      this.player.group.visible = !["car", "helicopter"].includes(this.mode);
      this.previousMode = this.mode;
      this.previousId = this.vehicleId;
      this.predicted = null;
      this.inputs = [];
      this.correction.set(0, 0, 0);
      this.rotationCorrection = 0;
      this.onControls(this.mode);
    }
    const rendered =
      this.network.timeline.sample(performance.now()) ?? snapshot;
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
    if (performance.now() - this.sent > 50) {
      this.sent = performance.now();
      if (this.mode === "walk") this.sendMovement();
      else if (this.mode !== "bus") {
        const seq = ++this.inputSequence;
        this.inputs.push({ seq, input });
        if (this.inputs.length > 40) this.inputs.shift();
        this.network.send({ type: "input", seq, ...input });
      }
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
      model.visible = Math.hypot(v.x - self.x, v.z - self.z) < 220;
      let display = (rendered.vehicles.find((r: any) => r.id === v.id) ??
        v) as VehicleState;
      if (v.owner === self.id) {
        if (!this.predicted) this.predicted = { ...v };
        else if (fresh) {
          this.inputs = this.inputs.filter((i) => i.seq > (v.inputSeq ?? 0));
          const replay = { ...v };
          for (const entry of this.inputs)
            stepVehicle(replay, entry.input, 0.05, this.colliders);
          this.correction.set(
            replay.x - this.predicted.x,
            replay.y - this.predicted.y,
            replay.z - this.predicted.z,
          );
          this.rotationCorrection = Math.atan2(
            Math.sin(replay.yaw - this.predicted.yaw),
            Math.cos(replay.yaw - this.predicted.yaw),
          );
          this.predicted.speed = replay.speed;
          this.predicted.vy = replay.vy;
          if (this.correction.length() > 8) {
            this.predicted = { ...replay };
            this.correction.set(0, 0, 0);
            this.rotationCorrection = 0;
          }
        }
        const blend = 1 - Math.exp(-10 * dt);
        this.predicted.x += this.correction.x * blend;
        this.predicted.y += this.correction.y * blend;
        this.predicted.z += this.correction.z * blend;
        this.predicted.yaw += this.rotationCorrection * blend;
        this.rotationCorrection *= 1 - blend;
        this.correction.multiplyScalar(1 - blend);
        stepVehicle(this.predicted, input, dt, this.colliders);
        display = this.predicted;
        this.player.group.position.set(display.x, display.y, display.z);
        this.player.group.rotation.y = display.yaw;
      }
      const goal = new T.Vector3(display.x, display.y, display.z);
      model.position.copy(goal);
      model.rotation.y = display.yaw;
      const onRoad = model.visible
        ? groundPose(
            model.position.x,
            model.position.z,
            model.rotation.y,
            v.kind,
          )
        : display;
      if (v.kind !== "helicopter") model.position.y = onRoad.y;
      model.userData.body.rotation.x =
        v.kind === "helicopter" ? 0 : onRoad.pitch;
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
    for (const bus of rendered.buses) {
      let model = this.models.get(bus.id);
      if (!model) {
        model = vehicleModel("bus");
        this.scene.add(model);
        model.position.set(bus.x, bus.y, bus.z);
        this.models.set(bus.id, model);
      }
      model.position.set(bus.x, bus.y, bus.z);
      model.rotation.y = bus.yaw;
      model.visible = Math.hypot(bus.x - self.x, bus.z - self.z) < 220;
      const pose = model.visible
        ? groundPose(
            model.position.x,
            model.position.z,
            model.rotation.y,
            "bus",
          )
        : bus;
      model.position.y = pose.y;
      model.userData.body.rotation.x = pose.pitch;
      model.userData.door.visible = !bus.doors;
      if (this.mode === "bus" && bus.id === self.vehicleId) {
        const seat = worldSeat(
          {
            x: model.position.x,
            y: model.position.y,
            z: model.position.z,
            yaw: model.rotation.y,
            pitch: model.userData.body.rotation.x,
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
          label: bus.seats.every(Boolean)
            ? "BUS FULL · Next bus arriving soon."
            : "ENTER BUS",
          x: bus.x,
          y: bus.y,
          z: bus.z,
          range: 7.8,
          enabled: bus.seats.some((s: string | null) => !s),
        });
    }
    const football =
      this.network.ballTimeline.sample(performance.now())?.football ??
      snapshot.football;
    if (football) {
      const b = football.ball;
      this.ball.position.set(b.x, b.y, b.z);
      this.ball.rotation.x += (b.vz * dt) / FOOTBALL.radius;
      this.ball.rotation.z -= (b.vx * dt) / FOOTBALL.radius;
      this.ball.visible = Math.hypot(self.x - b.x, self.z - b.z) < 220;
    }
    const seen = new Set<string>();
    for (const p of rendered.players) {
      if (p.id === self.id) continue;
      seen.add(p.id);
      let remote = this.remotes.get(p.id);
      if (!remote) {
        const avatar = person("#85b7ab", "#aa7654", true),
          label = nameplate(
            p.displayNameMalayalam || p.originalUsername || p.name,
          );
        avatar.group.add(label);
        avatar.group.position.set(p.x, p.y, p.z);
        this.scene.add(avatar.group);
        remote = { person: avatar, label, name: p.name, state: p };
        this.remotes.set(p.id, remote);
      }
      if (remote.state.speaking !== p.speaking) {
        const label = nameplate(
          (p.speaking ? "🎤 " : "") + (p.displayNameMalayalam || p.name),
        );
        remote.label.removeFromParent();
        remote.label.material.map?.dispose();
        remote.label.material.dispose();
        remote.label = label;
        remote.person.group.add(label);
      }
      remote.state = p;
      remote.person.group.position.set(p.x, p.y, p.z);
      remote.person.group.rotation.y = p.yaw;
      const transport = p.vehicleId ? this.models.get(p.vehicleId) : null;
      if (transport) {
        if (p.mode === "bus") {
          const seat = worldSeat(
            {
              x: transport.position.x,
              y: transport.position.y,
              z: transport.position.z,
              yaw: transport.rotation.y,
              pitch: transport.userData.body.rotation.x,
            },
            p.seat ?? 0,
          );
          remote.person.group.position.set(seat.x, seat.y, seat.z);
        } else remote.person.group.position.copy(transport.position);
        remote.person.group.rotation.y = transport.rotation.y;
      }
      remote.person.group.visible =
        Math.hypot(p.x - self.x, p.z - self.z) < 160;
      remote.label.material.color.set(
        p.speaking
          ? "#b9f179"
          : p.footballTeam === "A"
            ? "#a5d9ff"
            : p.footballTeam === "B"
              ? "#ffd08b"
              : "#ffffff",
      );
      remote.label.scale.setScalar(p.speaking ? 1.08 : 1);
      remote.label.scale.multiply(new T.Vector3(3.4, 0.64, 1));
      animatePerson(
        remote.person,
        time * (p.sprinting ? 1.4 : 1),
        p.moving ? (p.sprinting ? 1 : 0.75) : 0,
      );
      if (p.grounded === false) {
        remote.person.legs.forEach((l) => (l.rotation.x = -0.35));
        remote.person.arms.forEach((l) => (l.rotation.x = -0.6));
      }
      if ((p.kickingUntil ?? 0) > snapshot.time)
        remote.person.legs[0].rotation.x = -1.1;
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
      this.voice.update(
        snapshot.players,
        {
          ...self,
          x: this.player.group.position.x,
          y: this.player.group.position.y,
          z: this.player.group.position.z,
        },
        cameraYaw,
      );
      this.updateUI();
    }
  }
  private updateUI() {
    this.updateBoards();
    const match = this.network.snapshot?.football,
      position = this.player.group.position,
      hud = document.getElementById("football-hud")!;
    const nearby =
      inFootballArea(position.x, position.z, 25) && this.mode === "walk";
    hud.classList.toggle("hidden", !nearby);
    if (match && nearby) {
      const team = match.teams[this.network.id];
      document.getElementById("football-score")!.textContent =
        `BLUE ${match.scores.A} — ${match.scores.B} AMBER`;
      const counts = Object.values(match.teams),
        minutes = Math.floor(match.remaining / 60),
        seconds = String(match.remaining % 60).padStart(2, "0");
      document.getElementById("football-clock")!.textContent = match.goal
        ? `GOAL! ${match.goal === "A" ? "Blue" : "Amber"} · Kickoff in ${Math.ceil(match.resetIn)}s`
        : match.status === "finished"
          ? "Full time · Join to start another match"
          : match.status === "playing"
            ? `${minutes}:${seconds} · ${team ? (team === "A" ? "Blue" : "Amber") + " team" : "Spectating"}`
            : "Practice · Join both teams to start";
      for (const [id, t] of [
        ["football-blue", "A"],
        ["football-amber", "B"],
      ]) {
        const button = document.getElementById(id) as HTMLButtonElement;
        button.textContent = `${team === t ? "Playing" : "Join"} ${t === "A" ? "Blue" : "Amber"} (${counts.filter((v) => v === t).length}/5)`;
        button.disabled =
          !inFootballArea(position.x, position.z, 14) ||
          (team === t && match.status !== "finished");
      }
      document
        .getElementById("football-leave")!
        .classList.toggle("hidden", !team);
      (document.getElementById("football-kick") as HTMLButtonElement).disabled =
        !team;
      const score = `${match.scores.A}:${match.scores.B}`;
      if (this.footballScore && score !== this.footballScore && match.goal)
        this.notice(`GOAL! ${match.goal === "A" ? "Blue" : "Amber"} scores.`);
      this.footballScore = score;
    }
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
      const info = this.network.snapshot?.stops.find((s) => s.id === stop.id);
      el.textContent = `${stop.name.toUpperCase()} · ${this.stopMessage(info)}`;
    } else if (this.mode === "bus") {
      const b = this.network.snapshot?.buses.find(
        (b) => b.id === this.vehicleId,
      );
      el.textContent = `SAROVARAM LOOP · SEAT ${(this.network.self?.seat ?? 0) + 1} / 20 · ${b?.doors ? "DOORS OPEN" : "EN ROUTE"}`;
    }
    document.getElementById("online-status")!.textContent =
      `● ${this.network.snapshot?.players.length ?? 1} ONLINE · ${this.network.name}`;
  }
  private stopMessage(stop?: { next: number; state: string }) {
    if (!stop) return "CONNECTING";
    const clock = `${String(Math.floor(stop.next / 60)).padStart(2, "0")}:${String(stop.next % 60).padStart(2, "0")}`;
    return stop.state === "boarding"
      ? "BOARDING"
      : stop.state === "arriving"
        ? "ARRIVING"
        : `${stop.state === "full" ? "BUS FULL · " : ""}NEXT BUS ${clock}`;
  }
  private updateBoards() {
    for (const stop of this.network.snapshot?.stops ?? []) {
      const board = this.boards.get(stop.id),
        text = this.stopMessage(stop);
      if (!board || board.second === text) continue;
      board.second = text;
      const c = board.canvas.getContext("2d")!;
      c.fillStyle = "#244a39";
      c.fillRect(0, 0, 512, 128);
      c.fillStyle = "#f4df9b";
      c.textAlign = "center";
      c.font = "bold 23px sans-serif";
      c.fillText(
        (STOPS.find((s) => s.id === stop.id)?.name ?? "") + " · BUS STOP",
        256,
        35,
        485,
      );
      c.font = "bold 35px sans-serif";
      c.fillText(text, 256, 91, 485);
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
        displayName: r.state.displayNameMalayalam,
        speaking: r.state.speaking,
        position: r.person.group.position.toArray(),
        mode: r.state.mode,
      })),
      snapshot: this.network.snapshot,
      football: { position: this.ball.position.toArray() },
      buffering: {
        delay: this.network.timeline.delay,
        rejected: this.network.timeline.rejected,
      },
      transports: [...this.models].map(([id, m]) => ({
        id,
        x: m.position.x,
        y: m.position.y,
        z: m.position.z,
        yaw: m.rotation.y,
        pitch: m.userData.body.rotation.x,
      })),
      voice: this.voice.diagnostics(),
      mic: this.voice.enabled,
    };
  }
}
