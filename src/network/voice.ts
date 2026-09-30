import { VOICE } from "../../shared/config.js";
import { Network, type PlayerState } from "./client";
import { voiceVolume } from "../../shared/world.js";
type Peer = {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  pending: RTCIceCandidateInit[];
  offered: boolean;
  volume: number;
  source?: MediaStreamAudioSourceNode;
  gain?: GainNode;
  pan?: StereoPannerNode;
  disconnectedAt: number;
  createdAt: number;
};
export class ProximityVoice {
  stream: MediaStream | null = null;
  peers = new Map<string, Peer>();
  enabled = false;
  muted = false;
  turnConfigured = false;
  private servers: RTCIceServer[] = [];
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private previousSpeaking = false;
  private speakingUntil = 0;
  private level = 0;
  private updated = 0;
  private joinedId = "";
  private retryAt = new Map<string, number>();
  private pendingSignals = new Map<string, Promise<void>>();
  onStatus: (message: string) => void = () => {};
  constructor(private network: Network) {
    network.onSignal = (id, signal) => {
      const pending = (this.pendingSignals.get(id) ?? Promise.resolve()).then(
        () => this.signal(id, signal),
      );
      this.pendingSignals.set(id, pending);
      void pending.finally(() => {
        if (this.pendingSignals.get(id) === pending)
          this.pendingSignals.delete(id);
      });
    };
  }
  async configure() {
    try {
      const res = await fetch("/api/config");
      const config = await res.json();
      this.servers = config.iceServers;
      this.turnConfigured = config.turnConfigured;
    } catch {
      this.onStatus("Voice service unavailable.");
    }
  }
  async toggle() {
    if (this.enabled) {
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.enabled = false;
      this.analyser?.disconnect();
      this.analyser = null;
      for (const peer of this.peers.values())
        void peer.pc
          .getSenders()
          .find((s) => s.track?.kind === "audio")
          ?.replaceTrack(null);
      this.network.send({ type: "voice", mic: false, speaking: false });
      this.onStatus("Microphone off");
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error("Microphone requires HTTPS.");
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      this.enabled = true;
      this.stream.getAudioTracks()[0].onended = () => {
        if (this.enabled) void this.toggle();
        this.onStatus(
          "Microphone disconnected. Reconnect a device and turn the mic on.",
        );
      };
      this.context ??= new AudioContext();
      await this.context.resume();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.context.createMediaStreamSource(this.stream).connect(this.analyser);
      for (const peer of this.peers.values()) {
        const sender = peer.pc
          .getTransceivers()
          .find((t) => t.receiver.track.kind === "audio")?.sender;
        await sender?.replaceTrack(this.stream.getAudioTracks()[0]);
      }
      this.network.send({ type: "voice", mic: true, speaking: false });
      this.onStatus("Microphone on · nearby players can hear you");
    } catch (error) {
      this.enabled = false;
      this.onStatus(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone permission denied. Enable it in your browser to speak."
          : error instanceof DOMException && error.name === "NotFoundError"
            ? "No microphone found. Connect a microphone and try again."
            : error instanceof Error
              ? error.message
              : "Microphone unavailable.",
      );
    }
  }
  private make(id: string) {
    let peer = this.peers.get(id);
    if (peer) return peer;
    const pc = new RTCPeerConnection({ iceServers: this.servers }),
      audio = document.createElement("audio");
    audio.autoplay = true;
    audio.setAttribute("playsinline", "");
    audio.dataset.peer = id;
    audio.hidden = true;
    document.body.append(audio);
    peer = {
      pc,
      audio,
      pending: [],
      offered: false,
      volume: 0,
      disconnectedAt: 0,
      createdAt: performance.now(),
    };
    this.peers.set(id, peer);
    if (this.network.id < id) {
      const tr = pc.addTransceiver("audio", { direction: "sendrecv" });
      if (this.stream)
        void tr.sender.replaceTrack(this.stream.getAudioTracks()[0]);
    }
    pc.onicecandidate = (e) => {
      if (e.candidate)
        this.network.send({
          type: "signal",
          to: id,
          signal: { candidate: e.candidate.toJSON() },
        });
    };
    pc.ontrack = (e) => {
      audio.srcObject = new MediaStream([e.track]);
      audio.volume = 0;
      this.attachSpatial(peer!);
      void audio
        .play()
        .catch(() =>
          this.onStatus(
            "Click “Enable voice listening” in settings to hear nearby players.",
          ),
        );
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        peer!.disconnectedAt = 0;
        this.retryAt.delete(id);
      } else if (pc.connectionState === "disconnected")
        peer!.disconnectedAt = performance.now();
      else if (pc.connectionState === "failed") this.retry(id);
    };
    return peer;
  }
  private async signal(id: string, signal: any) {
    try {
      if (signal.reset) {
        this.drop(id);
        this.retryAt.set(id, performance.now() + 500);
        return;
      }
      const peer = this.make(id);
      if (signal.description) {
        await peer.pc.setRemoteDescription(signal.description);
        for (const candidate of peer.pending)
          await peer.pc.addIceCandidate(candidate);
        peer.pending = [];
        if (signal.description.type === "offer") {
          const transceiver = peer.pc
            .getTransceivers()
            .find((t) => t.receiver.track.kind === "audio");
          if (transceiver) {
            transceiver.direction = "sendrecv";
            await transceiver.sender.replaceTrack(
              this.stream?.getAudioTracks()[0] ?? null,
            );
          }
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          this.network.send({
            type: "signal",
            to: id,
            signal: { description: peer.pc.localDescription },
          });
        }
      } else if (signal.candidate) {
        if (peer.pc.remoteDescription)
          await peer.pc.addIceCandidate(signal.candidate);
        else peer.pending.push(signal.candidate);
      }
    } catch {
      this.onStatus("Voice connection interrupted.");
    }
  }
  update(players: PlayerState[], self: PlayerState | undefined, cameraYaw = 0) {
    if (!self) {
      for (const id of this.peers.keys()) this.drop(id);
      return;
    }
    if (this.joinedId !== self.id) {
      this.joinedId = self.id;
      this.network.send({ type: "voice", mic: this.enabled, speaking: false });
    }
    const nearby = new Set<string>();
    for (const p of players) {
      if (p.id === self.id) continue;
      const distance = Math.hypot(p.x - self.x, p.y - self.y, p.z - self.z);
      if (distance > VOICE.connectionRadius || (!p.mic && !this.enabled))
        continue;
      nearby.add(p.id);
      if (performance.now() < (this.retryAt.get(p.id) ?? 0)) continue;
      const peer = this.make(p.id);
      peer.volume = this.muted ? 0 : voiceVolume(distance);
      if (
        peer.pc.connectionState !== "connected" &&
        performance.now() - peer.createdAt > 12000
      ) {
        this.retry(p.id);
        continue;
      }
      if (
        peer.disconnectedAt &&
        performance.now() - peer.disconnectedAt > 8000
      ) {
        this.retry(p.id);
        continue;
      }
      this.attachSpatial(peer);
      const pan =
        (((p.x - self.x) * Math.cos(cameraYaw) -
          (p.z - self.z) * Math.sin(cameraYaw)) /
          Math.max(1, distance)) *
        VOICE.maxPan;
      if (peer.gain && this.context) {
        peer.audio.muted = true;
        peer.gain.gain.setTargetAtTime(
          peer.volume,
          this.context.currentTime,
          0.08,
        );
        peer.pan?.pan.setTargetAtTime(pan, this.context.currentTime, 0.08);
      } else peer.audio.volume = peer.volume;
      if (this.network.id < p.id && !peer.offered) {
        peer.offered = true;
        void peer.pc
          .createOffer()
          .then(async (offer) => {
            await peer.pc.setLocalDescription(offer);
            this.network.send({
              type: "signal",
              to: p.id,
              signal: { description: peer.pc.localDescription },
            });
          })
          .catch(() => {});
      }
    }
    for (const id of this.peers.keys()) if (!nearby.has(id)) this.drop(id);
    if (performance.now() - this.updated > 200) {
      this.updated = performance.now();
      let speaking = false;
      if (this.enabled && this.analyser) {
        const values = new Uint8Array(256);
        this.analyser.getByteTimeDomainData(values);
        this.level = Math.sqrt(
          values.reduce((sum, v) => sum + Math.pow((v - 128) / 128, 2), 0) /
            256,
        );
        if (this.level > 0.018) this.speakingUntil = performance.now() + 350;
        speaking = performance.now() < this.speakingUntil;
      }
      if (speaking !== this.previousSpeaking) {
        this.previousSpeaking = speaking;
        this.network.send({ type: "voice", mic: this.enabled, speaking });
      }
    }
  }
  private retry(id: string) {
    this.network.send({ type: "signal", to: id, signal: { reset: true } });
    this.drop(id);
    this.retryAt.set(id, performance.now() + 2500);
    this.onStatus(
      this.turnConfigured
        ? "Voice reconnecting…"
        : "Voice reconnecting… A TURN relay may be needed on restricted networks.",
    );
  }
  private attachSpatial(peer: Peer) {
    if (
      peer.source ||
      !this.context ||
      !(peer.audio.srcObject instanceof MediaStream)
    )
      return;
    try {
      peer.source = this.context.createMediaStreamSource(peer.audio.srcObject);
      peer.gain = this.context.createGain();
      peer.gain.gain.value = 0;
      peer.pan = this.context.createStereoPanner();
      peer.source
        .connect(peer.gain)
        .connect(peer.pan)
        .connect(this.context.destination);
      peer.audio.muted = true;
    } catch {
      peer.source?.disconnect();
      peer.source = undefined;
      peer.audio.muted = false;
    }
  }
  listen() {
    this.context ??= new AudioContext();
    void this.context.resume();
    for (const peer of this.peers.values()) this.attachSpatial(peer);
    for (const peer of this.peers.values())
      void peer.audio.play().catch(() => {});
  }
  private drop(id: string) {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    peer.source?.disconnect();
    peer.gain?.disconnect();
    peer.pan?.disconnect();
    peer.audio.srcObject = null;
    peer.audio.remove();
    this.peers.delete(id);
  }
  dispose() {
    this.stream?.getTracks().forEach((t) => t.stop());
    for (const id of this.peers.keys()) this.drop(id);
    void this.context?.close();
  }
  async stats() {
    const results = [];
    for (const [id, peer] of this.peers) {
      const stats = await peer.pc.getStats();
      let received = 0,
        sent = 0;
      stats.forEach((r) => {
        if (r.type === "inbound-rtp" && r.kind === "audio")
          received += r.bytesReceived ?? 0;
        if (r.type === "outbound-rtp" && r.kind === "audio")
          sent += r.bytesSent ?? 0;
      });
      results.push({ id, received, sent });
    }
    return results;
  }
  diagnostics() {
    return [...this.peers].map(([id, p]) => ({
      id,
      state: p.pc.connectionState,
      volume: p.volume,
      pan: p.pan?.pan.value ?? 0,
      spatial: !!p.source,
      inputLevel: this.level,
    }));
  }
}
