# Park Kerala release audit

Verified on 2026-10-01 against gameplay release `f6554bf`. The existing GitHub repository and Render service were updated. Public health and the served client asset (`index-BJ9s18yG.js`) matched the release.

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

Extended autonomous public car/bike loops did **not** complete reliably: the test controller encountered delayed feedback, intermittent WebSocket 1006 disconnects and route departures. These runs must not be reported as passed full public driving circuits. Local complete circuits, branch/surface/jitter tests, shorter public vehicle controls, and public bus route observation passed separately.

TURN is not configured because no provider credentials have been supplied. Voice on restrictive networks and human listening across two physical devices remain unverified. A full 64-player load test was not performed.
