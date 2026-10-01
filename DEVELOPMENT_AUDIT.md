# Park Kerala release audit

Verified on 2026-10-01. The original gameplay audit covered `f6554bf`; networking and renewable voice configuration were subsequently verified on public release `191d7c7`. The final compact-snapshot follow-up is `1715eb0`, serving client asset `index-D3QvqwxY.js`. See the follow-up evidence below for the scope of each check.

| Requirement | Tested evidence |
| --- | --- |
| Hilly world, Sarovaram, continuous roads | 8,739 actual rendered road-surface samples passed; local browser car/bike full loops passed. |
| Branches, bridges, grades and clear lanes | Car/bike physics traversed every vehicle branch in both directions; all road continuity and clearance checks passed. |
| Bus height, circulation, frequency and capacity | Eight buses completed four simulated loops; 30-second headway, 20 seats, full-bus handling and next-bus boarding passed. Public observation covered all seven stops, with no height, obstruction, spacing or discontinuity failures. |
| Seated passengers | Two local browsers rode viewpoint → Sarovaram with correct pitched seat transforms. Two public browsers boarded one bus in distinct seats, rode together and exited only at a stop. |
| Vehicles and helicopters | All 25 vehicles/four helicopters passed local access checks. Public car entry/drive/brake/exit, bike mount/ride/turn/brake/remote ownership/exit, and helicopter takeoff/turn/horizontal flight/landing/exit passed. |
| Movement, sprint, running jump, camera and minimap | Local browser regression checks passed. |
| Usernames, Malayalam names and multiplayer | Local server/browser checks and public two-browser HTTPS/WSS checks passed. |
| Remote smoothness | Delayed/dropped/reordered snapshot test reduced walking speed deviation from 12.01 to 0.205 m/s, reverse frames from 28 to zero, and slow frames from 62 to zero. Car deviation was 0.118 m/s with zero reverse/slow frames. |
| Voice range and recovery | Local two-browser Opus decoded/output PCM, mute/unmute, device replacement, ICE restart and signalling reconnect passed. Public two-way decoded turf audio and 5/25/50/75/99/105 m attenuation/mute checks passed; gain was zero beyond range. |
| Football, teams, goals and score | Two actual public browsers walked to the turf, joined opposing teams, kicked the same ball both directions, observed matching goal/score updates and centre reset. Server tests covered kick validation, friction/bounces, complete goal-line crossing, 5v5 capacity and five-minute matches. |
| Multi-client stress | Ten clients: four measured browsers, four simulated users and two hill riders. Measured browsers were approximately 60 FPS; maximum snapshot gap 89 ms. Server observation was approximately 128 MiB RSS and 5.6% CPU. This is not a 64-player capacity certification. |
| Build and regression | All 27 server/physics tests passed. All 13 browser cases passed across the release run and targeted reruns. TypeScript/Vite build passed. |
| GitHub, Render and production | Remote main was verified, the existing Render deployment became live, HTTPS health and asset hashes matched. Render returned no application error logs after the follow-up deployment. |

## Public audit details and limits

Checks used ordinary browser controls and observations of ordinary network messages, without production development hooks. Synthetic microphone input was used; decoded audio tests are not a human acoustic listening test.

A helicopter geometry batching console error discovered during the public audit was fixed. The updated production build created vehicle models without console/runtime errors. A full-game browser session remained connected for over 65 seconds, receiving over 1,100 snapshots at approximately 30 rendered FPS. Later concurrent browser checks used the existing lightweight graphics setting.

Earlier autonomous public browser car/bike loops encountered delayed feedback, intermittent WebSocket 1006 disconnects and route departures; those browser runs remain inconclusive. A subsequent independent live-server test using ordinary movement, steering, throttle and interaction messages completed both full circuits: car 2,018.57 m in 308.30 s, bike 2,018.57 m in 308.00 s, with maximum lane errors of 2.21 m and 2.76 m respectively. This is authoritative production physics/network coverage, not a claim that a rendered browser drove those complete public circuits. Local complete browser circuits and shorter public browser vehicle controls passed separately.

TURN is not configured because no provider credentials have been supplied. Voice on restrictive networks and human listening across two physical devices remain unverified. A full 64-player load test was not performed.

## Networking and relay preparation follow-up

World snapshots now negotiate bounded WebSocket compression while retaining the 20 Hz simulation. A paired five-second measurement received 98 snapshots on each connection: 200,259 compressed wire bytes versus 715,101 uncompressed bytes (72% lower traffic). Ten compressed local clients each received at least 196 snapshots over ten seconds; the largest observed gap was 113 ms.

Optional Cloudflare TURN integration requests temporary credentials server-side for joined sessions, caches and renews them, backs off provider failures and revokes configuration access on disconnect. Static TURN settings remain supported. The browser updates existing connections and coalesces overlapping ICE restart requests. Two actual browsers retained the same peer connections and decoded two-way synthetic audio through simulated credential expiry. The existing microphone/device/ICE/signalling recovery test also passed. All 32 server tests and the production build passed at that stage.

The public smoke test now explicitly polls asynchronous audio statistics and requires decoded PCM, avoiding a truthy Promise being mistaken for successful audio. The separate relay test forces selected relay candidates in both browsers; it has not passed against a real provider because no provider account or credentials are configured. These changes prepare relay support; they do not activate it. Release `191d7c7` became live, with matching health/asset checks and no Render application error logs. Public browsers passed decoded two-way audio, 5/25/50/75/99/105 m attenuation, mute, car entry/drive/brake/exit and a shared bus ride with distinct seats and stop-only exit. The bus test now waits for the visible boarding prompt and uses observed position rather than fixed-duration walking.


## Compact snapshots through the public proxy

The public Render/Cloudflare path did not negotiate WebSocket compression, so the 72% local compression saving must not be claimed for production. Snapshot serialization now rounds transmitted fractional numbers to three decimal places while retaining full-precision simulation state. A 100-snapshot public sample measured 780,321 raw bytes versus 692,199 bytes after compact encoding (11% lower). The encoding test bounds numeric changes to 0.0005 and verifies identical fields, integer timestamps, sequences and nonnumeric values, with no mutation of physics state.

All 33 server tests and the production build passed. Local browser multiplayer/vehicle ownership, two-way voice/device/ICE/signalling recovery, and in-place credential renewal tests passed with compact snapshots.

Reproduce the live authoritative road check with `node tests/production-route.mjs` (about five minutes; uses the available town car and bike). Run `PARK_URL=https://parkkerala.online node tests/production-smoke.mjs` for actual public browser voice, vehicle and bus controls. These scripts use synthetic audio and ordinary public game messages, with no production development hooks.

Public release `1715eb0` was then verified live: HTTPS health matched, 200 observed snapshots used the compact numeric representation (maximum observed gap 202 ms), and the complete two-browser public smoke run passed. It verified decoded two-way audio, distance fading through 105 m, mute, car entry/drive/brake/exit, shared bus boarding in distinct seats, synchronized travel, stop-only exit and no browser errors. Render returned no application error logs for this release. The relay dashboard still requires account sign-in; no relay or billing subscription was activated.
