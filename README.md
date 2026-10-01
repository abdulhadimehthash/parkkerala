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

| Mode       | Controls                                                                               |
| ---------- | -------------------------------------------------------------------------------------- |
| Walk       | WASD / arrows, Shift sprint, Space jump                                                |
| Interact   | E enters or exits the closest usable transport                                         |
| Camera     | Mouse drag; L captures the mouse; Esc releases it                                      |
| Car / bike | W accelerate, S brake/reverse, A/D steer, Space brake, E exit while stopped            |
| Helicopter | W/S forward/back, A/D strafe, Q/R rotate, Space climb, C descend, E exit after landing |
| Bus        | E board when doors are open; E exit at a stop                                          |
| Map        | M                                                                                      |

The settings menu has the roadmap, graphics quality, camera sensitivity, ambient audio, mute-other-players and return-to-town controls. Points and discoveries last for the visit. The microphone is off by default.

## World and architecture

The original town connects to ten named areas, including the Sarovaram Park plateau, an elevated lake promenade, tea garden, pavilion, parking, bus stop, and a winding hill road loop. Roads use one shared, rounded centerline network with explicit grades. Terrain is cut around that network, and the client and server use its actual driving surface, including bridges. Existing buildings and vegetation are raised as whole assets. Rendering uses spatial chunks, instanced primitive geometry and shared materials.

- `src/world.ts`: original Kerala world and reusable asset builders
- `src/world/terrain.ts`: tiled heightfield, generated road/shoulder meshes and development road overlay
- `src/world/parks/registry.ts`: modular park registry and Sarovaram destination
- `shared/roads.js`: centerlines, grades, junction surfaces, lanes, stop bays, clearance and wheel contact
- `shared/terrain-base.js`: natural terrain and level helipads
- `shared/world.js`: bounds, transport definitions, stops and park metadata
- `shared/simulation.js`: shared vehicle physics and deterministic bus schedule
- `shared/colliders.json`: collision data exported from the rendered world
- `src/game/`: universal interactions, transport models and multiplayer presentation
- `src/network/`: WebSocket client and proximity WebRTC audio
- `server/game.js`: shared vehicle ownership, passenger seats, bus schedule and validation
- `server/index.js`: static hosting, same-origin WebSockets, signalling and health endpoint

The Node simulation runs at 20 Hz and broadcasts at 20 Hz. Clients predict driving using the same simulation and interpolate remote movement. Vehicle ownership and first-available bus seats are allocated exclusively on the server. Disconnects release occupied resources. Buses carry 20 passengers each, with configurable headways and synchronized doors/countdowns. Buses follow a deterministic timetable; other traffic remains ambient scenery.

This version uses stable arcade vehicle handling, simplified collision volumes and a bounded world, rather than a full rigid-body driving simulator. Shared state resets on server restart. Run **one server instance**; horizontal scaling requires shared room coordination and is intentionally not included.

## Voice

Live browser-to-browser WebRTC audio uses distance attenuation: full volume through 25 metres, a smooth fade to 100 metres, then silence. Web Audio adds subtle camera-relative stereo panning. Leaving the nearby region closes that peer connection. Microphone permission, mute, denied permission and speaking indicators are handled locally. Neither the server nor the client records or stores conversations.

Public STUN servers are configured by default. **Some networks require TURN**. Configure either the existing `TURN_URL`, `TURN_USERNAME` and `TURN_CREDENTIAL` settings, or Cloudflare Realtime TURN using `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` in Render's private environment settings. Never commit real credentials.

For Cloudflare, create a TURN key in the account's Realtime dashboard, then add its key ID and API token to the existing Render service. The server requests one-hour credentials for each joined world session, caches concurrent requests, retries provider failures with a delay, and keeps still-valid credentials during a temporary provider outage. The browser refreshes credentials before expiry. The permanent provider token never reaches the browser. An unjoined visitor receives only STUN configuration; relay configuration requires the temporary session token received over the game's WebSocket. Disconnecting revokes access to further configuration requests; previously issued TURN credentials expire on their own TTL.

See [Cloudflare's credential guide](https://developers.cloudflare.com/realtime/turn/generate-credentials/) and [current pricing](https://developers.cloudflare.com/realtime/sfu/platform/pricing/) before activation. Its published allowance is currently 1,000 GB/month, followed by usage charges. No provider account or billing subscription is created by this repository. Without configured provider credentials, direct voice remains available and restrictive-network coverage remains unverified.

After configuration, run `PARK_URL=https://parkkerala.online node tests/relay-smoke.mjs`. This forces two real browsers to use relay candidates and checks decoded two-way audio; an ordinary direct WebRTC connection cannot satisfy that test. Set `TURN_TRANSPORT=tls` to require TURN over TLS on port 443. Do not report relay coverage as verified until this succeeds with the actual provider.

## Environment

See `.env.example` for names. The server reads process environment variables, not `.env` files automatically.

- `PORT`: HTTP and WebSocket port; Render supplies it
- `NODE_ENV=production`: production static hosting and test hooks disabled
- `BUS_STOP_TARGET_INTERVAL_SECONDS=30`: bus headway, clamped to 30–600 seconds
- `BUS_DWELL_SECONDS=8`: boarding time, clamped to 5–10 seconds
- `VEHICLE_RESPAWN_SECONDS=180`: abandoned vehicle reset delay; occupied vehicles and nearby players prevent resets
- `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`: optional voice relay
- `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`: optional Cloudflare relay; takes precedence when both are set
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

The default route runs 8 lightweight timetable-driven buses with 30-second headways and 8-second dwell. Travel time is adjusted to maintain spacing without parking several buses at the terminus. Each bus has 20 exclusive passenger seats; world capacity is separately 64. Distant vehicles are hidden and static model parts are batched. Stop panels show BOARDING, ARRIVING, or BUS FULL with the next service countdown. Oversized standalone signboards are removed; small plaques remain on shops and shelters.

Original usernames are retained as `originalUsername`; `displayNameMalayalam` uses a curated deterministic name dictionary, including Hadi, Sinan and Javeed. Every token must be known or the complete original name is shown. This deliberately conservative fallback avoids inventing pronunciations. Speaking nameplates add a small microphone indicator.

Production smoke test (synthetic microphone audio, two real browser sessions):

```sh
PARK_URL=https://parkkerala.online node tests/production-smoke.mjs
```

This checks HTTPS/WSS, Malayalam name metadata, public shared transport, two-way WebRTC packets, the 100m gain curve, mute, an available town car, and two passengers boarding/riding/exiting the same bus. It uses ordinary controls and has no production teleport API. Keep the test names Hadi and Sinan available while running it.

## Road integrity

The main route is a continuous 2 km loop with rounded turns, a 12 m roadway, seven roadside stops and widened pull-in bays. The same arc-length path generates roads, bus motion, minimap, clearance zones and roadside lamps. Branches blend into the primary road at junctions. Terrain tiles have finer resolution near roads and are cut to the corridor before surrounding slopes blend into the natural hills.

Vehicle height comes from the road surface, including graded bridge decks. Pitch uses front/rear contact points; root height accounts for the actual model wheel hub and tyre radius at every wheel. Passenger seats use the bus pitch transform. Buses ease into bays and maintain their timetable through curves; a state-recovery guard handles invalid positions as a fallback.

The previous failures came from separate road/bus paths, terrain-only height queries, mismatched wheel offsets/pitch and props placed without a common road clearance zone. These are now shared data and calculations. Shoulder and intersection geometry are also checked against the visible asphalt.

In development, press **F8** or add `?roadDebug` to show centerlines, surface edges, the bus lane, stops and vehicle spawns. Normal production builds contain no public debug controls or teleport endpoint.

Additional road checks, with the local test server running:

```sh
node --test tests/roads.test.js
node tests/road-surfaces.mjs
node tests/drive-network.mjs
```

These validate every road grade, sampled lane clearance, bridge tyre contact, eight buses over four complete loops, recovery, and full car/bike traversals. The surface check casts rays against actual rendered road and terrain triangles throughout the network. The driving check uses two real browser sessions and ordinary W/A/S/D/brake controls for a complete loop each; it only teleports the pedestrians to their parked vehicles during setup.

## Smooth multiplayer and football

The server broadcasts at 20 Hz and clients send movement/input at 20 Hz. Remote players and transport use a timestamped 150 ms snapshot buffer, short bounded extrapolation and stale-sequence rejection. Walking snapshots include velocity to avoid duplicate-position stalls between input and server ticks. Local walking remains immediate; driven vehicles predict input locally and reconcile acknowledged commands gradually. Bus passengers use the same rendered bus and local seat transform. Football uses a separate 75 ms playback buffer.

The football turf is south of the town helipad, connected to the road and parking by its west entrance. The Football Turf bus stop maintains the existing 30-second headway; eight buses now cover the seven stops. **J** joins a balanced team, **F** kicks, and **Space** still jumps. The nearby scoreboard also has Blue/Amber join, leave and kick buttons for touch controls. Each team has five slots; a five-minute match starts when both teams are represented. A lone player can practise. The server validates kicks and owns ball motion, friction, boundaries, complete goal-line crossings, score and four-second kickoff resets. No accounts or match database are needed.

Voice requests echo cancellation, noise suppression and automatic gain control, prefers supported Opus, recovers microphone device changes, attempts ICE restart and falls back to peer recreation. Settings include **Reconnect voice**. Automated audio tests verify decoded samples reaching the output, both directions, attenuation, device replacement and reconnect; a TURN relay remains necessary for some restrictive networks.

Additional verification:

```sh
STAGE=release node tests/jitter-probe.mjs
node tests/stress.mjs
PARK_PUBLIC=1 PARK_URL=https://parkkerala.online node tests/drive-network.mjs
```

The jitter probe deliberately delays, drops and reorders incoming snapshots. The load probe uses four actual browser clients plus four lightweight simulated clients locally. Public driving uses ordinary walking and vehicle controls with no development teleports.

See `DEVELOPMENT_AUDIT.md` for the release checklist and measured evidence.

Voice API references: [supported codec preferences](https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpTransceiver/setCodecPreferences) and [ICE restart](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/restartIce).
