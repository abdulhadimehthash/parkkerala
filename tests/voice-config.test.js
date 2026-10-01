import test from "node:test";
import assert from "node:assert/strict";
import { createVoiceConfig } from "../server/voice-config.js";
const relay = {
  iceServers: [
    {
      urls: [
        "turn:turn.cloudflare.com:3478?transport=udp",
        "turns:turn.cloudflare.com:443?transport=tcp",
      ],
      username: "temporary-user",
      credential: "temporary-credential",
    },
  ],
};
const env = {
  CLOUDFLARE_TURN_KEY_ID: "provider-id",
  CLOUDFLARE_TURN_API_TOKEN: "provider-secret",
};
test("public configuration never exposes relay credentials or provider secrets", async () => {
  const service = createVoiceConfig({
    env: {
      TURN_URL: "turn:example.com",
      TURN_USERNAME: "private-user",
      TURN_CREDENTIAL: "private-password",
    },
    now: () => 100,
  });
  const config = service.publicConfig();
  assert.equal(config.turnConfigured, false);
  assert.ok(!JSON.stringify(config).includes("private"));
  const joined = await service.forSession("joined");
  assert.equal(joined.turnConfigured, true);
  assert.equal(joined.iceServers[1].username, "private-user");
});
test("Cloudflare credentials are temporary, cached per session and requests are deduplicated", async () => {
  let time = 1000,
    calls = 0;
  const service = createVoiceConfig({
    env,
    now: () => time,
    fetcher: async (url, options) => {
      calls++;
      assert.match(url, /provider-id\/credentials\/generate-ice-servers$/);
      assert.equal(options.headers.Authorization, "Bearer provider-secret");
      assert.equal(JSON.parse(options.body).ttl, 3600);
      await new Promise((r) => setTimeout(r, 5));
      return { ok: true, json: async () => relay };
    },
  });
  const [a, b] = await Promise.all([
    service.forSession("one"),
    service.forSession("one"),
  ]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  assert.equal(a.expiresAt, 3601000);
  assert.ok(!JSON.stringify(a).includes("provider-secret"));
  await service.forSession("two");
  assert.equal(calls, 2);
  await service.forSession("one");
  assert.equal(calls, 2);
  time += 3300001;
  await service.forSession("one");
  assert.equal(calls, 3);
  service.release("one");
  await service.forSession("one");
  assert.equal(calls, 4);
});
test("provider failures retain still-valid relay credentials and back off before retrying", async () => {
  let time = 0,
    fail = false,
    calls = 0;
  const service = createVoiceConfig({
    env,
    now: () => time,
    fetcher: async () => {
      calls++;
      return { ok: !fail, json: async () => relay };
    },
  });
  const first = await service.forSession("one");
  fail = true;
  time = 3300001;
  assert.deepEqual(await service.forSession("one"), first);
  assert.equal(calls, 2);
  assert.deepEqual(await service.forSession("one"), first);
  assert.equal(calls, 2);
  time = 3600001;
  await assert.rejects(service.forSession("one"));
  assert.equal(calls, 3);
  await assert.rejects(service.forSession("one"));
  assert.equal(calls, 3);
  fail = false;
  time += 60001;
  assert.equal((await service.forSession("one")).turnConfigured, true);
  assert.equal(calls, 4);
});
test("malformed provider responses cannot be advertised as working TURN", async () => {
  const service = createVoiceConfig({
    env,
    fetcher: async () => ({
      ok: true,
      json: async () => ({
        iceServers: [{ urls: "https://example.com", credential: "bad" }],
      }),
    }),
  });
  await assert.rejects(service.forSession("one"), /no usable/);
});

test("HTTP relay credentials require a live world session and expire on disconnect", async (t) => {
  const { spawn } = await import("node:child_process");
  const { once } = await import("node:events");
  const { default: WebSocket } = await import("ws");
  const { createServer } = await import("node:net");
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "production",
      TURN_URL: "turn:example.invalid:3478",
      TURN_USERNAME: "test-user",
      TURN_CREDENTIAL: "test-password",
      CLOUDFLARE_TURN_KEY_ID: "",
      CLOUDFLARE_TURN_API_TOKEN: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Fixture startup timeout")),
      10000,
    );
    child.stdout.on("data", (data) => {
      if (data.toString().includes("listening on")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(Error("Fixture exited " + code));
    });
  });
  const url = `http://127.0.0.1:${port}/api/config`;
  const publicConfig = await (await fetch(url)).json();
  assert.equal(publicConfig.turnConfigured, false);
  assert.ok(!JSON.stringify(publicConfig).includes("test-password"));
  assert.equal(
    (await fetch(url, { headers: { Authorization: "Bearer invalid" } })).status,
    401,
  );
  const ws = new WebSocket(`ws://127.0.0.1:${port}/world`, {
    origin: `http://127.0.0.1:${port}`,
  });
  t.after(() => ws.close());
  await once(ws, "open");
  ws.send(JSON.stringify({ type: "join", name: "Relay Test" }));
  assert.match(ws.extensions, /permessage-deflate/);
  const [raw] = await once(ws, "message"),
    welcome = JSON.parse(raw);
  assert.ok(welcome.voiceToken?.length >= 24);
  const headers = { Authorization: `Bearer ${welcome.voiceToken}` };
  const response = await fetch(url, { headers });
  assert.match(response.headers.get("cache-control"), /no-store/);
  const config = await response.json();
  assert.equal(config.turnConfigured, true);
  assert.equal(config.iceServers[1].credential, "test-password");
  const [next] = await once(ws, "message");
  assert.equal(JSON.parse(next).voiceToken, undefined);
  ws.close();
  await once(ws, "close");
  await new Promise((r) => setTimeout(r, 50));
  assert.equal((await fetch(url, { headers })).status, 401);
});
