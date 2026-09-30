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

Live browser-to-browser WebRTC audio uses distance attenuation: full volume through 10 metres, a quadratic fade to 40 metres, then silence. Leaving the nearby region closes that peer connection. Microphone permission, mute, denied permission and speaking indicators are handled locally. Neither the server nor the client records or stores conversations.

Public STUN servers are configured by default. **Some networks require TURN**; provide `TURN_URL`, `TURN_USERNAME` and `TURN_CREDENTIAL` through Render environment settings for those networks. Use short-lived relay credentials where supported. Never commit real credentials. Without a relay, direct WebRTC has been tested locally and in same-network production clients; connectivity across restrictive NAT/firewalls is not guaranteed.

## Environment

See `.env.example` for names. The server reads process environment variables, not `.env` files automatically.

- `PORT`: HTTP and WebSocket port; Render supplies it
- `NODE_ENV=production`: production static hosting and test hooks disabled
- `BUS_INTERVAL_SECONDS=120`: bus headway, clamped to 30–600 seconds
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
- Environment: `NODE_ENV=production`, `BUS_INTERVAL_SECONDS=120`

The browser derives WSS/HTTPS URLs from the page origin; production has no localhost networking values. No database, CMS, permanent profiles or admin dashboard is used.

Procedural assets are original. Noto Sans Malayalam is bundled under the SIL Open Font License in `public/FONT-LICENSE.txt`.
