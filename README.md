# PARK KERALA

An original, entirely client-side, low-poly third-person exploration game. Built with TypeScript, Three.js and Vite. No accounts, database, API server, or external asset services.

## Play locally

```sh
npm install
npm run dev
```

The default address is http://localhost:3000. The running server prints an alternative if that port is occupied.

- **WASD / arrow keys:** move relative to the camera
- **Shift:** sprint
- **Space:** jump
- **Mouse drag:** orbit the follow camera
- **E:** capture mouse for continuous mouse look; **Esc** releases it
- **M:** world map
- **Esc:** settings when mouse is not captured
- Touch devices have a movement stick, jump and sprint buttons; drag the world to look.

Settings include graphics quality, mouse sensitivity, ambient audio, and return to town. Audio is opt-in. Points and place discoveries last for the current session.

## World

A roughly 600 × 600 metre bounded world with six connected districts: Chayapuram town, Vellaram village, Neela backwaters, Paddy Country, Thengu Coast, and Malar Hill. Includes 36 collectibles, 28 wandering pedestrians, moving and parked vehicles, animals, Kerala-inspired architecture, a market, football ground, school, religious landmarks, two bridges, a pond, and a coastal road.

All 3D assets are procedural and original. Malayalam signage uses a bundled Noto Sans Malayalam font so the game doesn't depend on a font CDN. World geometry is grouped into 80 metre chunks, with distance visibility, frustum culling, shared primitive geometry, instanced colors, and simple collision boxes. The player has gravity, buffered jump input, axis-separated collision response, and a smoothed camera that checks obstacles.

The first version uses a fixed sunny lighting setup, simple pedestrians and traffic, and a flat walkable ground plane with decorative hills. Water is a scenic boundary crossed by bridges; swimming and driving are outside this version. All world data is generated on load; chunks control rendering rather than network streaming.

## Validation

```sh
npm run typecheck
npm run build
npm test
```

The browser tests expect the development server at port 3000 and Google Chrome installed. They cover loading, fonts, keyboard movement, sprint, short-tap jumping, gravity, mouse orbit, points, collision, both river crossings, world bounds, all district discoveries, map/settings, sound, quality selection, returning to spawn, and mobile controls. Development-only probes are excluded from production builds. Screenshots are saved under `artifacts/`.

`npm run build` produces a static `dist/` directory suitable for deploying at parkkerala.online. No production deployment or DNS configuration is included in the local version.

## Source layout

- `src/world.ts`: deterministic environment generation and reusable procedural models
- `src/main.ts`: rendering, player movement, camera, interactions, UI, local audio, map
- `src/style.css`: responsive game overlays and loading screen
- `tests/game.spec.ts`: end-to-end browser checks

## Font license

Noto Sans Malayalam is distributed under the SIL Open Font License 1.1. See `public/FONT-LICENSE.txt`.
