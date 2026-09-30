import { FOOTBALL, inFootballArea } from "../shared/football-config.js";
import { buildFootballTurf } from "./world/football";
import {
  ROADS,
  MAIN_ROAD,
  ROAD_STOPS,
  roadFrame,
  loopDelta,
  bayWidening,
  clearRoadFootprint,
  insideOtherRoad,
} from "../shared/roads.js";
import { HELIPADS } from "../shared/config.js";
import * as T from "three";
import {
  heightAt,
  HILL_ROAD,
  STOPS,
  PARK,
  nearRoad,
  VEHICLE_SPAWNS,
} from "../shared/world.js";
import {
  createTerrain,
  buildRoadNetwork,
  roadRibbon,
  samplePath,
} from "./world/terrain";
import { buildParks } from "./world/parks/registry";

export const WORLD = 720;
export type Collider = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  base?: number;
  water?: boolean;
};
export type Zone = {
  name: string;
  local: string;
  x: number;
  z: number;
  color: string;
  subtitle: string;
};
export const zones: Zone[] = [
  {
    name: "Chayapuram",
    local: "ചായപ്പുറം",
    x: 0,
    z: 0,
    color: "#eebf73",
    subtitle: "THE TOWN SQUARE",
  },
  {
    name: "Vellaram Village",
    local: "വെള്ളാരം",
    x: 145,
    z: -130,
    color: "#c4d291",
    subtitle: "SLOW ROADS & TILED ROOFS",
  },
  {
    name: "Paddy Country",
    local: "പാടശേഖരം",
    x: 150,
    z: 110,
    color: "#a4bd62",
    subtitle: "FIELDS OF A THOUSAND GREENS",
  },
  {
    name: "Neela Backwaters",
    local: "നീലക്കായൽ",
    x: 5,
    z: -116,
    color: "#86c6c7",
    subtitle: "FOLLOW THE WATER",
  },
  {
    name: "Thengu Coast",
    local: "തെങ്ങിൻ തീരം",
    x: -205,
    z: 25,
    color: "#eddcb0",
    subtitle: "A LITTLE CLOSER TO THE SEA",
  },
  {
    name: "Malar Hill",
    local: "മലർ മല",
    x: 145,
    z: -242,
    color: "#8caa7a",
    subtitle: "THE SCENIC WAY HOME",
  },
];
zones.push(
  {
    name: "Sarovaram Park",
    local: PARK.local,
    x: PARK.x,
    z: PARK.z,
    color: "#85b48b",
    subtitle: "LAKESIDE WALKS & LITTLE WONDERS",
  },
  {
    name: "Malar Viewpoint",
    local: "മലർ മല",
    x: 335,
    z: -400,
    color: "#a4b481",
    subtitle: "KERALA, FROM ABOVE",
  },
  {
    name: "Eastern Valley",
    local: "കിഴക്കൻ താഴ്വര",
    x: 505,
    z: -39,
    color: "#c4bd86",
    subtitle: "THE LONG WAY HOME",
  },
  {
    name: "Football Turf",
    local: "ഫുട്ബോൾ ടർഫ്",
    x: FOOTBALL.x,
    z: FOOTBALL.z,
    color: "#77ba8a",
    subtitle: "YOUR FRIENDS. YOUR GAME.",
  },
);
export function zoneAt(x: number, z: number) {
  if (Math.abs(x - PARK.x) < 90 && Math.abs(z - PARK.z) < 95)
    return zones.find((z) => z.name === "Sarovaram Park")!;
  return zones.reduce((a, b) =>
    Math.hypot(x - a.x, z - a.z) < Math.hypot(x - b.x, z - b.z) ? a : b,
  );
}
const geometries = {
  box: new T.BoxGeometry(1, 1, 1),
  cylinder: new T.CylinderGeometry(1, 1, 1, 7),
  cone: new T.ConeGeometry(1, 1, 5),
  sphere: new T.IcosahedronGeometry(1, 0),
  roof: new T.CylinderGeometry(0, 1, 1, 4, 1),
};
type Shape = keyof typeof geometries;
const materials = new Map<string, T.MeshStandardMaterial>();
function mat(color: string) {
  if (!materials.has(color))
    materials.set(
      color,
      new T.MeshStandardMaterial({ color, roughness: 0.92 }),
    );
  return materials.get(color)!;
}
export function part(
  parent: T.Object3D,
  shape: Shape,
  color: string,
  pos: number[],
  size: number[],
  rot?: number[],
) {
  const m = new T.Mesh(geometries[shape], mat(color));
  m.position.set(pos[0], pos[1], pos[2]);
  m.scale.set(size[0], size[1], size[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const random = rng(731);
export type Person = { group: T.Group; legs: T.Object3D[]; arms: T.Object3D[] };
export function person(
  color = "#f1c762",
  skin = "#aa6c49",
  player = false,
): Person {
  const g = new T.Group();
  part(g, "box", color, [0, 1.28, 0], [0.62, 0.75, 0.34]);
  part(g, "box", skin, [0, 1.95, 0], [0.44, 0.48, 0.4]);
  part(g, "box", "#302c28", [0, 2.18, 0.02], [0.48, 0.17, 0.43]);
  part(g, "box", "#302c28", [0, 2.02, 0.19], [0.45, 0.24, 0.05]);
  const legs: T.Object3D[] = [],
    arms: T.Object3D[] = [];
  for (const side of [-1, 1]) {
    const leg = new T.Group();
    leg.position.set(side * 0.18, 0.95, 0);
    g.add(leg);
    part(
      leg,
      "box",
      player ? "#f3e5c8" : "#334c4a",
      [0, -0.37, 0],
      [0.23, 0.75, 0.27],
    );
    part(leg, "box", "#594633", [0, -0.82, -0.08], [0.27, 0.18, 0.42]);
    legs.push(leg);
    const arm = new T.Group();
    arm.position.set(side * 0.4, 1.6, 0);
    g.add(arm);
    part(arm, "box", color, [0, -0.15, 0], [0.2, 0.37, 0.28]);
    part(arm, "box", skin, [0, -0.49, 0], [0.17, 0.35, 0.21]);
    arms.push(arm);
  }
  if (player) {
    part(g, "box", "#355b47", [0, 1.32, 0.27], [0.48, 0.54, 0.22]);
    part(g, "box", "#e3ca85", [0, 1.43, 0.4], [0.2, 0.12, 0.05]);
  }
  return { group: g, legs, arms };
}
export function animatePerson(p: Person, time: number, speed: number) {
  p.legs.forEach(
    (l, i) => (l.rotation.x = Math.sin(time * 9 + i * Math.PI) * speed * 0.65),
  );
  p.arms.forEach(
    (l, i) => (l.rotation.x = -Math.sin(time * 9 + i * Math.PI) * speed * 0.6),
  );
}
export type WorldData = {
  root: T.Group;
  colliders: Collider[];
  waters: T.Mesh[];
  npcs: { person: Person; x: number; z: number; phase: number }[];
  traffic: {
    group: T.Group;
    axis: "x" | "z";
    lane: number;
    min: number;
    max: number;
    speed: number;
  }[];
  collectibles: T.Group[];
  chunks: T.Group[];
  animals: T.Group[];
};
export function createWorld(): WorldData {
  const root = new T.Group(),
    colliders: Collider[] = [],
    waters: T.Mesh[] = [],
    npcs: WorldData["npcs"] = [],
    traffic: WorldData["traffic"] = [],
    collectibles: T.Group[] = [],
    chunks: T.Group[] = [],
    animals: T.Group[] = [];
  const solid = (x: number, z: number, w: number, d: number, h: number) =>
    colliders.push({ x, z, w, d, h });
  const chunkMap = new Map<string, T.Group>();
  function chunk(x: number, z: number) {
    const key = `${Math.floor(x / 80)},${Math.floor(z / 80)}`;
    if (!chunkMap.has(key)) {
      const g = new T.Group();
      g.userData.center = new T.Vector3(
        Math.floor(x / 80) * 80 + 40,
        0,
        Math.floor(z / 80) * 80 + 40,
      );
      root.add(g);
      chunks.push(g);
      chunkMap.set(key, g);
    }
    return chunkMap.get(key)!;
  }
  function box(
    p: T.Object3D,
    c: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) {
    return part(p, "box", c, [x, y, z], [w, h, d]);
  }
  // Shared ground and a road network that crosses the river on shared bridge surfaces.
  createTerrain(root);
  box(root, "#e7d5a5", -223, -0.01, 0, 48, 0.1, 600);
  function water(x: number, z: number, w: number, d: number) {
    const m = new T.Mesh(
      new T.PlaneGeometry(
        w,
        d,
        Math.max(4, Math.round(w / 7)),
        Math.max(4, Math.round(d / 7)),
      ),
      new T.MeshStandardMaterial({
        color: "#56b8b2",
        roughness: 0.28,
        metalness: 0.17,
        flatShading: true,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.015, z);
    root.add(m);
    waters.push(m);
    return m;
  }
  water(-273, 0, 54, 600);
  water(28, -92, 493, 28);
  water(183, 205, 63, 46);
  // Water uses solid shore boundaries. Only bridges allow river crossings.
  solid(-254, 0, 16, 600, 4);
  colliders.at(-1)!.water = true;
  solid(183, 205, 63, 46, 2);
  colliders.at(-1)!.water = true;
  for (const [x, w] of [
    [-209, 36],
    [-92, 170],
    [75, 136],
    [222.5, 131],
  ]) {
    solid(x, -92, w, 27, 2);
    colliders.at(-1)!.water = true;
  }
  buildRoadNetwork(root);
  function sign(
    p: T.Object3D,
    x: number,
    y: number,
    z: number,
    text: string,
    sub: string,
    w = 6,
    bg = "#284f45",
    fg = "#fff4d7",
    angle = 0,
  ) {
    // Only attached shop/shelter plaques remain; remove standalone advertising boards.
    if (
      p.userData.center &&
      !sub.includes("TEA GARDEN") &&
      !sub.includes("PARK INFORMATION")
    )
      return new T.Mesh();
    w = Math.min(w, 3.8);
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 256;
    const c = canvas.getContext("2d")!;
    c.fillStyle = bg;
    c.fillRect(0, 0, 768, 256);
    c.strokeStyle = fg;
    c.globalAlpha = 0.45;
    c.lineWidth = 3;
    c.strokeRect(12, 12, 744, 232);
    c.globalAlpha = 1;
    c.fillStyle = fg;
    c.textAlign = "center";
    let fontSize = 77;
    c.font = `700 ${fontSize}px "Noto Sans Malayalam", sans-serif`;
    while (c.measureText(text).width > 694 && fontSize > 25) {
      fontSize -= 2;
      c.font = `700 ${fontSize}px "Noto Sans Malayalam", sans-serif`;
    }
    c.fillText(text, 384, 117);
    c.font = "500 32px sans-serif";
    c.fillText(sub.toUpperCase(), 384, 192);
    const tex = new T.CanvasTexture(canvas);
    tex.colorSpace = T.SRGBColorSpace;
    const m = new T.Mesh(
      new T.PlaneGeometry(w, w / 3),
      new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide }),
    );
    m.position.set(x, y, z);
    m.rotation.y = angle;
    p.add(m);
    return m;
  }
  function palm(x: number, z: number, scale = 1) {
    if (clearRoadFootprint(x, z, 0.8, 0.8)) return;
    const p = chunk(x, z),
      g = new T.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    p.add(g);
    part(
      g,
      "cylinder",
      "#968466",
      [0, 4.3, 0],
      [0.25, 8.6, 0.25],
      [0, 0, -0.1],
    );
    for (let k = 0; k < 5; k++)
      part(
        g,
        "cylinder",
        "#b0a07d",
        [0.08 + k * 0.08, 1.4 + k * 1.5, 0],
        [0.28, 0.12, 0.28],
      );
    for (let i = 0; i < 7; i++) {
      const a = (i * Math.PI * 2) / 7;
      const leaf = part(
        g,
        "sphere",
        i % 2 ? "#4f824c" : "#658f50",
        [0.45 + Math.sin(a) * 2.25, 8.5, Math.cos(a) * 2.25],
        [0.64, 0.2, 3.2],
        [0.15, a, 0],
      );
      leaf.rotation.z = 0.1;
    }
    part(g, "sphere", "#514d2e", [0.5, 8, 0], [0.6, 0.5, 0.55]);
    solid(x, z, 0.7 * scale, 0.7 * scale, 8 * scale);
  }
  function tree(x: number, z: number, s = 1) {
    const g = chunk(x, z);
    part(
      g,
      "cylinder",
      "#88734f",
      [x, 1.7 * s, z],
      [0.38 * s, 3.4 * s, 0.38 * s],
    );
    part(g, "sphere", "#5a8650", [x, 4.6 * s, z], [2.8 * s, 3 * s, 2.8 * s]);
    part(
      g,
      "sphere",
      "#79a35b",
      [x - 1.2 * s, 5 * s, z],
      [2 * s, 2.3 * s, 2 * s],
    );
    solid(x, z, 0.85 * s, 0.85 * s, 5 * s);
  }
  function banana(x: number, z: number) {
    const g = chunk(x, z);
    part(g, "cylinder", "#7d914a", [x, 1.3, z], [0.2, 2.6, 0.2]);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26;
      part(
        g,
        "sphere",
        "#679c43",
        [x + Math.sin(a), 2.6, z + Math.cos(a)],
        [0.45, 0.12, 1.7],
        [0.2, a, 0],
      );
    }
  }
  function roof(
    g: T.Object3D,
    w: number,
    d: number,
    y: number,
    color = "#b56e4e",
  ) {
    part(
      g,
      "roof",
      color,
      [0, y, 0],
      [w * 0.76, 2.8, d * 0.76],
      [0, Math.PI / 4, 0],
    );
  }
  function house(
    x: number,
    z: number,
    w = 9,
    d = 8,
    color = "#eddab3",
    angle = 0,
    modern = false,
  ) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.rotation.y = angle;
    chunk(x, z).add(g);
    box(g, "#c4b593", 0, 0.24, 0, w + 1, 0.48, d + 1);
    box(g, color, 0, 2.25, 0, w, 4, d);
    if (modern) {
      box(g, "#ece3c5", 0, 4.5, 0, w + 0.7, 0.4, d + 0.7);
      box(g, color, -w * 0.15, 5.7, 0.8, w * 0.55, 2.3, d * 0.65);
      box(g, "#ede6ce", -w * 0.15, 7, 0.8, w * 0.6, 0.3, d * 0.7);
    } else roof(g, w + 1, d + 1, 5.5);
    for (const xx of [-w * 0.31, w * 0.31]) {
      box(g, "#efe8ce", xx, 2.35, d / 2 + 0.04, 1.8, 1.9, 0.14);
      box(g, "#476667", xx, 2.35, d / 2 + 0.13, 1.5, 1.6, 0.12);
      box(g, "#c9b891", xx, 2.35, d / 2 + 0.21, 0.08, 1.6, 0.05);
    }
    box(g, "#6c6248", 0, 1.6, d / 2 + 0.09, 1.25, 2.7, 0.15);
    box(g, "#b77c56", 0, 3.55, d / 2 + 1.1, w + 1, 0.2, 2.2);
    for (const xx of [-w / 2, w / 2])
      box(g, "#eadac0", xx, 1.8, d / 2 + 1.9, 0.2, 3.6, 0.2);
    solid(
      x,
      z,
      angle ? d + 1 : w + 1,
      angle ? w + 1 : d + 1,
      modern ? 7.3 : 6.9,
    );
  }
  const shops = [
    ["ചായക്കട", "MALABAR TEA HOUSE", "#e7c87f", "#386355"],
    ["ബേക്കറി", "SUNRISE BAKERY", "#e6b9a0", "#995644"],
    ["പലചരക്ക് കട", "PALM STORES", "#aec1a3", "#405e4d"],
    ["ഹോട്ടൽ", "HOTEL NAADAN", "#e4d3a8", "#ad6547"],
    ["മെഡിക്കൽസ്", "NILA MEDICALS", "#c2d8cc", "#366c62"],
    ["വർക്ക് ഷോപ്പ്", "COAST MOTOR WORKS", "#d8c2a3", "#5c6862"],
  ];
  function shop(x: number, z: number, index: number, angle = 0) {
    const [ml, en, color, bg] = shops[index % shops.length];
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.rotation.y = angle;
    chunk(x, z).add(g);
    box(g, "#d0c3a6", 0, 0.3, 0, 10, 0.6, 9);
    box(g, color, 0, 2.6, 0, 9, 4.6, 7);
    roof(g, 11, 9, 6.1);
    box(g, "#3f5147", 0, 1.9, 3.56, 6.8, 2.9, 0.08);
    for (const xx of [-2.2, 0, 2.2])
      box(g, "#796e4e", xx, 1.5, 3.72, 0.15, 2.8, 0.12);
    sign(g, 0, 4.05, 3.57, ml, en, 2.8, bg);
    box(g, "#f4e5bf", 0, 3.1, 4.85, 10, 0.16, 2.7);
    for (let i = 0; i < 10; i++)
      box(g, i % 2 ? "#e7c88c" : bg, -4.5 + i, 3.12, 4.85, 1, 0.18, 2.7);
    for (const xx of [-4.5, 4.5])
      box(g, "#645f47", xx, 1.5, 5.9, 0.13, 3, 0.13);
    box(g, "#7b7451", 0, 0.9, 4.1, 5, 0.12, 0.9);
    solid(x, z, angle ? 7 : 9, angle ? 9 : 7, 7.6);
    if (index % 3 === 0) {
      for (const xx of [-3, 2.2]) {
        part(g, "cylinder", "#aa7950", [xx, 0.95, 7], [0.75, 0.14, 0.75]);
        box(g, "#545e45", xx, 0.45, 7, 0.15, 0.9, 0.15);
        for (const zz of [6, 8]) {
          box(g, "#61744e", xx, 0.45, zz, 0.7, 0.12, 0.65);
          box(g, "#61744e", xx, 0.22, zz, 0.1, 0.44, 0.1);
        }
      }
    } else {
      for (let i = 0; i < 3; i++) {
        box(g, "#ab8957", -3 + i * 1.25, 0.55, 5, 1.1, 1, 0.8);
        for (let j = 0; j < 4; j++)
          part(
            g,
            "sphere",
            i % 2 ? "#dbb54d" : "#8fa650",
            [-3.3 + i * 1.25 + j * 0.2, 1.1, 5],
            [0.18, 0.18, 0.18],
          );
      }
    }
  }
  // Shops face the main street, with generous sidewalks.
  for (let i = 0; i < 6; i++) {
    shop(-15, 20 - i * 15, i, Math.PI / 2);
    shop(15, 12 - i * 16, (i + 2) % 6, -Math.PI / 2);
  }
  for (const [x, z] of [
    [-37, 52],
    [-52, 52],
    [-69, 53],
    [35, 58],
    [53, 58],
    [72, 57],
    [-39, -20],
    [-40, -43],
    [38, -17],
    [40, -47],
    [-70, -47],
    [-64, -15],
    [-91, 65],
  ])
    house(
      x,
      z,
      9 + random() * 3,
      8,
      ["#e7d4a7", "#e1b6a0", "#b9c9a3", "#d9d4b6"][Math.floor(random() * 4)],
      0,
      random() > 0.7,
    );
  // Sidewalks and shop-front details.
  for (const x of [-8.8, 8.8])
    box(root, "#ddd3b1", x, 0.27, -24, 3.3, 0.22, 115);
  function pole(x: number, z: number) {
    if (clearRoadFootprint(x, z, 0.4, 0.4)) return;
    const g = chunk(x, z);
    part(g, "cylinder", "#7d8174", [x, 5, z], [0.15, 10, 0.15]);
    box(g, "#6b7164", x, 9.2, z, 2.6, 0.15, 0.17);
    for (const xx of [-1, 0, 1])
      part(g, "cylinder", "#ddd8bc", [x + xx, 9.4, z], [0.09, 0.3, 0.09]);
  }
  for (const x of [-10.9, 10.9]) {
    for (let z = -70; z <= 70; z += 28) {
      pole(x, z);
      if (z < 70) {
        for (const dx of [-1, 1]) {
          const pts = [
            new T.Vector3(x + dx, 9.4, z),
            new T.Vector3(x + dx, 8.7, z + 14),
            new T.Vector3(x + dx, 9.4, z + 28),
          ];
          const curve = new T.CatmullRomCurve3(pts);
          const line = new T.Line(
            new T.BufferGeometry().setFromPoints(curve.getPoints(16)),
            new T.LineBasicMaterial({ color: "#646e59" }),
          );
          chunk(x, z).add(line);
        }
      }
    }
  }
  function lamp(x: number, z: number) {
    if (clearRoadFootprint(x, z, 0.4, 0.4)) return;
    const g = chunk(x, z);
    part(g, "cylinder", "#435e50", [x, 3.4, z], [0.08, 6.8, 0.08]);
    box(g, "#435e50", x + 0.55, 6.75, z, 1.2, 0.1, 0.1);
    box(g, "#f6e3a2", x + 1, 6.65, z, 0.65, 0.15, 0.35);
  }
  for (let z = -65; z < 270; z += 35) {
    lamp(-8, z);
    if (z > -60) palm(11 + random() * 5, z + 7, 0.85 + random() * 0.35);
  }
  function busStop(x: number, z: number, angle = 0) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.rotation.y = angle;
    chunk(x, z).add(g);
    for (const xx of [-4, 4]) box(g, "#355b50", xx, 1.8, 0, 0.15, 3.6, 0.15);
    box(g, "#d2c3a0", 0, 3.6, 0, 9, 0.23, 4);
    box(g, "#e3d8b3", 0, 1.6, -1.7, 8.6, 3.2, 0.13);
    box(g, "#866d46", 0, 0.8, -0.3, 6, 0.2, 0.8);
    for (const xx of [-2, 2]) box(g, "#445c4a", xx, 0.4, -0.3, 0.15, 0.8, 0.65);
    solid(
      x - Math.sin(angle) * 1.7,
      z - Math.cos(angle) * 1.7,
      Math.abs(Math.cos(angle)) * 8.6 + Math.abs(Math.sin(angle)) * 0.2,
      Math.abs(Math.sin(angle)) * 8.6 + Math.abs(Math.cos(angle)) * 0.2,
      3.4,
    );
  }

  sign(chunk(0, 0), -8, 4.4, 27, "ചായപ്പുറം", "CHAYAPURAM", 5.2, "#315b48");
  box(chunk(0, 0), "#dad6bd", -8, 2.1, 27, 0.16, 4.2, 0.16);
  function bridge(x: number) {
    box(root, "#c7c6b0", x, 0.2, -92, 15, 0.3, 33);
    for (const xx of [x - 7, x + 7]) {
      box(root, "#eadfbd", xx, 1.6, -92, 0.22, 0.22, 33);
      box(root, "#e3d2af", xx, 0.9, -92, 0.17, 0.16, 33);
      for (let z = -108; z <= -76; z += 4)
        box(root, "#e8dcc0", xx, 0.9, z, 0.5, 1.8, 0.5);
      solid(xx, -92, 0.5, 33, 1.8);
    }
    for (let z = -105; z < -75; z += 8)
      box(root, "#f5e8b8", x, 0.38, z, 0.17, 0.03, 4);
  }
  bridge(-184);
  bridge(0);
  bridge(150);
  // Backwaters, jetty and a little kettuvallam-inspired houseboat.
  const boat = new T.Group();
  boat.position.set(52, 0.15, -92);
  root.add(boat);
  part(boat, "sphere", "#765237", [0, 0.5, 0], [10, 0.9, 2.9]);
  box(boat, "#c6a66b", 0, 1.8, 0, 13, 2.2, 4);
  part(
    boat,
    "cylinder",
    "#b9995d",
    [0, 3, 0],
    [2.7, 13, 2.7],
    [0, 0, Math.PI / 2],
  );
  for (let x = -5; x <= 5; x += 2)
    box(boat, "#425d56", x, 2, 2.05, 1.3, 1.3, 0.05);
  box(root, "#917f57", 34, 0.4, -72, 16, 0.5, 7);
  sign(chunk(34, -72), 34, 3, -70, "നീലക്കായൽ", "NEELA BACKWATERS", 7);
  // Village and residential houses.
  for (let i = 0; i < 9; i++) {
    const z = -128 - i * 13;
    house(
      133,
      z,
      8 + random() * 3,
      7,
      ["#ead4a5", "#edc0a7", "#c8d2a9"][i % 3],
      Math.PI / 2,
      i % 4 === 0,
    );
    house(
      169,
      z + 3,
      8,
      7,
      ["#bfd0b1", "#d8cab4", "#e5ca8e"][i % 3],
      -Math.PI / 2,
    );
    palm(124, z + 5, 0.8 + random() * 0.3);
    banana(179, z + 5);
  }
  shop(126, -147, 0, Math.PI / 2);
  shop(174, -148, 1, -Math.PI / 2);
  sign(chunk(150, -122), 157, 3.5, -119, "വെള്ളാരം", "VELLARAM VILLAGE", 6);
  box(chunk(150, -122), "#7f805e", 157, 1.5, -119, 0.15, 3, 0.15);
  // Paddy fields, bunds and rural cottages.
  for (let ix = 0; ix < 3; ix++)
    for (let iz = 0; iz < 4; iz++) {
      const x = 72 + ix * 24,
        z = 72 + iz * 23;
      box(
        chunk(x, z),
        (ix + iz) % 2 ? "#9bb44f" : "#85a24b",
        x,
        0.06,
        z,
        22,
        0.13,
        21,
      );
      for (let k = 0; k < 9; k++) {
        box(chunk(x, z), "#a7be58", x - 10 + k * 2.5, 0.14, z, 0.14, 0.2, 20);
        for (let j = 0; j < 11; j++)
          part(
            chunk(x, z),
            "cone",
            (j + k) % 2 ? "#a2ba53" : "#bed071",
            [x - 10 + k * 2.5, 0.3, z - 9 + j * 1.8],
            [0.24, 0.6, 0.24],
          );
      }
    }
  for (const x of [62, 190])
    for (const z of [58, 148]) {
      house(x, z, 8, 7, "#dfc89e");
      palm(x + 7, z - 3);
      banana(x - 6, z);
    }
  // Temple silhouette, school, mosque, church and football ground.
  const temple = new T.Group();
  temple.position.set(-66, 0, -65);
  chunk(-66, -65).add(temple);
  box(temple, "#c6b794", 0, 0.4, 0, 19, 0.8, 14);
  box(temple, "#e6d1a5", 0, 2.6, 0, 12, 4.6, 9);
  roof(temple, 17, 13, 5.3, "#985b40");
  box(temple, "#dfba7e", 0, 6.4, 0, 6, 2.5, 5);
  roof(temple, 10, 8, 8.1, "#985b40");
  part(temple, "sphere", "#d9b467", [0, 9.7, 0], [0.35, 0.65, 0.35]);
  solid(-66, -65, 18, 14, 10);
  house(70, -39, 21, 12, "#ecd19c");
  sign(
    chunk(70, -39),
    70,
    3.3,
    -32.9,
    "വിദ്യാലയം",
    "PALM GROVE SCHOOL",
    13,
    "#467567",
  );
  const mosque = chunk(101, -178);
  box(mosque, "#ede9cb", 101, 3, -178, 14, 6, 12);
  part(mosque, "sphere", "#6ea594", [101, 6.1, -178], [5, 4, 5]);
  part(mosque, "cylinder", "#e9e2bf", [110, 5, -178], [1, 10, 1]);
  part(mosque, "cone", "#65998a", [110, 11, -178], [1.5, 2, 1.5]);
  solid(101, -178, 22, 14, 11);
  const church = chunk(-108, 88);
  box(church, "#e9daba", -108, 3, 88, 11, 6, 17);
  part(
    church,
    "roof",
    "#9a6956",
    [-108, 7, 88],
    [8, 3, 12],
    [0, Math.PI / 4, 0],
  );
  box(church, "#dfd2ae", -108, 6, 98, 3, 12, 3);
  box(church, "#695d43", -108, 13, 98, 0.2, 2, 0.2);
  box(church, "#695d43", -108, 13.3, 98, 1, 0.2, 0.2);
  solid(-108, 88, 12, 23, 14);
  box(root, "#7eaa67", -61, 0.015, 91, 46, 0.12, 33);
  for (const x of [-83, -39]) box(root, "#e9e8c9", x, 0.09, 91, 0.16, 0.03, 31);
  for (const z of [76, 106]) box(root, "#e9e8c9", -61, 0.09, z, 44, 0.03, 0.16);
  box(root, "#e9e8c9", -61, 0.09, 91, 0.15, 0.03, 30);
  for (const x of [-82, -40]) {
    for (const z of [87, 95]) box(root, "#ece8d0", x, 1.4, z, 0.13, 2.8, 0.13);
    box(root, "#ece8d0", x, 2.8, 91, 0.13, 0.13, 8);
  }
  // Beach village, fishing boats, umbrellas, benches and a lifeguard hut.
  for (let i = 0; i < 10; i++) {
    palm(-207 + random() * 12, -150 + i * 38, 1 + random() * 0.4);
    if (i % 2 === 0) house(-169, -120 + i * 36, 8, 7, "#e4d2ac", Math.PI / 2);
    const x = -227,
      z = -103 + i * 28;
    part(
      chunk(x, z),
      "sphere",
      i % 2 ? "#b76a4e" : "#3f8784",
      [x, 0.7, z],
      [1.8, 0.7, 4.3],
      [0, 0.3, 0],
    );
  }
  for (let i = 0; i < 4; i++) {
    const g = chunk(-215, 10 + i * 15);
    part(g, "cylinder", "#a88754", [-215, 1.5, 10 + i * 15], [0.07, 3, 0.07]);
    part(
      g,
      "cone",
      i % 2 ? "#d88663" : "#e5c981",
      [-215, 3, 10 + i * 15],
      [2.8, 0.9, 2.8],
    );
    box(g, "#f1dfb8", -218, 0.65, 10 + i * 15, 1.2, 0.14, 2.4);
  }
  sign(
    chunk(-184, 34),
    -178,
    3.4,
    42,
    "തെങ്ങിൻ തീരം",
    "THENGU COAST",
    7,
    "#3f7269",
  );
  const tower = chunk(184, -255);
  for (const x of [181, 187])
    for (const z of [-258, -252]) box(tower, "#8b9980", x, 5, z, 0.4, 10, 0.4);
  part(tower, "cylinder", "#d6d4b3", [184, 11, -255], [4, 4, 4]);
  part(tower, "cone", "#859e83", [184, 13.6, -255], [4.3, 1.5, 4.3]);
  solid(184, -255, 8, 8, 15);
  sign(chunk(150, -259), 157, 3.5, -259, "മലർ മല", "MALAR HILL • VIEWPOINT", 7);
  // Petrol pump and market street.
  house(44, 108, 9, 7, "#d7c49e");
  box(chunk(44, 97), "#e7d8af", 44, 4.8, 97, 16, 0.5, 10);
  for (const x of [38, 50]) {
    box(chunk(x, 97), "#576f5c", x, 2.3, 97, 0.24, 4.6, 0.24);
    box(chunk(x, 97), "#cb7658", x, 1.2, 97, 1.2, 2.3, 0.8);
    box(chunk(x, 97), "#dde1ce", x, 1.75, 97.43, 0.9, 0.6, 0.04);
  }
  sign(chunk(44, 97), 44, 4.9, 102.1, "ഇന്ധനം", "PALM FUEL", 12, "#a25e44");
  for (let i = 0; i < 5; i++) {
    const x = -41 - i * 13,
      z = 20;
    const g = chunk(x, z);
    for (const dx of [-2, 2])
      box(g, "#8b7951", x + dx, 1.6, z, 0.12, 3.2, 0.12);
    box(g, i % 2 ? "#bc7558" : "#dfb564", x, 3.2, z, 5, 0.2, 4);
    box(g, "#a68b5d", x, 1, z, 4.8, 0.3, 2);
    for (let j = 0; j < 6; j++)
      part(
        g,
        "sphere",
        j % 2 ? "#d3ab46" : "#6f984f",
        [x - 1.8 + j * 0.7, 1.4, z],
        [0.3, 0.3, 0.3],
      );
    solid(x, z, 4.8, 2, 1.4);
  }
  function vehicle(
    type: "auto" | "car" | "bus" | "bike" | "truck",
    color: string,
  ) {
    const g = new T.Group();
    const long =
      type === "bus" ? 8 : type === "truck" ? 5 : type === "bike" ? 1.8 : 3.3;
    const wide = type === "bus" ? 2.5 : type === "bike" ? 0.65 : 1.7;
    if (type === "bike") {
      box(g, color, 0, 0.85, 0, 0.6, 0.5, 1);
      box(g, "#484e44", 0, 1.16, 0.25, 0.6, 0.16, 0.9);
      box(g, "#55594b", 0, 1.3, -0.6, 1, 0.12, 0.12);
    } else {
      box(g, color, 0, 1, 0, wide, 1.2, long);
      box(
        g,
        type === "auto" ? "#e2b950" : color,
        0,
        1.9,
        0.2,
        wide * 0.94,
        1.3,
        long * 0.66,
      );
      box(g, "#a2c8bd", 0, 2, -long * 0.33 - 0.015, wide * 0.82, 0.74, 0.07);
      for (const side of [-1, 1])
        for (let j = 0; j < (type === "bus" ? 5 : 1); j++)
          box(
            g,
            "#a5cbc2",
            side * (wide * 0.48 + 0.01),
            2,
            -long * 0.15 + j * 1.05,
            0.04,
            0.7,
            type === "bus" ? 0.8 : long * 0.43,
          );
      box(
        g,
        type === "auto" ? "#303d36" : "#e1dcbb",
        0,
        2.65,
        0.2,
        wide + 0.08,
        0.16,
        long * 0.7,
      );
      box(g, "#ede4ba", 0, 0.7, -long * 0.51, wide * 0.8, 0.18, 0.1);
      for (const side of [-1, 1])
        box(
          g,
          "#f7e6a9",
          side * wide * 0.34,
          1.18,
          -long * 0.51,
          0.3,
          0.24,
          0.07,
        );
    }
    for (const side of [-1, 1])
      for (const end of [-1, 1])
        part(
          g,
          "cylinder",
          "#343e39",
          [side * wide * 0.49, 0.48, end * long * 0.32],
          [0.4, 0.22, 0.4],
          [0, 0, Math.PI / 2],
        );
    return g;
  }
  function parked(
    type: "auto" | "car" | "bus" | "bike" | "truck",
    x: number,
    z: number,
    color: string,
    angle = 0,
  ) {
    const g = vehicle(type, color);
    g.position.set(x, 0.24, z);
    g.rotation.y = angle;
    chunk(x, z).add(g);
    const w = type === "bus" ? 2.7 : type === "bike" ? 1 : 2,
      d = type === "bus" ? 8 : type === "bike" ? 2 : 4;
    solid(
      x,
      z,
      Math.abs(Math.cos(angle)) * w + Math.abs(Math.sin(angle)) * d,
      Math.abs(Math.cos(angle)) * d + Math.abs(Math.sin(angle)) * w,
      2.8,
    );
    return g;
  }
  parked("auto", -6.3, 16, "#344c3f", 0.1);
  parked("auto", -6.3, 23, "#384839", 0.05);
  parked("bike", 8.1, 4, "#a3513f", -0.5);
  parked("bike", 8.5, -14, "#a1aaa0", -0.8);
  parked("car", -7, -54, "#e8d8ad");

  parked("truck", -26, -62, "#83a4a0");
  parked("bike", 126, -133, "#476b60");
  parked("car", 163, -178, "#dbc59f");
  for (const [type, x, z, color, speed] of [
    ["auto", 3.2, 78, "#405347", 5],
    ["auto", -3.3, -193, "#b96950", 6],
    ["car", 153, 162, "#e7d6ae", 7],
    ["bike", 147, 2, "#bd7754", 6],
  ] as const) {
    const g = vehicle(type, color);
    g.position.set(x, 0.25, z);
    root.add(g);
    traffic.push({ group: g, axis: "z", lane: x, min: -263, max: 265, speed });
  }
  // People wander within clear shop promenades and bus-stop areas.
  for (let i = 0; i < 28; i++) {
    const x = i < 16 ? (i % 2 ? -9 : 9) : i < 22 ? -43 - (i - 16) * 11 : 139;
    const z =
      i < 16 ? 25 - Math.floor(i / 2) * 12 : i < 22 ? 25 : -130 - (i - 22) * 20;
    const p = person(
      ["#b36b50", "#e6c477", "#699796", "#ede3c2", "#9eaa73"][i % 5],
      ["#9b6549", "#bc8460", "#80543f"][i % 3],
    );
    p.group.position.set(x, 0.35, z);
    chunk(x, z).add(p.group);
    npcs.push({ person: p, x, z, phase: random() * 6.28 });
  }
  function animal(x: number, z: number, type: "cow" | "dog" | "chicken") {
    const g = new T.Group();
    g.position.set(x, 0, z);
    chunk(x, z).add(g);
    const s = type === "cow" ? 1 : type === "dog" ? 0.5 : 0.25;
    g.scale.setScalar(s);
    box(g, type === "cow" ? "#e4dac0" : "#a28155", 0, 1.1, 0, 0.85, 0.9, 1.8);
    box(g, "#816e4e", 0, 1.4, -1, 0.6, 0.65, 0.65);
    for (const xx of [-0.3, 0.3])
      for (const zz of [-0.6, 0.6])
        box(g, "#6e644a", xx, 0.4, zz, 0.13, 0.8, 0.13);
    if (type === "cow")
      for (const xx of [-0.3, 0.3])
        part(g, "cone", "#f1e2b8", [xx, 1.95, -1], [0.1, 0.4, 0.1]);
    g.userData.origin = new T.Vector3(x, 0, z);
    animals.push(g);
  }
  animal(67, 147, "cow");
  animal(85, 150, "cow");
  animal(-35, 40, "dog");
  for (let i = 0; i < 5; i++) animal(185 + i, -155 + random() * 5, "chicken");
  // Dense but reproducible vegetation avoids all streets and occupied buildings.
  for (let i = 0; i < 620; i++) {
    const x = -195 + random() * 430,
      z = -273 + random() * 540;
    const onRoad =
      Math.abs(x) < 12 ||
      Math.abs(x - 150) < 11 ||
      Math.abs(z - 34) < 12 ||
      (Math.abs(z + 146) < 9 && x > 0 && x < 156) ||
      (Math.abs(z - 164) < 8 && x > 0 && x < 155) ||
      (Math.abs(z - 124) < 8 && x < 0) ||
      Math.abs(x + 184) < 9;
    const onRiver = Math.abs(z + 92) < 20;
    const onField = x > 56 && x < 162 && z > 55 && z < 155;
    const football = x > -88 && x < -34 && z > 70 && z < 111;
    const occupied = colliders.some(
      (c) => Math.abs(x - c.x) < c.w / 2 + 3 && Math.abs(z - c.z) < c.d / 2 + 3,
    );
    if (onRoad || onRiver || onField || occupied || football) continue;
    if (i % 4 === 0) tree(x, z, 0.7 + random() * 0.6);
    else if (i % 4 === 1) banana(x, z);
    else palm(x, z, 0.7 + random() * 0.5);
  }
  for (let i = 0; i < 80; i++) {
    const x = -185 + random() * 410,
      z = -265 + random() * 520;
    if (
      Math.abs(x) < 17 ||
      Math.abs(x - 150) < 15 ||
      Math.abs(z - 34) < 15 ||
      Math.abs(z + 92) < 20
    )
      continue;
    part(
      chunk(x, z),
      "sphere",
      "#879766",
      [x, 0.4, z],
      [1 + random(), 0.65, 1],
    );
  }
  // Street furnishings: bins, compound walls, a well, and the town's banyan.
  for (const [x, z] of [
    [-28, 54],
    [-57, 54],
    [41, 62],
    [72, 62],
    [128, -184],
    [174, -211],
  ]) {
    const g = chunk(x, z);
    for (const dx of [-6, 6]) {
      box(g, "#c8bb98", x + dx, 0.65, z, 0.35, 1.3, 12);
      solid(x + dx, z, 0.35, 12, 1.3);
    }
    box(g, "#c8bb98", x, 0.65, z - 6, 12, 1.3, 0.35);
    solid(x, z - 6, 12, 0.35, 1.3);
  }
  for (const z of [-50, -20, 10, 55]) {
    const g = chunk(-9, z);
    part(g, "cylinder", "#526b50", [-9, 0.6, z], [0.36, 1.2, 0.36]);
    part(g, "cylinder", "#b8b99a", [-9, 1.23, z], [0.4, 0.12, 0.4]);
  }
  const well = chunk(-39, 2);
  part(well, "cylinder", "#acaa85", [-39, 0.5, 2], [1.5, 1, 1.5]);
  part(well, "cylinder", "#435b4d", [-39, 1.02, 2], [1.17, 0.02, 1.17]);
  for (const dx of [-1.6, 1.6])
    box(well, "#867855", -39 + dx, 2, 2, 0.17, 4, 0.17);
  box(well, "#867855", -39, 4, 2, 3.7, 0.17, 0.17);
  solid(-39, 2, 3.2, 3.2, 1.2);
  tree(-44, -107, 2.2);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    part(
      chunk(-44, -107),
      "cylinder",
      "#867b56",
      [-44 + Math.sin(a) * 3.6, 2.8, -107 + Math.cos(a) * 3.6],
      [0.08, 5.6, 0.08],
    );
  }
  for (const z of [-36, 4, 69]) {
    const g = chunk(-27, z);
    box(g, "#806d46", -27, 0.7, z, 3, 0.15, 0.8);
    box(g, "#806d46", -27, 1.25, z - 0.35, 3, 0.8, 0.13);
    for (const x of [-28, -26]) box(g, "#53654b", x, 0.35, z, 0.12, 0.7, 0.7);
  }
  // Hand-placed discoverables follow roads and pull explorers toward landmarks.
  const coins: [[number, number], ...[number, number][]] = [
    [0, 23],
    [0, 9],
    [0, -8],
    [0, -35],
    [0, -62],
    [0, -91],
    [0, -119],
    [25, -146],
    [63, -146],
    [102, -146],
    [150, -140],
    [150, -180],
    [150, -222],
    [150, -261],
    [-28, 34],
    [-62, 34],
    [-101, 34],
    [-147, 34],
    [-184, 34],
    [-220, 34],
    [30, 34],
    [69, 34],
    [110, 34],
    [150, 34],
    [150, 70],
    [150, 107],
    [150, 150],
    [115, 164],
    [64, 164],
    [0, 164],
    [-61, 91],
    [34, -68],
    [-67, -54],
    [73, -27],
    [-184, 110],
    [0, 215],
  ];
  coins.forEach(([x, z], i) => {
    const g = new T.Group();
    g.position.set(x, 1.65, z);
    g.userData.id = i;
    const m = part(
      g,
      "cylinder",
      "#f1c765",
      [0, 0, 0],
      [0.42, 0.13, 0.42],
      [Math.PI / 2, 0, 0],
    );
    m.material = new T.MeshStandardMaterial({
      color: "#ffcc62",
      emissive: "#b88622",
      emissiveIntensity: 0.24,
      roughness: 0.35,
      metalness: 0.4,
    });
    part(g, "sphere", "#fff3bd", [0, 0, 0.08], [0.16, 0.16, 0.05]);
    root.add(g);
    collectibles.push(g);
  });
  // Expand the established world with terrain-following roads and modular destinations.
  for (const stop of ROAD_STOPS) {
    busStop(stop.shelter.x, stop.shelter.z, stop.shelter.yaw);
    box(
      chunk(stop.sign.x, stop.sign.z),
      "#426b59",
      stop.sign.x,
      1.3,
      stop.sign.z,
      0.12,
      2.6,
      0.12,
    );
  }
  for (let i = 0; i < 430; i++) {
    const x = 245 + random() * 450,
      z = -690 + random() * 670;
    if (
      nearRoad(x, z, 19) ||
      VEHICLE_SPAWNS.some(
        (v) =>
          Math.hypot(x - Number(v.x), z - Number(v.z)) <
          (v.kind === "helicopter" ? 30 : 9),
      ) ||
      (Math.abs(x - PARK.x) < 105 && Math.abs(z - PARK.z) < 110)
    )
      continue;
    if (i % 6 === 0)
      house(x, z, 8, 7, ["#d6c89f", "#b6c4a3", "#dfbaa0"][i % 3]);
    else if (i % 3 === 0) palm(x, z, 1);
    else tree(x, z, 0.7 + random());
  }
  sign(
    chunk(338, -400),
    338,
    4,
    -411,
    "മലർ മല",
    "MALAR VIEWPOINT • 360° KERALA",
    13,
  );
  for (let i = 0; i < 8; i++)
    box(chunk(350, -413), "#e7d7b0", 340 + i * 2, 0.8, -418, 0.2, 1.6, 0.2);
  box(chunk(347, -418), "#e7d7b0", 347, 1.4, -418, 16, 0.15, 0.15);
  for (const pad of HELIPADS) {
    const { x, z } = pad;
    box(chunk(x, z), "#84937a", x, 0.12, z, 24, 0.18, 24);
    for (const xx of [x - 3, x + 3])
      box(chunk(x, z), "#f1e8cc", xx, 0.22, z, 0.6, 0.03, 8);
    box(chunk(x, z), "#f1e8cc", x, 0.22, z, 6, 0.03, 0.6);
    for (const dx of [-11, 11])
      for (const dz of [-11, 11])
        box(chunk(x, z), "#eac782", x + dx, 0.32, z + dz, 0.4, 0.4, 0.4);
  }
  buildParks({ root, chunk, box, tree, palm, house, sign, colliders, waters });
  for (const v of VEHICLE_SPAWNS.filter((v) => v.kind !== "helicopter")) {
    const x = Number(v.x),
      z = Number(v.z);
    root.add(
      roadRibbon(
        samplePath([
          [x, z - 4],
          [x, z + 4],
        ]),
        v.kind === "car" ? 5 : 3,
        "#c2bda1",
        0.14,
      ),
    );
  }
  // Enforce the same clearance corridor on visible assets and solid volumes.
  const bounds = new T.Box3(),
    size = new T.Vector3(),
    center = new T.Vector3();
  for (const ch of chunks)
    for (const child of [...ch.children]) {
      if (
        npcs.some(
          (n) =>
            isDescendant(child, n.person.group) || child === n.person.group,
        ) ||
        animals.includes(child as T.Group)
      )
        continue;
      child.updateMatrixWorld(true);
      bounds.setFromObject(child);
      bounds.getSize(size);
      bounds.getCenter(center);
      if (
        size.y > 0.4 &&
        bounds.min.y < 4 &&
        (clearRoadFootprint(center.x, center.z, size.x, size.z) ||
          inFootballArea(center.x, center.z, Math.max(size.x, size.z) / 2 + 7))
      )
        child.removeFromParent();
    }
  for (let i = colliders.length - 1; i >= 0; i--) {
    const c = colliders[i];
    if (
      !c.water &&
      (clearRoadFootprint(c.x, c.z, c.w, c.d) ||
        inFootballArea(c.x, c.z, Math.max(c.w, c.d) / 2 + 7))
    )
      colliders.splice(i, 1);
  }
  buildFootballTurf(root, colliders);
  // Lane-normal placement: every lamp and guardrail sits beyond the shoulder.
  for (let s = 0; s < MAIN_ROAD.length; s += 32) {
    if (ROAD_STOPS.some((stop) => loopDelta(s, stop.s, MAIN_ROAD.length) < 40))
      continue;
    const f = roadFrame(MAIN_ROAD, s, MAIN_ROAD.width / 2 + 3.5),
      g = new T.Group();
    if (insideOtherRoad(f.x, f.z, MAIN_ROAD.id, 1)) continue;
    g.position.set(f.x, heightAt(f.x, f.z), f.z);
    g.rotation.y = f.yaw;
    root.add(g);
    box(g, "#526c57", 0, 3, 0, 0.18, 6, 0.18);
    box(g, "#526c57", -0.7, 5.85, 0, 1.5, 0.12, 0.15);
    box(g, "#f5dfa3", -1.4, 5.7, 0, 0.65, 0.15, 0.5);
    colliders.push({ x: f.x, z: f.z, w: 0.3, d: 0.3, h: 6 });
  }
  for (let s = 4; s < MAIN_ROAD.length - 8; s += 8) {
    const center = roadFrame(MAIN_ROAD, s);
    if (
      center.y < 8 ||
      ROAD_STOPS.some((stop) => loopDelta(s, stop.s, MAIN_ROAD.length) < 42)
    )
      continue;
    for (const side of [-1, 1]) {
      const offset = side * (MAIN_ROAD.width / 2 + 2.7),
        a = roadFrame(MAIN_ROAD, s, offset),
        b = roadFrame(MAIN_ROAD, s + 8, offset),
        g = new T.Group();
      if ([a, b].some((f) => insideOtherRoad(f.x, f.z, MAIN_ROAD.id, 1)))
        continue;
      g.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.8, (a.z + b.z) / 2);
      g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      g.rotation.x = -Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z));
      root.add(g);
      box(g, "#c4c3a5", 0, 0, 0, 0.16, 0.24, Math.hypot(b.x - a.x, b.z - a.z));
      for (const zz of [-3, 3])
        box(g, "#647465", 0, -0.35, zz, 0.12, 0.9, 0.12);
    }
  }
  // Lift whole assets, never individual parts, so houses and trees retain their shape.
  for (const ch of chunks) {
    for (const child of ch.children)
      child.position.y += heightAt(child.position.x, child.position.z);
  }
  for (const c of colliders) {
    c.base = heightAt(c.x, c.z);
    c.h += c.base;
  }
  // Batch static primitive geometry per spatial chunk. Signs remain separate textured planes.
  for (const ch of chunks) {
    ch.updateMatrixWorld(true);
    const batches = new Map<
      string,
      {
        geometry: T.BufferGeometry;
        material: T.Material;
        matrices: T.Matrix4[];
        colors: T.Color[];
      }
    >();
    const remove: T.Mesh[] = [];
    ch.traverse((o) => {
      if (
        !(o instanceof T.Mesh) ||
        !Object.values(geometries).includes(o.geometry) ||
        npcs.some((n) => isDescendant(o, n.person.group)) ||
        animals.some((a) => isDescendant(o, a))
      )
        return;
      const key = o.geometry.uuid;
      if (!batches.has(key))
        batches.set(key, {
          geometry: o.geometry,
          material: mat("#ffffff"),
          matrices: [],
          colors: [],
        });
      batches.get(key)!.matrices.push(o.matrixWorld.clone());
      batches
        .get(key)!
        .colors.push((o.material as T.MeshStandardMaterial).color);
      remove.push(o);
    });
    remove.forEach((m) => m.removeFromParent());
    for (const b of batches.values()) {
      const mesh = new T.InstancedMesh(
        b.geometry,
        b.material,
        b.matrices.length,
      );
      b.matrices.forEach((m, i) => {
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, b.colors[i]);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      ch.add(mesh);
    }
  }
  return {
    root,
    colliders,
    waters,
    npcs,
    traffic,
    collectibles,
    chunks,
    animals,
  };
}
function isDescendant(o: T.Object3D, parent: T.Object3D): boolean {
  for (let p: T.Object3D | null = o; p; p = p.parent)
    if (p === parent) return true;
  return false;
}
