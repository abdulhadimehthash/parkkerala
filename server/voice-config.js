const STUN = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

// The provider key never leaves this module. Only temporary ICE credentials are
// returned, and the HTTP handler restricts these to active world sessions.
export function createVoiceConfig({
  env = process.env,
  fetcher = fetch,
  now = Date.now,
} = {}) {
  const sessions = new Map();
  const cloudflare = !!(
    env.CLOUDFLARE_TURN_KEY_ID && env.CLOUDFLARE_TURN_API_TOKEN
  );
  const staticTurn = !!(
    env.TURN_URL &&
    env.TURN_USERNAME &&
    env.TURN_CREDENTIAL
  );
  const base = () => ({
    iceServers: STUN,
    turnConfigured: false,
    expiresAt: now() + 600000,
  });
  return {
    publicConfig: base,
    release(token) {
      sessions.delete(token);
    },
    async forSession(token) {
      if (!cloudflare)
        return staticTurn
          ? {
              iceServers: [
                ...STUN,
                {
                  urls: env.TURN_URL,
                  username: env.TURN_USERNAME,
                  credential: env.TURN_CREDENTIAL,
                },
              ],
              turnConfigured: true,
              expiresAt: now() + 3600000,
            }
          : base();
      const old = sessions.get(token);
      if (old?.retryAt > now()) {
        if (old.config?.expiresAt > now()) return old.config;
        throw Error("Relay credentials will retry shortly");
      }
      if (old?.pending) return old.pending;
      if (old?.config && old.config.expiresAt > now() + 300000)
        return old.config;
      const entry = { config: old?.config };
      sessions.set(token, entry);
      entry.pending = Promise.resolve().then(async () => {
        try {
          const response = await fetcher(
            `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.CLOUDFLARE_TURN_KEY_ID)}/credentials/generate-ice-servers`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${env.CLOUDFLARE_TURN_API_TOKEN}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ ttl: 3600 }),
              signal: AbortSignal.timeout(5000),
            },
          );
          if (!response.ok) throw Error("Relay credential request failed");
          const data = await response.json();
          const iceServers = (
            Array.isArray(data.iceServers) ? data.iceServers : []
          ).filter((server) => {
            const urls = Array.isArray(server.urls)
              ? server.urls
              : [server.urls];
            return (
              urls.length &&
              urls.every(
                (url) =>
                  typeof url === "string" && /^(stun|turn|turns):/.test(url),
              )
            );
          });
          if (
            !iceServers.some((server) => {
              const urls = Array.isArray(server.urls)
                ? server.urls
                : [server.urls];
              return (
                urls.some((url) => /^turns?:/.test(url)) &&
                typeof server.username === "string" &&
                typeof server.credential === "string"
              );
            })
          )
            throw Error("Relay response has no usable credentials");
          entry.config = {
            iceServers,
            turnConfigured: true,
            expiresAt: now() + 3600000,
          };
          return entry.config;
        } catch (error) {
          entry.retryAt = now() + 60000;
          if (entry.config?.expiresAt > now()) return entry.config;
          throw error;
        } finally {
          entry.pending = null;
        }
      });
      return entry.pending;
    },
  };
}
