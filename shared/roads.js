import { baseHeight, smooth } from "./terrain-base.js";
import { HELIPADS } from "./config.js";
// One metre is one world unit. Road Y is the actual tyre-contact surface.
const mainNodes = [
  [100, 34, 0],
  [150, 34, 0],
  [150, -70, 0],
  [150, -116, 0],
  [150, -170, 0],
  [150, -209, 2],
  [150, -230, 4],
  [167, -265, 7],
  [208, -282, 11],
  [258, -307, 16],
  [306, -348, 22],
  [335, -400, 28],
  [393, -436, 34],
  [462, -431, 38],
  [517, -389, 40],
  [551, -329, 40],
  [565, -259, 40],
  [601, -203, 36],
  [614, -135, 31],
  [578, -78, 27],
  [505, -39, 21],
  [414, 3, 13],
  [318, 34, 6],
  [223, 34, 0],
  [215, 88, 0],
  [190, 130, 0],
  [150, 164, 0],
  [75, 164, 0],
  [0, 164, 0],
  [0, 100, 0],
  [0, 34, 0],
];
const definitions = [
  { id: "main", width: 12, closed: true, nodes: mainNodes },
  {
    id: "town",
    width: 13,
    nodes: [
      [0, -260, 5],
      [0, -170, 0],
      [0, 278, 0],
    ],
  },
  {
    id: "east-street",
    width: 11,
    nodes: [
      [150, -230, 4],
      [150, -209, 2],
      [150, -170, 0],
      [150, 278, 0],
    ],
  },
  {
    id: "town-cross",
    width: 13,
    nodes: [
      [-215, 34, 0],
      [223, 34, 0],
    ],
  },
  {
    id: "village-cross",
    width: 10,
    nodes: [
      [-2, -146, 0],
      [164, -146, 0],
    ],
  },
  {
    id: "residential",
    width: 8,
    nodes: [
      [-182, 124, 0],
      [0, 124, 0],
    ],
  },
  {
    id: "paddy",
    width: 10,
    nodes: [
      [0, 164, 0],
      [150, 164, 0],
    ],
  },
  {
    id: "coast",
    width: 8,
    nodes: [
      [-184, 117, 0],
      [-184, -124, 0],
      [-173, -139, 0],
      [-150, -146, 0],
      [0, -146, 0],
    ],
  },
  {
    id: "park-entry",
    width: 8,
    nodes: [
      [565, -259, 40],
      [535, -259, 40],
      [514, -259, 40],
    ],
  },
  {
    id: "park-loop",
    width: 7,
    closed: true,
    nodes: [
      [514, -259, 40],
      [505, -215, 40],
      [405, -215, 40],
      [395, -310, 40],
      [504, -324, 40],
    ],
  },
  {
    id: "park-lake",
    width: 4,
    nodes: [
      [405, -215, 40],
      [415, -245, 40],
      [495, -245, 40],
      [505, -215, 40],
    ],
  },
  {
    id: "park-north",
    width: 4,
    nodes: [
      [395, -310, 40],
      [455, -339, 40],
      [504, -324, 40],
    ],
  },
  {
    id: "park-parking",
    width: 10,
    nodes: [
      [565, -259, 40],
      [604, -259, 40],
    ],
  },
  {
    id: "park-parking-aisle",
    width: 10,
    nodes: [
      [584, -288, 40],
      [584, -231, 40],
    ],
  },
  {
    id: "turf-entry",
    width: 8,
    nodes: [
      [0, 235, 0],
      [36, 235, 0],
    ],
  },
  {
    id: "turf-parking",
    width: 10,
    nodes: [
      [24, 235, 0],
      [24, 267, 0],
    ],
  },
  {
    id: "town-pad",
    width: 8,
    nodes: [
      [0, 193, 0],
      [48, 193, 0],
    ],
  },
  {
    id: "park-pad",
    width: 7,
    nodes: [
      [601, -203, 36],
      [625, -240, 38],
      [634, -281, 40],
    ],
  },
  {
    id: "ridge-pad",
    width: 7,
    nodes: [
      [335, -400, 28],
      [351, -441, 29],
      [375, -481, 30],
    ],
  },
  {
    id: "north-pad",
    width: 7,
    nodes: [
      [167, -265, 7],
      [174, -300, 9],
      [177, -360, 14],
      [190, -450, 23],
      [188, -566, 35],
    ],
  },
];
// Rounded quadratic corners preserve straight bridge approaches and avoid spline overshoot.
/** @returns {{id:string,width:number,closed:boolean,nodes:number[][],length:number,points:{x:number,y:number,z:number,s:number}[]}} */
function buildRoad(def) {
  const nodes = def.nodes.map((p) => ({ x: p[0], z: p[1], y: p[2] + 0.18 }));
  const n = nodes.length,
    closed = !!def.closed,
    out = [];
  const mix = (a, b, t) => ({
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    y: a.y + (b.y - a.y) * t,
  });
  const corners = nodes.map((p, i) => {
    if (!closed && (i === 0 || i === n - 1))
      return { entry: p, exit: p, center: p };
    const a = nodes[(i + n - 1) % n],
      b = nodes[(i + 1) % n],
      la = Math.hypot(p.x - a.x, p.z - a.z),
      lb = Math.hypot(b.x - p.x, b.z - p.z);
    const radius = Math.min(def.width >= 10 ? 22 : 12, la * 0.3, lb * 0.3);
    return {
      entry: mix(p, a, radius / la),
      exit: mix(p, b, radius / lb),
      center: p,
    };
  });
  const line = (a, b) => {
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 1.5),
    );
    for (let j = 0; j < steps; j++) out.push(mix(a, b, j / steps));
  };
  for (let i = 0; i < n; i++) {
    const c = corners[i];
    if (c.entry !== c.exit) {
      const steps = Math.max(
        2,
        Math.ceil(
          (Math.hypot(c.entry.x - c.center.x, c.entry.z - c.center.z) +
            Math.hypot(c.exit.x - c.center.x, c.exit.z - c.center.z)) /
            1.5,
        ),
      );
      for (let j = 0; j < steps; j++) {
        const t = j / steps;
        out.push(mix(mix(c.entry, c.center, t), mix(c.center, c.exit, t), t));
      }
    }
    if (i < n - 1 || closed) line(c.exit, corners[(i + 1) % n].entry);
    else out.push(c.exit);
  }
  if (closed) out.push({ ...out[0] });
  if (def.id === "main") {
    const i = out.findIndex(
      (p, i) =>
        i < out.length - 1 &&
        Math.abs(p.z - 34) < 0.001 &&
        Math.abs(out[i + 1].z - 34) < 0.001 &&
        p.x <= 26 &&
        out[i + 1].x >= 26,
    );
    if (i >= 0) {
      const town = { x: 26, z: 34, y: 0.18 };
      const rotated = [
        town,
        ...out.slice(i + 1, -1),
        ...out.slice(0, i + 1),
        { ...town },
      ];
      out.splice(0, out.length, ...rotated);
    }
  }
  // All roads crossing the river use the bridge deck, including its graded approaches.
  for (const p of out) {
    if (
      Math.min(Math.abs(p.x), Math.abs(p.x - 150), Math.abs(p.x + 184)) < 8 &&
      Math.abs(p.z + 92) < 37
    )
      p.y = Math.max(
        p.y,
        0.18 + 0.18 * (1 - smooth((Math.abs(p.z + 92) - 17) / 20)),
      );
  }
  let length = 0;
  out.forEach((p, i) => {
    if (i) length += Math.hypot(p.x - out[i - 1].x, p.z - out[i - 1].z);
    p.s = length;
  });
  return { ...def, points: out, length, closed };
}
export const ROADS = definitions.map(buildRoad);
export const MAIN_ROAD = ROADS[0];
export function roadFrame(road, distance, offset = 0) {
  const s = road.closed
    ? ((distance % road.length) + road.length) % road.length
    : Math.max(0, Math.min(road.length, distance));
  let lo = 0,
    hi = road.points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (road.points[mid].s <= s) lo = mid;
    else hi = mid;
  }
  const a = road.points[lo],
    b = road.points[hi],
    t = (s - a.s) / (b.s - a.s || 1),
    len = Math.hypot(b.x - a.x, b.z - a.z) || 1,
    tx = (b.x - a.x) / len,
    tz = (b.z - a.z) / len;
  return {
    x: a.x + (b.x - a.x) * t - tz * offset,
    z: a.z + (b.z - a.z) * t + tx * offset,
    y: a.y + (b.y - a.y) * t,
    tx,
    tz,
    nx: -tz,
    nz: tx,
    yaw: Math.atan2(-tx, -tz),
    s,
  };
}
export function projectOnRoad(road, x, z) {
  let best = { distance: Infinity, s: 0, x: 0, z: 0, y: 0, lateral: 0 };
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1],
      b = road.points[i],
      dx = b.x - a.x,
      dz = b.z - a.z,
      l2 = dx * dx + dz * dz,
      t = Math.max(
        0,
        Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (l2 || 1)),
      ),
      px = a.x + dx * t,
      pz = a.z + dz * t,
      d = Math.hypot(x - px, z - pz);
    if (d < best.distance)
      best = {
        distance: d,
        s: a.s + (b.s - a.s) * t,
        x: px,
        z: pz,
        y: a.y + (b.y - a.y) * t,
        lateral: ((x - px) * -dz + (z - pz) * dx) / Math.sqrt(l2 || 1),
      };
  }
  return best;
}
// Match branch approach grades to the primary road while their surfaces overlap.
for (const road of ROADS.slice(1))
  for (const p of road.points) {
    const main = projectOnRoad(MAIN_ROAD, p.x, p.z);
    if (main.distance < 28) {
      const weight = 1 - smooth((main.distance - 9) / 19);
      p.y = p.y * (1 - weight) + main.y * weight;
    }
  }
/** @type {[string,string,string,number,number][]} */
const stopDefs = [
  ["town", "Chayapuram", "ചായപ്പുറം", 26, 34],
  ["riverside", "Neela Riverside", "നീലക്കായൽ", 150, -132],
  ["village", "Vellaram Village", "വെള്ളാരം", 150, -209],
  ["viewpoint", "Malar Viewpoint", "മലർ മല", 325, -381],
  ["sarovaram", "Sarovaram Park", "സരോവരം പാർക്ക്", 556, -305],
  ["east", "Eastern Valley", "കിഴക്കൻ താഴ്വര", 505, -39],
  ["football", "Football Turf", "ഫുട്ബോൾ ടർഫ്", 75, 164],
];
export const ROAD_STOPS = stopDefs
  .map(([id, name, local, x, z]) => {
    const s = projectOnRoad(MAIN_ROAD, x, z).s,
      center = roadFrame(MAIN_ROAD, s),
      shelter = roadFrame(MAIN_ROAD, s, -17),
      sign = roadFrame(MAIN_ROAD, s, -15.5);
    return {
      id,
      name,
      local,
      ...center,
      s,
      shelter: { ...shelter, yaw: center.yaw + Math.PI / 2 },
      sign: { ...sign, yaw: center.yaw + Math.PI / 2 },
    };
  })
  .sort((a, b) => a.s - b.s);
export const loopDelta = (a, b, length) =>
  Math.min(Math.abs(a - b), length - Math.abs(a - b));
export function bayWidening(s) {
  let extra = 0;
  for (const stop of ROAD_STOPS)
    extra = Math.max(
      extra,
      4 * (1 - smooth((loopDelta(s, stop.s, MAIN_ROAD.length) - 10) / 25)),
    );
  return extra;
}
export function laneOffset(s) {
  let offset = -3;
  for (const stop of ROAD_STOPS)
    offset -=
      3 * (1 - smooth((loopDelta(s, stop.s, MAIN_ROAD.length) - 8) / 30));
  return offset;
}
// Local spatial index keeps terrain/collision queries independent of overall network size.
const GRID = 32,
  index = new Map();
for (const road of ROADS)
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1],
      b = road.points[i],
      segment = { road, a, b };
    for (
      let gx = Math.floor((Math.min(a.x, b.x) - 28) / GRID);
      gx <= Math.floor((Math.max(a.x, b.x) + 28) / GRID);
      gx++
    )
      for (
        let gz = Math.floor((Math.min(a.z, b.z) - 28) / GRID);
        gz <= Math.floor((Math.max(a.z, b.z) + 28) / GRID);
        gz++
      ) {
        const key = `${gx},${gz}`,
          list = index.get(key) || [];
        list.push(segment);
        index.set(key, list);
      }
  }
export function nearestRoad(x, z) {
  const candidates = new Map();
  for (const { road, a, b } of index.get(
    `${Math.floor(x / GRID)},${Math.floor(z / GRID)}`,
  ) || []) {
    const dx = b.x - a.x,
      dz = b.z - a.z,
      len = Math.hypot(dx, dz),
      t = Math.max(
        0,
        Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (len * len || 1)),
      ),
      px = a.x + dx * t,
      pz = a.z + dz * t,
      d = Math.hypot(x - px, z - pz),
      s = a.s + (b.s - a.s) * t,
      lateral = ((x - px) * -dz + (z - pz) * dx) / (len || 1);
    const old = candidates.get(road.id);
    if (old && old.distance <= d) continue;
    const half =
      road.width / 2 + (road.id === "main" && lateral < 0 ? bayWidening(s) : 0);
    candidates.set(road.id, {
      road,
      distance: d,
      edge: d - half,
      s,
      x: px,
      z: pz,
      y: a.y + (b.y - a.y) * t,
      lateral,
      half,
    });
  }
  const main = candidates.get("main");
  if (main && main.edge <= 0.05) return main;
  const sorted = [...candidates.values()].sort((a, b) => a.edge - b.edge),
    best = sorted[0];
  if (!best) return null;
  // Blend branch intersections into one continuous shared driving surface.
  let sum = 0,
    weight = 0;
  for (const c of sorted) {
    const w = smooth(-c.edge / 3);
    sum += c.y * w;
    weight += w;
  }
  let y = weight > 0 ? sum / weight : best.y;
  if (main && main.edge < 6) {
    const merge = smooth(main.edge / 6);
    y = main.y * (1 - merge) + y * merge;
  }
  return { ...best, y };
}
export function terrainHeight(x, z) {
  const raw = baseHeight(x, z),
    road = nearestRoad(x, z);
  if (!road || road.edge >= 16) return raw;
  const weight = 1 - smooth((road.edge - 3) / 13);
  return raw * (1 - weight) + (road.y - 0.18) * weight;
}
export function surfaceHeight(x, z) {
  const road = nearestRoad(x, z);
  if (road && road.edge <= 0.05) return road.y;
  for (const p of HELIPADS)
    if (Math.abs(x - p.x) < 12 && Math.abs(z - p.z) < 12)
      return terrainHeight(p.x, p.z) + 0.21;
  return terrainHeight(x, z);
}
export function walkingHeight(x, z) {
  const road = nearestRoad(x, z);
  return road && road.edge <= 0.05 ? road.y + 0.07 : surfaceHeight(x, z) + 0.25;
}
export function clearRoadFootprint(x, z, w = 0, d = w, padding = 0.35) {
  const radius = Math.hypot(w, d) / 2 + 16,
    seen = new Set();
  for (
    let gx = Math.floor((x - radius) / GRID);
    gx <= Math.floor((x + radius) / GRID);
    gx++
  )
    for (
      let gz = Math.floor((z - radius) / GRID);
      gz <= Math.floor((z + radius) / GRID);
      gz++
    ) {
      for (const segment of index.get(`${gx},${gz}`) || []) {
        if (seen.has(segment)) continue;
        seen.add(segment);
        const { road, a, b } = segment;
        const t = Math.max(
            0,
            Math.min(
              1,
              ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) /
                ((b.x - a.x) ** 2 + (b.z - a.z) ** 2 || 1),
            ),
          ),
          px = a.x + (b.x - a.x) * t,
          pz = a.z + (b.z - a.z) * t,
          s = a.s + (b.s - a.s) * t;
        const radius =
          road.width / 2 + padding + (road.id === "main" ? bayWidening(s) : 0);
        if (
          Math.hypot(
            Math.max(0, Math.abs(px - x) - w / 2),
            Math.max(0, Math.abs(pz - z) - d / 2),
          ) < radius
        )
          return true;
      }
    }
  return false;
}
export function wheelGeometry(kind) {
  return kind === "bus"
    ? { half: 3, width: 1.5, hub: 0.5, radius: 0.6 }
    : kind === "bike"
      ? { half: 0.85, width: 0, hub: 0.4, radius: 0.4 }
      : { half: 1.45, width: 1.1, hub: 0.45, radius: 0.45 };
}
export function groundPose(x, z, yaw, kind = "car") {
  const { half, width, hub, radius } = wheelGeometry(kind);
  const front = surfaceHeight(
      x - Math.sin(yaw) * half,
      z - Math.cos(yaw) * half,
    ),
    rear = surfaceHeight(x + Math.sin(yaw) * half, z + Math.cos(yaw) * half),
    pitch = Math.atan2(front - rear, half * 2);
  let y = -Infinity;
  for (const xx of [-width, width])
    for (const zz of [-half, half]) {
      const localZ = hub * Math.sin(pitch) + zz * Math.cos(pitch),
        localBottom = hub * Math.cos(pitch) - zz * Math.sin(pitch) - radius;
      const wx = x + xx * Math.cos(yaw) + localZ * Math.sin(yaw),
        wz = z - xx * Math.sin(yaw) + localZ * Math.cos(yaw);
      y = Math.max(y, surfaceHeight(wx, wz) - localBottom);
    }
  return { y, pitch };
}
export function validateRoads() {
  const issues = [];
  for (const road of ROADS) {
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1],
        b = road.points[i],
        d = b.s - a.s,
        grade = Math.abs(b.y - a.y) / (d || 1);
      if (d > 2.1 || grade > 0.145 || !Number.isFinite(b.y))
        issues.push({ road: road.id, segment: i, grade, gap: d });
    }
  }
  return issues;
}

// Intersections must not be crossed by another road's shoulder or roadside props.
export function insideOtherRoad(x, z, roadId, padding = 0.25) {
  for (const { road, a, b } of index.get(
    `${Math.floor(x / GRID)},${Math.floor(z / GRID)}`,
  ) || []) {
    if (road.id === roadId) continue;
    const dx = b.x - a.x,
      dz = b.z - a.z,
      t = Math.max(
        0,
        Math.min(
          1,
          ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1),
        ),
      );
    const distance = Math.hypot(x - a.x - t * dx, z - a.z - t * dz),
      s = a.s + (b.s - a.s) * t;
    if (
      distance <
      road.width / 2 + padding + (road.id === "main" ? bayWidening(s) : 0)
    )
      return true;
  }
  return false;
}
