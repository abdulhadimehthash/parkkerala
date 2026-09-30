# PARK KERALA

A social, low-poly Kerala exploration game. This project extends the original town, procedural assets, third-person controller, collectibles and warm visual style.

## Run

```sh
npm ci
npm run dev
```

Open **http://localhost:3000**. Vite forwards game WebSocket and configuration requests to the Node server on port 3001. Enter a username; there are no accounts or passwords. The server keeps sessions, vehicle ownership and bus seats only in memory.

Production uses a single process and origin:

```sh
npm run build
NODE_ENV=production PORT=3000 npm start
```

## Controls

| Mode | Controls |
| --- | --- |
| Walk | WASD / arrows, Shift sprint, Space jump |
| Interact | E enters or exits the closest usable transport |
| Camera | Mouse drag; L captures the mouse; Esc releases it |
| Car / bike | W accelerate, S brake/reverse, A/D steer, Space brake, E exit while stopped |
| Helicopter | W/S forward/back, A/D strafe, Q/R rotate, Space climb, C descend, E exit after landing |
| Bus | E board when doors are open; E exit at a stop |
| Map | M |

The settings menu has the roadmap, graphics quality, camera sensitivity, ambient audio, mute-other-players and return-to-town controls. Points and discoveries last for the visit. The microphone is off by default.

## World and architecture

The original town connects to nine named areas, including the Sarovaram Park plateau, an elevated lake promenade, tea garden, pavilion, parking, bus stop, and a winding hill road loop. Walkable terrain uses a deterministic height function shared by client and server. Existing buildings and vegetation are raised as whole assets, and road ribbons follow the terrain. Rendering uses spatial chunks, instanced primitive geometry and shared materials.

- `src/world.ts`: original Kerala world and reusable asset builders
- `src/world/terrain.ts`: tiled heightfield and terrain-following road ribbons
- `src/world/parks/registry.ts`: modular park registry and Sarovaram destination
- `shared/world.js`: terrain, bounds, transport definitions, stops and park metadata
- `shared/simulation.js`: shared vehicle physics and deterministic bus schedule
- `shared/colliders.json`: collision data exported from the rendered world
- `src/game/`: universal interactions, transport models and multiplayer presentation
- `src/network/`: WebSocket client and proximity WebRTC audio
- `server/game.js`: shared vehicle ownership, passenger seats, bus schedule and validation
- `server/index.js`: static hosting, same-origin WebSockets, signalling and health endpoint

The Node simulation runs at 20 Hz and broadcasts at 10 Hz. Clients predict driving using the same simulation and interpolate remote movement. Vehicle ownership and first-available bus seats are allocated exclusively on the server. Disconnects release occupied resources. Buses carry 20 passengers each, with configurable headways and synchronized doors/countdowns. Buses follow a deterministic timetable; other traffic remains ambient scenery.

This version uses stable arcade vehicle handling, simplified collision volumes and a bounded world, rather than a full rigid-body driving simulator. Shared state resets on server restart. Run **one server instance**; horizontal scaling requires shared room coordination and is intentionally not included.

## Voice

Live browser-to-browser WebRTC audio uses distance attenuation: full volume through 20 metres, a smooth fade to 100 metres, then silence. Web Audio adds subtle camera-relative stereo panning. Leaving the nearby region closes that peer connection. Microphone permission, mute, denied permission and speaking indicators are handled locally. Neither the server nor the client records or stores conversations.

Public STUN servers are configured by default. **Some networks require TURN**; provide `TURN_URL`, `TURN_USERNAME` and `TURN_CREDENTIAL` through Render environment settings for those networks. Use short-lived relay credentials where supported. Never commit real credentials. Without a relay, direct WebRTC has been tested locally and in same-network production clients; connectivity across restrictive NAT/firewalls is not guaranteed.

## Environment

See `.env.example` for names. The server reads process environment variables, not `.env` files automatically.

- `PORT`: HTTP and WebSocket port; Render supplies it
- `NODE_ENV=production`: production static hosting and test hooks disabled
- `BUS_STOP_TARGET_INTERVAL_SECONDS=30`: bus headway, clamped to 30–600 seconds
- `BUS_DWELL_SECONDS=8`: boarding time, clamped to 5–10 seconds
- `VEHICLE_RESPAWN_SECONDS=180`: abandoned vehicle reset delay; occupied vehicles and nearby players prevent resets
- `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`: optional voice relay
- `ALLOW_TEST_TOOLS=1`: **local development only**, enables test teleports; ignored in production

## Tests

```sh
npm run typecheck
npm run test:server
npm run build
# With local server started using ALLOW_TEST_TOOLS=1:
npm test
```

Browser tests use installed Google Chrome. They cover baseline movement/collision, hills and destinations, username validation, two-client movement, exclusive car ownership, driving, bike riding, helicopter takeoff/landing, live two-way simulated WebRTC packets and attenuation, denied microphone permission, synchronized buses, distinct passenger seats, travel and stop-only exits. Server tests cover invalid input, duplicate names, full buses, 20 unique seats, disconnect cleanup, terrain following and configurable schedules.

If world collision geometry changes, run the game and `node tests/export-colliders.mjs`, then restart the game server. The exported collider data must be committed with the corresponding world changes.

## Deployment

Deploy this existing repository as one Render Node web service:

- Build: `npm ci --include=dev && npm run build`
- Start: `npm start`
- Health check: `/health`
- Environment: `NODE_ENV=production`, `BUS_STOP_TARGET_INTERVAL_SECONDS=30`

The browser derives WSS/HTTPS URLs from the page origin; production has no localhost networking values. No database, CMS, permanent profiles or admin dashboard is used.

Procedural assets are original. Noto Sans Malayalam is bundled under the SIL Open Font License in `public/FONT-LICENSE.txt`.

## Living world update

Walking uses 8.5 units/second and sprinting uses 14, with acceleration, grounded jump checks and preserved airborne momentum. Camera assistance eases behind movement and yields to manual looking. Ambient pedestrians, auto-rickshaws, cars, bikes and water movement remain active even when no other real players are online.

The shared world has 7 usable cars, 14 bikes and 4 helicopters spread across town, residential streets, riverside, village, park, valley and hill destinations. Helicopters have level helipads and access paths. Abandoned transport resets after the configured delay only when unoccupied and no player is close to its current or home position.

The default route runs 7 lightweight timetable-driven buses with 30-second headways and 8-second dwell. Travel time is adjusted to maintain spacing without parking several buses at the terminus. Each bus has 20 exclusive passenger seats; world capacity is separately 64. Distant vehicles are hidden and static model parts are batched. Stop panels show BOARDING, ARRIVING, or BUS FULL with the next service countdown. Oversized standalone signboards are removed; small plaques remain on shops and shelters.

Original usernames are retained as `originalUsername`; `displayNameMalayalam` uses a curated deterministic name dictionary, including Hadi, Sinan and Javeed. Every token must be known or the complete original name is shown. This deliberately conservative fallback avoids inventing pronunciations. Speaking nameplates add a small microphone indicator.

Production smoke test (synthetic microphone audio, two real browser sessions):

```sh
PARK_URL=https://parkkerala.online node tests/production-smoke.mjs
```

This checks HTTPS/WSS, Malayalam name metadata, public shared transport, two-way WebRTC packets, the 100m gain curve, mute, an available town car, and two passengers boarding/riding/exiting the same bus. It uses ordinary controls and has no production teleport API. Keep the test names Hadi and Sinan available while running it.
