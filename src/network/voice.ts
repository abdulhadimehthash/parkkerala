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
  decoded?: AnalyserNode;
  output?: AnalyserNode;
  disconnectedAt: number;
  createdAt: number;
  restartCount: number;
  restarting: boolean;
  lastRestartAt: number;
};
export class ProximityVoice {
  stream: MediaStream | null = null;
  peers = new Map<string, Peer>();
  enabled = false;
  muted = false;
  turnConfigured = false;
  private servers: RTCIceServer[] = [];
  private configPending: Promise<void> | null = null;
  private configRefreshAt = 0;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private previousSpeaking = false;
  private speakingUntil = 0;
  private level = 0;
  private updated = 0;
  private wantMicrophone = false;
  private captureEpoch = 0;
  private deviceChanged = () => {
    if (this.wantMicrophone) void this.captureMicrophone();
  };
  private joinedId = "";
  private retryAt = new Map<string, number>();
  private pendingSignals = new Map<string, Promise<void>>();
  onStatus: (message: string) => void = () => {};
  constructor(private network: Network) {
    navigator.mediaDevices?.addEventListener(
      "devicechange",
      this.deviceChanged,
    );
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
    if (this.configPending) return this.configPending;
    const token = this.network.voiceToken;
    this.configPending = (async () => {
      try {
        const res = await fetch("/api/config", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw Error("Voice configuration unavailable");
        const config = await res.json();
        if (token !== this.network.voiceToken) {
          this.configRefreshAt = 0;
          return;
        }
        const credentialsChanged =
          JSON.stringify(this.servers) !== JSON.stringify(config.iceServers);
        this.servers = config.iceServers;
        this.turnConfigured = !!config.turnConfigured;
        this.configRefreshAt =
          Date.now() +
          Math.max(
            30000,
            (config.expiresAt || Date.now() + 600000) - Date.now() - 300000,
          );
        for (const [id, peer] of this.peers) {
          try {
            peer.pc.setConfiguration({
              ...peer.pc.getConfiguration(),
              iceServers: this.servers,
            });
          } catch {
            this.drop(id);
            continue;
          }
          if (credentialsChanged) peer.restartCount = 0;
          if (
            this.turnConfigured &&
            (credentialsChanged || peer.pc.connectionState !== "connected")
          )
            void this.restart(id);
        }
        if (config.relayUnavailable && this.enabled)
          this.onStatus(
            "Voice relay is temporarily unavailable. Direct voice is still enabled.",
          );
      } catch {
        this.configRefreshAt = Date.now() + 30000;
        if (this.enabled)
          this.onStatus("Voice settings will retry automatically.");
      } finally {
        this.configPending = null;
      }
    })();
    return this.configPending;
  }
  async toggle() {
    if (this.wantMicrophone || this.enabled) {
      this.wantMicrophone = false;
      this.captureEpoch++;
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.enabled = false;
      this.inputSource?.disconnect();
      this.analyser?.disconnect();
      this.analyser = null;
      for (const peer of this.peers.values())
        void peer.pc
          .getTransceivers()
          .find((t) => t.receiver.track.kind === "audio")
          ?.sender.replaceTrack(null);
      this.network.send({ type: "voice", mic: false, speaking: false });
      this.onStatus("Microphone off");
      return;
    }
    this.wantMicrophone = true;
    await this.captureMicrophone();
  }
  private async captureMicrophone() {
    const epoch = ++this.captureEpoch;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error("Microphone requires HTTPS.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
      if (epoch !== this.captureEpoch || !this.wantMicrophone) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const old = this.stream;
      this.stream = stream;
      this.enabled = true;
      const track = stream.getAudioTracks()[0];
      track.contentHint = "speech";
      track.onended = () => {
        if (this.wantMicrophone) {
          this.enabled = false;
          this.network.send({ type: "voice", mic: false, speaking: false });
          void this.captureMicrophone();
        }
      };
      this.context ??= new AudioContext();
      await this.context.resume();
      this.inputSource?.disconnect();
      this.analyser?.disconnect();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.inputSource = this.context.createMediaStreamSource(stream);
      this.inputSource.connect(this.analyser);
      for (const peer of this.peers.values())
        await peer.pc
          .getTransceivers()
          .find((t) => t.receiver.track.kind === "audio")
          ?.sender.replaceTrack(track);
      old?.getTracks().forEach((t) => t.stop());
      this.network.send({ type: "voice", mic: true, speaking: false });
      this.onStatus("Microphone on · nearby players can hear you");
    } catch (error) {
      if (epoch !== this.captureEpoch) return;
      if (this.stream?.getAudioTracks().some((t) => t.readyState === "live")) {
        this.enabled = true;
        this.onStatus("Using the connected microphone.");
        return;
      }
      this.enabled = false;
      this.network.send({ type: "voice", mic: false, speaking: false });
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        this.wantMicrophone = false;
        this.onStatus(
          "Microphone permission denied. Enable it in your browser to speak.",
        );
      } else
        this.onStatus(
          "Microphone unavailable. Reconnect a microphone; voice will recover automatically.",
        );
    }
  }
  private preferSpeech(transceiver: RTCRtpTransceiver) {
    const codecs = RTCRtpReceiver.getCapabilities?.("audio")?.codecs;
    if (codecs && transceiver.setCodecPreferences) {
      try {
        transceiver.setCodecPreferences([
          ...codecs.filter((c) => c.mimeType.toLowerCase() === "audio/opus"),
          ...codecs.filter((c) => c.mimeType.toLowerCase() !== "audio/opus"),
        ]);
      } catch {
        /* Keep the browser's supported fallback codecs. */
      }
    }
  }
  private async restart(id: string) {
    const peer = this.peers.get(id);
    if (!peer || peer.restarting) return;
    // Both browsers may request renewal together. Keep one negotiation alive
    // instead of interpreting the second request as a failed recovery attempt.
    const now = performance.now();
    if (peer.pc.signalingState !== "stable" || now - peer.lastRestartAt < 1500)
      return;
    if (peer.restartCount >= 1) {
      this.retry(id);
      return;
    }
    peer.restartCount++;
    peer.lastRestartAt = now;
    peer.createdAt = performance.now();
    peer.disconnectedAt = 0;
    peer.restarting = true;
    try {
      if (this.network.id < id) {
        peer.pc.restartIce();
        const offer = await peer.pc.createOffer({ iceRestart: true });
        await peer.pc.setLocalDescription(offer);
        this.network.send({
          type: "signal",
          to: id,
          signal: { description: peer.pc.localDescription },
        });
      } else
        this.network.send({
          type: "signal",
          to: id,
          signal: { restart: true },
        });
    } catch {
      this.retry(id);
    } finally {
      peer.restarting = false;
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
      restartCount: 0,
      restarting: false,
      lastRestartAt: -Infinity,
    };
    this.peers.set(id, peer);
    if (this.network.id < id) {
      const tr = pc.addTransceiver("audio", { direction: "sendrecv" });
      this.preferSpeech(tr);
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
        peer!.restartCount = 0;
      } else if (pc.connectionState === "disconnected")
        peer!.disconnectedAt = performance.now();
      else if (pc.connectionState === "failed") void this.restart(id);
    };
    return peer;
  }
  private async signal(id: string, signal: any) {
    try {
      if (signal.restart) {
        if (this.network.id < id) await this.restart(id);
        return;
      }
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
            this.preferSpeech(transceiver);
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
        if (peer.pc.connectionState === "connected") peer.restartCount = 0;
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
      this.configRefreshAt = 0;
      this.network.send({ type: "voice", mic: this.enabled, speaking: false });
    }
    if (Date.now() >= this.configRefreshAt) void this.configure();
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
        performance.now() - peer.disconnectedAt > 1800
      ) {
        void this.restart(p.id);
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
      peer.decoded = this.context.createAnalyser();
      peer.decoded.fftSize = 256;
      peer.output = this.context.createAnalyser();
      peer.output.fftSize = 256;
      peer.source
        .connect(peer.decoded)
        .connect(peer.gain)
        .connect(peer.pan)
        .connect(peer.output)
        .connect(this.context.destination);
      peer.audio.muted = true;
    } catch {
      peer.source?.disconnect();
      peer.source = undefined;
      peer.audio.muted = false;
    }
  }
  reconnect() {
    this.configRefreshAt = 0;
    void this.configure();
    for (const id of this.peers.keys()) void this.restart(id);
    this.onStatus("Reconnecting nearby voice…");
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
    peer.decoded?.disconnect();
    peer.output?.disconnect();
    peer.audio.srcObject = null;
    peer.audio.remove();
    this.peers.delete(id);
  }
  dispose() {
    this.wantMicrophone = false;
    this.captureEpoch++;
    navigator.mediaDevices?.removeEventListener(
      "devicechange",
      this.deviceChanged,
    );
    this.stream?.getTracks().forEach((t) => t.stop());
    for (const id of this.peers.keys()) this.drop(id);
    void this.context?.close();
  }
  async stats() {
    const results = [];
    for (const [id, peer] of this.peers) {
      const stats = await peer.pc.getStats();
      let received = 0,
        sent = 0,
        energy = 0,
        packetsLost = 0,
        jitter = 0,
        codec = "";
      stats.forEach((r) => {
        if (r.type === "inbound-rtp" && r.kind === "audio") {
          received += r.bytesReceived ?? 0;
          energy += r.totalAudioEnergy ?? 0;
          packetsLost += r.packetsLost ?? 0;
          jitter = Math.max(jitter, r.jitter ?? 0);
          stats.forEach((c) => {
            if (c.id === r.codecId) codec = c.mimeType ?? codec;
          });
        }
        if (r.type === "outbound-rtp" && r.kind === "audio")
          sent += r.bytesSent ?? 0;
      });
      const rms = (node?: AnalyserNode) => {
        if (!node) return 0;
        const data = new Float32Array(node.fftSize);
        node.getFloatTimeDomainData(data);
        return Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
      };
      results.push({
        id,
        received,
        sent,
        energy,
        packetsLost,
        jitter,
        codec,
        decodedRms: rms(peer.decoded),
        outputRms: rms(peer.output),
      });
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
