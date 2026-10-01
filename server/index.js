import { walkingHeight } from "../shared/roads.js";
import { TRANSPORT, VOICE } from "../shared/config.js";
import express from "express";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Game } from "./game.js";
import { heightAt } from "../shared/world.js";
import { randomBytes } from "node:crypto";
import { createVoiceConfig } from "./voice-config.js";
const app = express(),
  server = createServer(app),
  production = process.env.NODE_ENV === "production";
const interval = Math.max(
  30,
  Math.min(
    600,
    Number(process.env.BUS_STOP_TARGET_INTERVAL_SECONDS) ||
      TRANSPORT.busStopTargetIntervalSeconds,
  ),
);
const dwell = Math.max(
  5,
  Math.min(10, Number(process.env.BUS_DWELL_SECONDS) || TRANSPORT.dwellSeconds),
);
const respawnSeconds = Math.max(
  30,
  Number(process.env.VEHICLE_RESPAWN_SECONDS) ||
    TRANSPORT.abandonedVehicleSeconds,
);
const game = new Game({ interval, dwell, respawnSeconds });
const voiceConfig = createVoiceConfig(),
  voiceSessions = new Map();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "microphone=(self), camera=()");
  next();
});
app.get("/health", (_, res) =>
  res.json({
    ok: true,
    players: game.players.size,
    version: "2.3.0",
    commit: process.env.RENDER_GIT_COMMIT?.slice(0, 12) || "local",
  }),
);
app.get("/api/config", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (token && !voiceSessions.has(token)) return res.sendStatus(401);
  let config = voiceConfig.publicConfig();
  if (token) {
    try {
      config = await voiceConfig.forSession(token);
    } catch {
      config = {
        ...config,
        relayUnavailable: true,
        expiresAt: Date.now() + 60000,
      };
      console.warn(
        "Voice relay credential service unavailable; direct voice remains enabled.",
      );
    }
    if (!voiceSessions.has(token)) return res.sendStatus(401);
  }
  res.json({
    ...config,
    busInterval: interval,
    busDwell: dwell,
    voiceRadius: VOICE.radius,
  });
});
app.use(express.static(path.join(root, "dist")));
app.use((req, res) => {
  if (req.path.startsWith("/api/")) return res.sendStatus(404);
  res.sendFile(path.join(root, "dist/index.html"));
});
const wss = new WebSocketServer({
  server,
  path: "/world",
  maxPayload: 16384,
  // Keep the 20 Hz simulation while reducing repeated world-state traffic.
  // Bound compression memory/concurrency for the small Render instance.
  perMessageDeflate: {
    threshold: 1024,
    serverNoContextTakeover: true,
    clientNoContextTakeover: true,
    serverMaxWindowBits: 10,
    concurrencyLimit: 4,
    zlibDeflateOptions: { level: 1, memLevel: 4 },
  },
});
const sockets = new Map();
function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 262144)
    ws.send(JSON.stringify(data));
}
wss.on("connection", (ws, request) => {
  const origin = request.headers.origin;
  let allowed = true;
  try {
    if (origin) {
      const hostname = new URL(origin).hostname;
      allowed =
        hostname === (request.headers.host || "").split(":")[0] ||
        (!production && ["localhost", "127.0.0.1"].includes(hostname));
    }
  } catch {
    allowed = false;
  }
  if (!allowed) {
    ws.close(1008, "Origin not allowed");
    return;
  }
  if (wss.clients.size > 80) {
    ws.close(1013, "World full");
    return;
  }
  let id = null,
    voiceToken = null,
    count = 0,
    windowAt = Date.now(),
    alive = true;
  const timeout = setTimeout(() => {
    if (!id) ws.close(1008, "Join required");
  }, 10000);
  ws.on("pong", () => (alive = true));
  const heartbeat = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 20000);
  ws.on("message", (raw) => {
    if (Date.now() - windowAt > 1000) {
      count = 0;
      windowAt = Date.now();
    }
    if (++count > 70) return ws.close(1008, "Rate limit");
    let data;
    try {
      data = JSON.parse(raw.toString());
      if (!data || typeof data.type !== "string") return;
      if (data.type === "join") {
        if (id) return;
        const p = game.add(data.name);
        id = p.id;
        voiceToken = randomBytes(24).toString("base64url");
        voiceSessions.set(voiceToken, id);
        sockets.set(id, ws);
        send(ws, { ...game.snapshot(), id, voiceToken, type: "welcome" });
        return;
      }
      if (!id) return;
      const p = game.players.get(id);
      if (!p) return;
      if (data.type === "football")
        game.footballAction(id, data.action, data.team);
      else if (data.type === "move") game.move(id, data);
      else if (data.type === "input") game.input(id, data);
      else if (data.type === "interact") game.interact(id, data.target);
      else if (data.type === "respawn") {
        if (p.mode !== "walk")
          throw Error("Exit your vehicle before returning to town.");
        Object.assign(p, { x: 0, y: 0.25, z: 29, lastMove: Date.now() });
        send(ws, { type: "correction", x: 0, y: 0.25, z: 29 });
      } else if (data.type === "voice") {
        p.mic = !!data.mic;
        p.speaking = p.mic && !!data.speaking;
      } else if (data.type === "signal") {
        const to = game.players.get(data.to);
        if (
          !to ||
          Math.hypot(to.x - p.x, to.y - p.y, to.z - p.z) > VOICE.signalRadius
        )
          return;
        const signal = data.signal;
        if (
          signal &&
          (signal.description ||
            signal.candidate ||
            signal.reset ||
            signal.restart)
        )
          send(sockets.get(to.id), { type: "signal", from: id, signal });
      } else if (
        data.type === "test:teleport" &&
        !production &&
        process.env.ALLOW_TEST_TOOLS === "1" &&
        [data.x, data.z].every(Number.isFinite)
      ) {
        Object.assign(p, {
          x: data.x,
          z: data.z,
          y: walkingHeight(data.x, data.z),
          lastMove: Date.now(),
        });
        send(ws, { type: "correction", x: p.x, y: p.y, z: p.z });
      }
    } catch (error) {
      send(ws, {
        type: "error",
        message: error.message || "Unable to complete action.",
      });
    }
  });
  ws.on("close", () => {
    if (voiceToken) {
      voiceSessions.delete(voiceToken);
      voiceConfig.release(voiceToken);
    }
    clearTimeout(timeout);
    clearInterval(heartbeat);
    if (id) {
      game.remove(id);
      sockets.delete(id);
    }
  });
  ws.on("error", () => {});
});
const timer = setInterval(() => {
  game.tick(0.05);
  {
    const payload = JSON.stringify(game.snapshot());
    for (const ws of sockets.values())
      if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 262144)
        ws.send(payload);
  }
}, 50);
const port = Number(process.env.PORT) || 3001;
server.listen(port, "0.0.0.0", () =>
  console.log(
    `Park Kerala game server listening on ${port}; bus interval ${interval}s`,
  ),
);
function shutdown() {
  clearInterval(timer);
  for (const ws of wss.clients) ws.close(1001, "World restarting");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
