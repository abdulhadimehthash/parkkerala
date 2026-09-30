import {
  ROADS,
  MAIN_ROAD,
  ROAD_STOPS,
  roadFrame,
  groundPose,
  surfaceHeight,
  walkingHeight,
  validateRoads,
} from "../shared/roads.js";
import { roadDebugGroup } from "./world/terrain";
import { MOVEMENT } from "../shared/config.js";
import * as T from "three";
import {
  createWorld,
  person,
  animatePerson,
  zoneAt,
  zones,
  WORLD,
  type WorldData,
} from "./world";
import "./style.css";
import {
  heightAt,
  BOUNDS,
  HILL_ROAD,
  STOPS,
  PARK,
  sanitizeName,
} from "../shared/world.js";
import { SocialGame } from "./game/social";

const palmIcon =
  '<svg viewBox="0 0 40 40" fill="none"><path d="M17 35Q24 19 20 10M20 11Q7 5 4 19M20 11Q27 1 36 10M20 11Q33 9 37 23M20 11Q12 0 6 6" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><path d="M10 35H28" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const icons = {
  sound:
    '<svg viewBox="0 0 24 24"><path d="m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>',
  fullscreen:
    '<svg viewBox="0 0 24 24"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/></svg>',
  coin: '<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>',
};
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<canvas id="world" aria-label="Park Kerala 3D game world"></canvas>
<div class="vignette"></div>
<header class="brand"><span class="brand-icon">${palmIcon}</span><div><h1>PARK KERALA</h1><p>A LITTLE KERALA. A WORLD TO WANDER.</p></div></header>
<div id="hud" class="hidden"><div class="score">${icons.coin}<strong id="points">0</strong><span>POINTS</span><i></i><span id="found">0 / 36</span></div></div>
<nav class="tools" aria-label="Game controls"><span class="weather"><span class="sun">☀</span> GOLDEN HOUR</span><button id="sound" aria-label="Enable ambient sound" title="Ambient sound" aria-pressed="false">${icons.sound}<span class="sound-off"></span></button><button id="fullscreen" aria-label="Toggle fullscreen" title="Fullscreen">${icons.fullscreen}</button><button id="microphone" aria-label="Toggle microphone" title="Microphone off" aria-pressed="false"><svg viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></svg></button><button id="settings" aria-label="Open settings" title="Settings">${icons.settings}</button></nav>
<div class="compass" id="compass"><span>W</span><i></i><span class="active">N</span><i></i><span>E</span></div>
<section id="welcome"><div class="eyebrow"><span></span> YOUR LITTLE ESCAPE</div><h2>Take the<br/>scenic way.</h2><p>Warm chai. Coconut skies. A world to share.<br/>Find your people on the scenic way.</p><label class="username-label" for="username">What should we call you?</label><input id="username" maxlength="20" placeholder="Your username" autocomplete="off" aria-describedby="username-error"/><div id="username-error" role="status"></div><button id="enter" disabled><span id="load-label">Growing coconut trees…</span><span class="arrow">↗</span></button><div class="load-track"><i id="progress"></i></div><div class="welcome-meta"><span>ORIGINAL OPEN WORLD</span><span>MEET YOU OUT THERE</span></div></section>
<div id="postcard"><div class="postcard-index">01 / 09 <span>✦</span></div><p>ചായപ്പുറം</p><h3>Greetings from<br/>Chayapuram.</h3><span class="postcard-footer">KERALA, AT YOUR OWN PACE <b>↗</b></span></div>
<div id="location" class="hidden"><div class="location-label"><span class="live-dot"></span><span id="area-kind">THE TOWN SQUARE</span></div><h2 id="area-name">Chayapuram</h2><p><span id="area-local">ചായപ്പുറം</span><span class="sep">/</span><span id="discovered">1 of ${zones.length} places discovered</span></p></div>
<button id="minimap-wrap" aria-label="Open world map" class="hidden"><div class="map-top"><span>THE NEIGHBOURHOOD</span>${icons.map}</div><canvas id="minimap" width="300" height="200"></canvas><div class="map-bottom"><span><i></i> YOU ARE HERE</span><span><kbd>M</kbd> MAP</span></div></button>
<div id="controls" class="hidden"><span><kbd>W</kbd><span class="key-row"><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span></span><span>Move</span><i></i><kbd>SHIFT</kbd><span>Sprint</span><i></i><kbd>SPACE</kbd><span>Jump</span><i></i><span class="mouse-icon"></span><span>Drag to look</span></div>
<div id="online-status" class="hidden"></div><button id="interaction" class="hidden"></button><div id="bus-countdown" class="hidden"></div><div id="toast" role="status" aria-live="polite"></div>
<div id="pause-hint" class="hidden">Click the world to continue exploring</div>
<div class="modal-backdrop hidden" id="settings-modal"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><button class="close" aria-label="Close settings">×</button><div class="eyebrow">MAKE YOURSELF AT HOME</div><h2 id="settings-title">Your kind of Kerala.</h2><label class="setting">Visual quality<select id="quality"><option value="balanced">Balanced</option><option value="high">High</option><option value="low">Lightweight</option></select></label><label class="setting">Camera sensitivity<input id="sensitivity" type="range" min="0.001" max="0.008" step="0.0005" value="0.003"/></label><label class="setting">Ambient sound<input id="audio-toggle" type="checkbox"/></label><div class="settings-note">WASD / arrow keys to move · Shift to sprint · Space to jump.<br/>Drag anywhere in the world to look around. Press L to lock the mouse. E interacts with transport. Esc releases it. M opens the map.<br/><br/>Points and discoveries stay for this visit.</div><label class="setting">Mute other players<input id="mute-players" type="checkbox"/></label><button class="text-button" id="voice-listen">Enable voice listening</button><p id="voice-status" class="settings-note">Microphone off. Live proximity voice only; no recording.</p><button class="text-button" id="roadmap-button">View the roadmap ↗</button><br/><br/><button class="text-button" id="respawn">Return to the town square ↗</button><button class="primary resume">Back to the world →</button></section></div>
<div class="modal-backdrop hidden" id="map-modal"><section class="modal map-modal" role="dialog" aria-modal="true" aria-labelledby="map-title"><button class="close" aria-label="Close map">×</button><div class="eyebrow">THERE'S MORE AROUND THE CORNER</div><h2 id="map-title">A world to wander.</h2><div class="big-map-container"><canvas id="big-map" width="960" height="960"></canvas><div class="map-legend"><span>● You</span><span>✦ Places to discover</span><span>◆ Collectibles</span></div></div><p class="map-description">Follow a road. Cross a bridge. Find your favourite corner.</p></section></div>
<div id="touch-controls" class="hidden"><div id="joystick"><div id="stick"></div></div><button id="touch-jump" aria-label="Jump">↑</button><button id="touch-sprint" aria-label="Toggle sprint">⇧</button></div>
<div id="roadmap-modal" class="modal-backdrop hidden"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="roadmap-title"><button class="close" aria-label="Close roadmap">×</button><div class="eyebrow">PARK KERALA · THE JOURNEY</div><h2 id="roadmap-title">A world growing together.</h2><h3>Available in this build</h3><ul class="roadmap-list"><li>Open world & hilly roads</li><li>Sarovaram Park & lake paths</li><li>Username sessions & real players</li><li>7 cars, 14 bikes & 4 helicopters</li><li>Continuous 30-second buses & 20 seats each</li><li>100m live voice & subtle spatial audio</li><li>Live map & Malayalam nameplates</li></ul><p class="settings-note">Voice needs microphone permission. Networks that block direct connections need a configured TURN relay.</p><h3>Coming next</h3><p class="settings-note">More parks and towns · boats · more bus routes · character customization · park activities · new landmarks</p></section></div><div id="error" class="hidden" role="alert"></div>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
let world: WorldData, renderer: T.WebGLRenderer;
let social: SocialGame;
const scene = new T.Scene();
scene.background = new T.Color("#b4d9d3");
scene.fog = new T.Fog("#b4d9d3", 190, 670);
const camera = new T.PerspectiveCamera(
  52,
  innerWidth / innerHeight,
  0.15,
  1000,
);
const player = person("#e6b453", "#ad7455", true);
player.group.position.set(0, 0.25, 29);
scene.add(player.group);
const hemi = new T.HemisphereLight("#ecf5df", "#708557", 2.5);
scene.add(hemi);
const sun = new T.DirectionalLight("#fff0c9", 3.1);
sun.position.set(-60, 90, 55);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -65;
sun.shadow.camera.right = 65;
sun.shadow.camera.top = 65;
sun.shadow.camera.bottom = -65;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 220;
sun.shadow.normalBias = 0.045;
sun.shadow.bias = -0.0002;
sun.shadow.radius = 3;
scene.add(sun, sun.target);
let jumpQueued = false;
let motionX = 0,
  motionZ = 0,
  controlYaw = 0,
  wasMoving = false,
  lastManualLook = 0;
let started = false,
  paused = false,
  ready = false,
  yaw = 0,
  pitch = 0.36,
  verticalSpeed = 0,
  grounded = true,
  sprint = false,
  points = 0,
  sensitivity = 0.003,
  elapsed = 0,
  toastTimer = 0,
  quality = "balanced";
const keys = new Set<string>(),
  discovered = new Set<string>([zones[0].name]);
let currentArea = zones[0].name,
  modal: HTMLElement | null = null,
  dragging = false,
  lastX = 0,
  lastY = 0,
  touchX = 0,
  touchY = 0,
  frames = 0,
  fps = 60,
  fpsTime = 0;
const cameraGoal = new T.Vector3(),
  target = new T.Vector3(),
  ray = new T.Ray(),
  box = new T.Box3(),
  intersection = new T.Vector3();
const startPos = new T.Vector3(0, 0.25, 29);
function notice(message: string) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(
    () => $("toast").classList.remove("visible"),
    3500,
  );
}
function showModal(el: HTMLElement) {
  modal = el;
  paused = true;
  keys.clear();
  jumpQueued = false;
  touchX = touchY = 0;
  if (document.pointerLockElement) document.exitPointerLock();
  el.classList.remove("hidden");
  el.querySelector<HTMLButtonElement>("button")?.focus();
  if (el.id === "map-modal") drawMap($<HTMLCanvasElement>("big-map"), false);
}
function closeModal() {
  modal?.classList.add("hidden");
  modal = null;
  paused = false;
  $("world").focus();
}
$("microphone").onclick = () => {
  if (!started) {
    notice("Enter the world before enabling your microphone.");
    return;
  }
  void social.voice.toggle();
};
$("mute-players").onchange = (e) =>
  (social.voice.muted = (e.target as HTMLInputElement).checked);
$("voice-listen").onclick = () => social.voice.listen();
$("roadmap-button").onclick = () => {
  closeModal();
  showModal($("roadmap-modal"));
};
$("interaction").onclick = () => social.interact();
$("settings").onclick = () => showModal($("settings-modal"));
$("minimap-wrap").onclick = () => showModal($("map-modal"));
document
  .querySelectorAll(".close,.resume")
  .forEach((b) => b.addEventListener("click", closeModal));
document.querySelectorAll(".modal-backdrop").forEach((b) =>
  b.addEventListener("click", (e) => {
    if (e.target === b) closeModal();
  }),
);
$("respawn").onclick = () => {
  if (social?.mode !== "walk") {
    notice("Exit your vehicle before returning to town.");
    return;
  }
  social?.network.send({ type: "respawn" });
  player.group.position.copy(startPos);
  motionX = 0;
  motionZ = 0;
  wasMoving = false;
  verticalSpeed = 0;
  grounded = true;
  yaw = 0;
  pitch = 0.36;
  closeModal();
  notice("Back where the chai is warm.");
};
$("fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    notice("Fullscreen is not available in this browser.");
  }
};
$("sensitivity").oninput = (e) =>
  (sensitivity = Number((e.target as HTMLInputElement).value));
$("quality").onchange = (e) => {
  quality = (e.target as HTMLSelectElement).value;
  renderer.setPixelRatio(
    Math.min(
      devicePixelRatio,
      quality === "high" ? 2 : quality === "low" ? 1 : 1.5,
    ),
  );
  renderer.shadowMap.enabled = quality !== "low";
  sun.shadow.mapSize.setScalar(quality === "high" ? 2048 : 1024);
  sun.shadow.map?.dispose();
  sun.shadow.map = null;
  scene.traverse((o) => {
    if (o instanceof T.Mesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => (m.needsUpdate = true));
    }
  });
};
// Entirely local synthesized ambience. Audio starts only after a user gesture.
let audio: AudioContext | null = null,
  audioGain: GainNode | null = null,
  audioOn = false,
  birdTimer = 0;
function toggleAudio() {
  audioOn = !audioOn;
  if (!audio) {
    audio = new AudioContext();
    audioGain = audio.createGain();
    audioGain.gain.value = 0;
    audioGain.connect(audio.destination);
    const buffer = audio.createBuffer(
      1,
      audio.sampleRate * 4,
      audio.sampleRate,
    );
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + Math.random() * 0.04 - 0.02) / 1.02;
      data[i] = last * 0.5;
    }
    const wind = audio.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    const filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 450;
    wind.connect(filter);
    filter.connect(audioGain);
    wind.start();
    birdTimer = window.setInterval(() => {
      if (!audioOn || !audio || !audioGain) return;
      const osc = audio.createOscillator(),
        gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(
        1700 + Math.random() * 700,
        audio.currentTime,
      );
      osc.frequency.exponentialRampToValueAtTime(
        3200,
        audio.currentTime + 0.12,
      );
      gain.gain.setValueAtTime(0, audio.currentTime);
      gain.gain.linearRampToValueAtTime(0.025, audio.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(audioGain);
      osc.start();
      osc.stop(audio.currentTime + 0.3);
    }, 1900);
  }
  audio.resume().catch(() => {});
  audioGain!.gain.setTargetAtTime(audioOn ? 0.45 : 0, audio.currentTime, 0.3);
  $("sound").setAttribute("aria-pressed", String(audioOn));
  $("sound").setAttribute(
    "aria-label",
    audioOn ? "Mute ambient sound" : "Enable ambient sound",
  );
  $("sound").classList.toggle("enabled", audioOn);
  $<HTMLInputElement>("audio-toggle").checked = audioOn;
}
$("sound").onclick = toggleAudio;
$("audio-toggle").onchange = toggleAudio;
function chime() {
  if (!audioOn || !audio || !audioGain) return;
  const osc = audio.createOscillator(),
    gain = audio.createGain();
  osc.frequency.setValueAtTime(880, audio.currentTime);
  osc.frequency.setValueAtTime(1320, audio.currentTime + 0.08);
  gain.gain.setValueAtTime(0.12, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.3);
  osc.connect(gain);
  gain.connect(audioGain);
  osc.start();
  osc.stop(audio.currentTime + 0.31);
}
const keyCodes = [
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "KeyQ",
  "KeyR",
  "KeyC",
];
window.addEventListener("keydown", (e) => {
  if (modal) {
    if (e.code === "Escape" || e.code === "KeyM") {
      e.preventDefault();
      closeModal();
    }
    if (e.key === "Tab") {
      const els = Array.from(
        modal.querySelectorAll<HTMLElement>("button,select,input"),
      );
      const first = els[0],
        last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    return;
  }
  if (!started) return;
  if (keyCodes.includes(e.code)) {
    e.preventDefault();
    keys.add(e.code);
    if (e.code === "Space" && !e.repeat) jumpQueued = true;
  }
  if (e.code === "KeyM" && !e.repeat) showModal($("map-modal"));
  if (e.code === "KeyE" && !e.repeat) {
    e.preventDefault();
    social.interact();
  }
  if (e.code === "KeyL" && !e.repeat) $("world").requestPointerLock?.();
  if (e.code === "Escape" && !document.pointerLockElement && !e.repeat)
    showModal($("settings-modal"));
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => {
  keys.clear();
  dragging = false;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    keys.clear();
    audio?.suspend();
  } else if (audioOn) audio?.resume();
});
const canvas = $<HTMLCanvasElement>("world");
canvas.tabIndex = 0;
canvas.addEventListener("pointerdown", (e) => {
  if (!started || paused) return;
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  canvas.focus();
});
canvas.addEventListener("pointermove", (e) => {
  if (!started || paused || (!dragging && !document.pointerLockElement)) return;
  const dx = document.pointerLockElement ? e.movementX : e.clientX - lastX,
    dy = document.pointerLockElement ? e.movementY : e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  yaw -= dx * sensitivity;
  controlYaw = yaw;
  lastManualLook = performance.now();
  pitch = T.MathUtils.clamp(pitch + dy * sensitivity, 0.12, 1.03);
});
canvas.addEventListener("pointerup", () => (dragging = false));
canvas.addEventListener("pointercancel", () => (dragging = false));
$("touch-jump").onpointerdown = (e) => {
  e.preventDefault();
  if (social?.mode !== "walk") keys.add("Space");
  else jumpQueued = true;
};
$("touch-jump").onpointerup = () => keys.delete("Space");
$("touch-sprint").onclick = () => {
  $("touch-sprint").classList.toggle("enabled");
  sprint = !sprint;
};
const joystick = $("joystick");
joystick.onpointerdown = (e) => {
  joystick.setPointerCapture(e.pointerId);
  updateStick(e);
};
joystick.onpointermove = (e) => {
  if (joystick.hasPointerCapture(e.pointerId)) updateStick(e);
};
function updateStick(e: PointerEvent) {
  const r = joystick.getBoundingClientRect();
  touchX = T.MathUtils.clamp((e.clientX - r.left - r.width / 2) / 35, -1, 1);
  touchY = T.MathUtils.clamp((e.clientY - r.top - r.height / 2) / 35, -1, 1);
  $("stick").style.transform = `translate(${touchX * 28}px,${touchY * 28}px)`;
}
function resetStick() {
  touchX = touchY = 0;
  $("stick").style.transform = "";
}
joystick.onpointerup = resetStick;
joystick.onpointercancel = resetStick;
joystick.onlostpointercapture = resetStick;
function enterWorld() {
  if (!ready) return;
  const input = $<HTMLInputElement>("username");
  const name = sanitizeName(input.value);
  input.value = name;
  if (!name) {
    $("username-error").textContent =
      "Please choose a username (up to 20 characters).";
    input.focus();
    return;
  }
  $("username-error").textContent = "";
  social.voice.listen();
  social.join(name);
}
$("enter").onclick = enterWorld;
$("username").addEventListener("keydown", (e) => {
  if (e.key === "Enter") enterWorld();
});
function beginSession() {
  if (started) return;
  started = true;
  $("welcome").classList.add("exited");
  $("postcard").classList.add("exited");
  document.body.classList.add("playing");
  for (const id of [
    "hud",
    "location",
    "controls",
    "minimap-wrap",
    "touch-controls",
    "online-status",
  ])
    $(id).classList.remove("hidden");
  canvas.focus();
  notice("Welcome to Chayapuram. Meet you on the scenic way.");
}
const walkingControls = $("controls").innerHTML;
function setControls(mode: string) {
  $("controls").innerHTML =
    mode === "walk"
      ? walkingControls
      : mode === "bus"
        ? "<span>PUBLIC BUS</span><i></i><span>Sit back. Watch Kerala go by.</span><kbd>E</kbd><span>Exit at stop</span>"
        : mode === "helicopter"
          ? "<kbd>W S</kbd><span>Forward / back</span><kbd>A D</kbd><span>Strafe</span><kbd>Q R</kbd><span>Turn</span><kbd>SPACE C</kbd><span>Up / down</span><kbd>E</kbd><span>Exit on ground</span>"
          : "<kbd>W S</kbd><span>Accelerate / brake</span><kbd>A D</kbd><span>Steer</span><kbd>SPACE</kbd><span>Handbrake</span><kbd>E</kbd><span>Exit</span>";
}
function blocked(x: number, z: number, y: number) {
  if (x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ)
    return true;
  if (social?.obstructed(x, z, y)) return true;
  const radius = 0.38;
  for (const c of world.colliders) {
    if (y >= c.h + 0.12) continue;
    if (
      x + radius > c.x - c.w / 2 &&
      x - radius < c.x + c.w / 2 &&
      z + radius > c.z - c.d / 2 &&
      z - radius < c.z + c.d / 2
    )
      return true;
  }
  for (const t of world.traffic) {
    if (
      Math.abs(x - t.group.position.x) < 1.6 &&
      Math.abs(z - t.group.position.z) < (t.group.userData.length ?? 3) &&
      y < 2.8
    )
      return true;
  }
  return false;
}
function movePlayer(dt: number, time: number) {
  let dx =
      (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
      (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) +
      touchX,
    dz =
      (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) -
      (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) +
      touchY;
  const length = Math.hypot(dx, dz),
    running = keys.has("ShiftLeft") || keys.has("ShiftRight") || sprint;
  const speed = running ? MOVEMENT.sprint : MOVEMENT.walk;
  const p = player.group.position;
  const moving = length > 0.05;
  if (moving && !wasMoving) controlYaw = yaw;
  wasMoving = moving;
  dx /= Math.max(1, length);
  dz /= Math.max(1, length);
  const desiredX =
    (dx * Math.cos(controlYaw) + dz * Math.sin(controlYaw)) * speed;
  const desiredZ =
    (-dx * Math.sin(controlYaw) + dz * Math.cos(controlYaw)) * speed;
  const blend =
    1 -
    Math.exp(-(grounded ? MOVEMENT.acceleration : MOVEMENT.airControl) * dt);
  // Releasing movement in the air preserves take-off momentum until landing.
  if (grounded || moving) {
    motionX += (desiredX - motionX) * blend;
    motionZ += (desiredZ - motionZ) * blend;
  }
  const vx = motionX * dt,
    vz = motionZ * dt;
  if (!blocked(p.x + vx, p.z, p.y)) p.x += vx;
  else motionX = 0;
  if (!blocked(p.x, p.z + vz, p.y)) p.z += vz;
  else motionZ = 0;
  player.group.userData.sprinting = running && moving;
  if (Math.hypot(motionX, motionZ) > 0.2) {
    const angle = Math.atan2(-motionX, -motionZ);
    player.group.rotation.y +=
      Math.atan2(
        Math.sin(angle - player.group.rotation.y),
        Math.cos(angle - player.group.rotation.y),
      ) *
      (1 - Math.exp(-12 * dt));
    if (
      moving &&
      !dragging &&
      !document.pointerLockElement &&
      performance.now() - lastManualLook > 1800
    )
      yaw +=
        Math.atan2(Math.sin(angle - yaw), Math.cos(angle - yaw)) *
        (1 - Math.exp(-1.2 * dt));
  }
  if (jumpQueued && grounded) {
    verticalSpeed = MOVEMENT.jump;
    grounded = false;
    keys.delete("Space");
  }
  jumpQueued = false;
  verticalSpeed -= MOVEMENT.gravity * dt;
  p.y += verticalSpeed * dt;
  const floor = walkingHeight(p.x, p.z);
  if (grounded && verticalSpeed <= 0) p.y = floor;
  if (p.y <= floor) {
    p.y = floor;
    verticalSpeed = 0;
    grounded = true;
  }
  animatePerson(
    player,
    time * (running ? 1.4 : 1),
    grounded && length > 0.05 ? (running ? 1 : 0.72) : 0,
  );
  for (const coin of world.collectibles) {
    if (
      coin.visible &&
      Math.hypot(coin.position.x - p.x, coin.position.z - p.z) < 1.35 &&
      Math.abs(p.y + 0.8 - coin.position.y) < 2
    ) {
      coin.visible = false;
      points += 10;
      $("points").textContent = String(points);
      $("found").textContent = `${points / 10} / ${world.collectibles.length}`;
      chime();
      notice(
        points === world.collectibles.length * 10
          ? "Every little treasure found. Kerala is yours."
          : "+10 · A little treasure, a little further.",
      );
    }
  }
}
function updateLocation() {
  const p = player.group.position;
  const area = zoneAt(p.x, p.z);
  if (area.name !== currentArea) {
    currentArea = area.name;
    if (!discovered.has(area.name)) {
      discovered.add(area.name);
      notice(`New place discovered · ${area.name}`);
    }
    $("area-name").textContent = area.name;
    $("area-local").textContent = area.local;
    $("area-kind").textContent = area.subtitle;
    $("discovered").textContent =
      `${discovered.size} of ${zones.length} places discovered`;
  }
}
function followCamera(dt: number) {
  const p = player.group.position;
  if (
    social.mode !== "walk" &&
    social.mode !== "bus" &&
    !dragging &&
    !document.pointerLockElement &&
    performance.now() - lastManualLook > 1800
  )
    yaw +=
      Math.atan2(
        Math.sin(player.group.rotation.y - yaw),
        Math.cos(player.group.rotation.y - yaw),
      ) *
      (1 - Math.exp(-1.3 * dt));
  target.set(
    p.x - Math.sin(player.group.rotation.y) * 1.2,
    p.y + 1.8,
    p.z - Math.cos(player.group.rotation.y) * 1.2,
  );
  const distance =
    social?.mode === "helicopter"
      ? 22
      : social?.mode === "bus"
        ? 17
        : social?.mode === "car"
          ? 14
          : 11;
  cameraGoal.set(
    p.x + Math.sin(yaw) * distance * Math.cos(pitch),
    p.y + 2.1 + Math.sin(pitch) * distance,
    p.z + Math.cos(yaw) * distance * Math.cos(pitch),
  );
  const direction = cameraGoal.clone().sub(target),
    max = direction.length();
  ray.set(target, direction.normalize());
  let closest = max;
  for (const c of world.colliders) {
    if (Math.abs(c.x - p.x) > 18 || Math.abs(c.z - p.z) > 18) continue;
    box.min.set(c.x - c.w / 2 - 0.3, c.base ?? 0, c.z - c.d / 2 - 0.3);
    box.max.set(c.x + c.w / 2 + 0.3, c.h + 0.25, c.z + c.d / 2 + 0.3);
    if (ray.intersectBox(box, intersection)) {
      const d = intersection.distanceTo(target);
      if (d < closest) closest = Math.max(1, d - 0.2);
    }
  }
  cameraGoal.copy(target).addScaledVector(direction, closest);
  camera.position.lerp(cameraGoal, 1 - Math.exp(-9 * dt));
  camera.position.y = Math.max(
    camera.position.y,
    heightAt(camera.position.x, camera.position.z) + 1,
  );
  camera.lookAt(target);
}
function drawMap(map: HTMLCanvasElement, mini: boolean) {
  const c = map.getContext("2d")!,
    w = map.width,
    h = map.height,
    p = player.group.position,
    scale = mini ? 1.45 : w / 1120,
    cx = mini ? p.x : 220,
    cz = mini ? p.z : -210;
  const X = (x: number) => (x - cx) * scale + w / 2,
    Z = (z: number) => (z - cz) * scale + h / 2;
  c.clearRect(0, 0, w, h);
  c.fillStyle = "#b9c599";
  c.fillRect(0, 0, w, h);
  function rect(x: number, z: number, rw: number, rh: number, color: string) {
    c.fillStyle = color;
    c.fillRect(X(x - rw / 2), Z(z - rh / 2), rw * scale, rh * scale);
  }
  rect(-271, 0, 62, 620, "#80b7b2");
  rect(-221, 0, 39, 620, "#e6d5ae");
  rect(28, -92, 493, 28, "#80b7b2");
  rect(183, 205, 63, 46, "#80b7b2");
  rect(96, 110, 71, 92, "#a3b56a");
  rect(-61, 91, 46, 33, "#8da474");
  rect(PARK.x, PARK.z, PARK.width, PARK.depth, "#85a879");
  rect(458, -280, 72, 49, "#80b7b2");
  c.strokeStyle = "#efe3c4";
  for (const road of ROADS) {
    c.lineWidth = road.width * scale;
    c.beginPath();
    road.points.forEach((p, i) => {
      if (i) c.lineTo(X(p.x), Z(p.z));
      else c.moveTo(X(p.x), Z(p.z));
    });
    c.stroke();
  }
  social?.drawMap(c, X, Z, mini);
  world?.colliders.forEach((b) => {
    if (b.w > 25 || b.d > 35 || b.w < 3) return;
    rect(b.x, b.z, b.w, b.d, "#90987a");
  });
  if (!mini) {
    world.collectibles.forEach((coin) => {
      if (!coin.visible) return;
      c.fillStyle = "#c29539";
      c.beginPath();
      c.arc(X(coin.position.x), Z(coin.position.z), 3, 0, Math.PI * 2);
      c.fill();
    });
    for (const zone of zones) {
      const x = X(zone.x),
        y = Z(zone.z);
      c.font = "bold 19px sans-serif";
      c.fillStyle = "#284f41";
      c.textAlign = "center";
      c.fillText(zone.name, x, y - 13);
      c.font = "19px sans-serif";
      c.fillText(discovered.has(zone.name) ? "✦" : "◇", x, y + 10);
    }
  }
  c.save();
  c.translate(X(p.x), Z(p.z));
  c.rotate(-yaw);
  c.fillStyle = "#294e3a";
  c.strokeStyle = "#fff9df";
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(0, -9);
  c.lineTo(7, 7);
  c.lineTo(0, 4);
  c.lineTo(-7, 7);
  c.closePath();
  c.fill();
  c.stroke();
  c.restore();
  if (mini) {
    c.fillStyle = "#355240";
    c.font = "bold 13px sans-serif";
    c.fillText("N", w - 18, 21);
  }
}
const clock = new T.Clock();
let lastMap = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.04);
  elapsed += dt;
  frames++;
  fpsTime += dt;
  if (fpsTime > 1) {
    fps = frames / fpsTime;
    frames = 0;
    fpsTime = 0;
  }
  if (!world) return;
  if (started) {
    const driveKeys = new Set(keys);
    if (social.mode !== "walk") {
      if (touchY < -0.2) driveKeys.add("KeyW");
      if (touchY > 0.2) driveKeys.add("KeyS");
      if (touchX < -0.2) driveKeys.add("KeyA");
      if (touchX > 0.2) driveKeys.add("KeyD");
    }
    social.update(dt, elapsed, driveKeys, paused, yaw);
    if (social.mode !== "walk") {
      motionX = 0;
      motionZ = 0;
      wasMoving = false;
    }
  }
  if (started && !paused && social.mode === "walk") movePlayer(dt, elapsed);
  if (started) updateLocation();
  if (started) followCamera(dt);
  else {
    camera.position.set(45 + Math.sin(elapsed * 0.035) * 3, 32, 65);
    camera.lookAt(-2, 1, -24);
  }
  if (!paused) {
    for (const npc of world.npcs) {
      const motion = Math.sin(elapsed * 0.32 + npc.phase);
      npc.person.group.position.z = npc.z + motion * 2;
      npc.person.group.position.y =
        heightAt(npc.x, npc.person.group.position.z) + 0.35;
      const moving = Math.abs(Math.cos(elapsed * 0.32 + npc.phase)) > 0.25;
      npc.person.group.rotation.y =
        Math.cos(elapsed * 0.32 + npc.phase) > 0 ? Math.PI : 0;
      animatePerson(npc.person, elapsed + npc.phase, moving ? 0.45 : 0);
    }
    for (const t of world.traffic) {
      const positive = t.lane > 0;
      const direction = positive ? -1 : 1;
      const next = t.group.position.z + dt * t.speed * direction;
      if (
        Math.abs(t.group.position.x - player.group.position.x) > 2 ||
        Math.abs(next - player.group.position.z) > 6
      )
        t.group.position.z = next;
      if (t.group.position.z < t.min) t.group.position.z = t.max;
      if (t.group.position.z > t.max) t.group.position.z = t.min;
      t.group.rotation.y = positive ? 0 : Math.PI;
      t.group.position.y =
        heightAt(t.group.position.x, t.group.position.z) + 0.25;
    }
    world.collectibles.forEach((coin, i) => {
      if (coin.visible) {
        coin.rotation.y = elapsed * 1.3 + i;
        coin.position.y =
          heightAt(coin.position.x, coin.position.z) +
          1.55 +
          Math.sin(elapsed * 2 + i) * 0.15;
      }
    });
    world.waters.forEach((w) => {
      const positions = w.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i),
          y = positions.getY(i);
        positions.setZ(
          i,
          Math.sin(x * 0.17 + elapsed * 0.8) *
            Math.cos(y * 0.15 + elapsed * 0.6) *
            0.07,
        );
      }
      positions.needsUpdate = true;
    });
    world.animals.forEach((a, i) => {
      const origin = a.userData.origin as T.Vector3;
      a.position.x = origin.x + Math.sin(elapsed * 0.15 + i) * 1.2;
      a.rotation.y = Math.sin(elapsed * 0.1 + i) * 0.4;
    });
  }
  const p = player.group.position;
  for (const chunk of world.chunks) {
    chunk.visible =
      chunk.userData.center.distanceTo(started ? p : camera.position) <
      (quality === "low" ? 220 : 460);
  }
  sun.position.set(p.x - 60, p.y + 90, p.z + 55);
  sun.target.position.set(p.x, p.y, p.z);
  if (elapsed - lastMap > 0.15 && started) {
    drawMap($<HTMLCanvasElement>("minimap"), true);
    lastMap = elapsed;
    const heading = ((((yaw * 180) / Math.PI) % 360) + 360) % 360;
    $("compass").innerHTML =
      `<span>${heading < 45 || heading > 315 ? "W" : heading < 135 ? "S" : heading < 225 ? "E" : "N"}</span><i></i><span class="active">${heading < 45 || heading > 315 ? "N" : heading < 135 ? "W" : heading < 225 ? "S" : "E"}</span><i></i><span>${heading < 45 || heading > 315 ? "E" : heading < 135 ? "N" : heading < 225 ? "W" : "S"}</span>`;
  }
  renderer.render(scene, camera);
}
async function init() {
  try {
    renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    $("progress").style.width = "25%";
    await document.fonts.load('700 40px "Noto Sans Malayalam"');
    $("progress").style.width = "55%";
    $("load-label").textContent = "Opening the little shops…";
    await new Promise((r) => setTimeout(r, 30));
    world = createWorld();
    social = new SocialGame(scene, player, world.colliders, notice);
    social.onControls = setControls;
    social.onStatus = (status) => {
      $("online-status").textContent = status;
      if (status === "Online") beginSession();
      else if (!started) $("username-error").textContent = status;
    };
    scene.add(world.root);
    $("progress").style.width = "85%";
    await renderer.compileAsync(scene, camera);
    $("progress").style.width = "100%";
    ready = true;
    $<HTMLButtonElement>("enter").disabled = false;
    $("load-label").textContent = "Enter Park Kerala";
    document.body.classList.add("loaded");
    loop();
  } catch (error) {
    $("error").classList.remove("hidden");
    $("error").textContent =
      `The world couldn't start. Please use a browser with WebGL enabled and refresh. ${error instanceof Error ? error.message : ""}`;
    console.error(error);
  }
}
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer?.setSize(innerWidth, innerHeight);
});
canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  paused = true;
  notice("Graphics paused. Restoring the world…");
});
canvas.addEventListener("webglcontextrestored", () => location.reload());
// Development-only probes let end-to-end tests inspect actual simulation outcomes.
if (import.meta.env.DEV) {
  let debug: T.Group | undefined;
  const toggleRoads = () => {
    debug ??= roadDebugGroup();
    if (!debug.parent) {
      scene.add(debug);
      debug.visible = false;
    }
    debug.visible = !debug.visible;
  };
  addEventListener("keydown", (e) => {
    if (e.code === "F8") {
      e.preventDefault();
      toggleRoads();
    }
  });
  if (new URLSearchParams(location.search).has("roadDebug"))
    setTimeout(toggleRoads, 1000);
  Object.defineProperty(window, "__park", {
    value: {
      state: () => ({
        ready,
        social: social?.diagnostics(),
        started,
        paused,
        position: player.group.position.toArray(),
        yaw,
        pitch,
        grounded,
        velocity: [motionX, verticalSpeed, motionZ],
        points,
        area: currentArea,
        discovered: [...discovered],
        fps,
        drawCalls: renderer?.info.render.calls,
        triangles: renderer?.info.render.triangles,
        colliders: world?.colliders.length,
        signsReady: document.fonts.check('700 40px "Noto Sans Malayalam"'),
        collectibles: world?.collectibles.filter((c) => c.visible).length,
      }),
      teleport: (x: number, z: number, y = 0.25) => {
        player.group.position.set(x, walkingHeight(x, z) + (y - 0.25), z);
        verticalSpeed = 0;
        motionX = 0;
        motionZ = 0;
        wasMoving = false;
        social?.network.send({ type: "test:teleport", x, z });
      },
      roads: () => ({
        issues: validateRoads(),
        roads: ROADS,
        stops: ROAD_STOPS,
      }),
      sampleSurfaces: (points: number[][]) => {
        const ray = new T.Raycaster(),
          roads = world.root.children.filter((c) => c.userData.roadSurface),
          terrain = world.root.children.filter((c) => c.userData.terrain),
          shoulders = world.root.children.filter(
            (c) => c.userData.roadShoulder,
          );
        world.root.updateMatrixWorld(true);
        return points.map(([x, z]) => {
          ray.set(new T.Vector3(x, 250, z), new T.Vector3(0, -1, 0));
          return {
            x,
            z,
            road: ray.intersectObjects(roads, false)[0]?.point.y,
            terrain: ray.intersectObjects(terrain, false)[0]?.point.y,
            shoulder: ray.intersectObjects(shoulders, false)[0]?.point.y,
            expected: surfaceHeight(x, z),
          };
        });
      },
      roadPose: (s: number, offset = -3) => {
        const f = roadFrame(MAIN_ROAD, s, offset);
        return { ...f, ...groundPose(f.x, f.z, f.yaw, "car") };
      },
      voiceStats: () => social.voice.stats(),
      reconnect: () => social.network.socket?.close(),
      colliders: () => world.colliders.map((c) => ({ ...c })),
      setYaw: (v: number) => (yaw = v),
    },
  });
}
window.addEventListener("pagehide", () => {
  social?.voice.dispose();
  social?.network.disconnect();
  clearInterval(birdTimer);
  audio?.close();
});
init();
