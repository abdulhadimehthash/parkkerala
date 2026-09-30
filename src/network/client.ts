import { SnapshotBuffer } from "../../shared/interpolation.js";
export type PlayerState = {
  id: string;
  name: string;
  originalUsername: string;
  displayNameMalayalam: string;
  sprinting: boolean;
  grounded?: boolean;
  animation?: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  moving: boolean;
  mode: string;
  vehicleId: string | null;
  seat: number | null;
  mic: boolean;
  speaking: boolean;
  footballTeam?: string | null;
  kickingUntil?: number;
};
export type VehicleState = {
  id: string;
  kind: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  speed: number;
  vy: number;
  owner: string | null;
  color: string;
  inputSeq?: number;
};
export type BusState = {
  pitch: number;
  routeS: number;
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  doors: boolean;
  stop: string | null;
  departure: number;
  seats: (string | null)[];
};
export type Snapshot = {
  type: string;
  time: number;
  seq: number;
  football?: any;
  players: PlayerState[];
  vehicles: VehicleState[];
  buses: BusState[];
  stops: { id: string; next: number; nextService: number; state: string }[];
  interval: number;
};
export class Network {
  timeline = new SnapshotBuffer(150);
  ballTimeline = new SnapshotBuffer(75);
  id = "";
  name = "";
  connected = false;
  snapshot: Snapshot | null = null;
  socket: WebSocket | null = null;
  receivedAt = 0;
  onStatus: (status: string) => void = () => {};
  onError: (message: string) => void = () => {};
  onSignal: (from: string, signal: any) => void = () => {};
  onCorrection: (p: { x: number; y: number; z: number }) => void = () => {};
  private reconnectTimer = 0;
  private closed = false;
  connect(name: string) {
    this.name = name;
    this.closed = false;
    this.onStatus("Connecting…");
    const url = new URL("/world", location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(url);
    this.socket = ws;
    ws.onopen = () => this.send({ type: "join", name });
    ws.onmessage = (e) => {
      if (ws !== this.socket) return;
      let d;
      try {
        d = JSON.parse(e.data);
      } catch {
        return;
      }
      if (d.type === "welcome") {
        this.timeline.clear();
        this.ballTimeline.clear();
        this.timeline.push(d, performance.now());
        this.ballTimeline.push(d, performance.now());
        this.id = d.id;
        this.connected = true;
        this.onStatus("Online");
        this.snapshot = d;
        this.receivedAt = performance.now();
      } else if (d.type === "snapshot") {
        if (!this.timeline.push(d, performance.now())) return;
        this.ballTimeline.push(d, performance.now());
        this.snapshot = d;
        this.receivedAt = performance.now();
      } else if (d.type === "error") {
        this.onError(d.message);
        if (!this.connected) {
          this.closed = true;
          ws.close();
        }
      } else if (d.type === "signal") this.onSignal(d.from, d.signal);
      else if (d.type === "correction") this.onCorrection(d);
    };
    ws.onerror = () => this.onStatus("Connection unavailable");
    ws.onclose = () => {
      if (ws !== this.socket) return;
      this.timeline.clear();
      this.ballTimeline.clear();
      this.connected = false;
      this.id = "";
      this.snapshot = null;
      this.onStatus(this.closed ? "Choose another username" : "Reconnecting…");
      if (!this.closed)
        this.reconnectTimer = window.setTimeout(
          () => this.connect(this.name),
          2500,
        );
    };
  }
  send(data: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(data));
  }
  get self() {
    return this.snapshot?.players.find((p) => p.id === this.id);
  }
  disconnect() {
    this.closed = true;
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }
}
