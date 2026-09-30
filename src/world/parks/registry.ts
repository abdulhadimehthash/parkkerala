import * as T from "three";
import { PARK, PARK_COLLIDERS } from "../../../shared/world.js";
import { roadRibbon, samplePath } from "../terrain";
import type { Collider } from "../../world";
export type ParkBuilders = {
  root: T.Group;
  chunk: (x: number, z: number) => T.Group;
  box: (
    p: T.Object3D,
    c: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) => T.Mesh;
  tree: (x: number, z: number, s?: number) => void;
  palm: (x: number, z: number, s?: number) => void;
  house: (
    x: number,
    z: number,
    w?: number,
    d?: number,
    c?: string,
    a?: number,
    modern?: boolean,
  ) => void;
  sign: (
    p: T.Object3D,
    x: number,
    y: number,
    z: number,
    t: string,
    s: string,
    w?: number,
    bg?: string,
    fg?: string,
    a?: number,
  ) => T.Mesh;
  colliders: Collider[];
  waters: T.Mesh[];
};
export type ParkDefinition = {
  id: string;
  name: string;
  build: (b: ParkBuilders) => void;
};
function buildSarovaram(b: ParkBuilders) {
  const { box, chunk, root, tree, palm, house, sign } = b;
  // A plateau park with a lake loop, promenades and a drivable entrance.
  for (const points of [
    [
      [565, -259],
      [535, -259],
      [514, -259],
      [505, -215],
      [405, -215],
      [395, -310],
      [504, -324],
      [514, -259],
    ],
    [
      [395, -310],
      [455, -339],
      [504, -324],
    ],
    [
      [405, -215],
      [415, -245],
      [495, -245],
      [505, -215],
    ],
  ])
    root.add(
      roadRibbon(
        samplePath(points),
        points[0][0] === 565 ? 7 : 4,
        "#d5c8a0",
        0.2,
      ),
    );
  for (const x of [535])
    for (const z of [-247, -271]) box(chunk(x, z), "#e1c592", x, 4, z, 3, 8, 3);
  box(chunk(535, -259), "#355e49", 535, 8, -259, 3, 1.8, 29);
  sign(
    chunk(535, -259),
    537,
    8,
    -259,
    PARK.local,
    "SAROVARAM PARK • WELCOME",
    22,
    "#315f4b",
    "#f4e6b7",
    Math.PI / 2,
  );
  // Gate-to-parking access is open and wide enough for buses and cars.
  root.add(
    roadRibbon(
      samplePath([
        [565, -233],
        [596, -233],
        [596, -286],
        [565, -286],
      ]),
      12,
      "#899486",
      0.22,
    ),
  );
  for (let z = -280; z < -233; z += 7)
    box(chunk(588, z), "#eee4c4", 588, 0.26, z, 8, 0.025, 0.15);
  const lake = new T.Mesh(
    new T.PlaneGeometry(72, 49, 24, 16),
    new T.MeshStandardMaterial({
      color: "#63bdb9",
      roughness: 0.24,
      metalness: 0.15,
    }),
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(458, 40.08, -280);
  root.add(lake);
  b.waters.push(lake);
  house(403, -215, 15, 11, "#e6c99b");
  sign(chunk(403, -215), 403, 4.5, -208, "ചായക്കട", "SAROVARAM TEA GARDEN", 12);
  house(480, -208, 12, 10, "#becda7");
  sign(chunk(480, -208), 480, 4.5, -202, "സ്വാഗതം", "PARK INFORMATION", 10);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2,
      x = 459 + Math.cos(a) * 77,
      z = -268 + Math.sin(a) * 69;
    if (x > 525 && Math.abs(z + 259) < 20) continue;
    i % 3 ? tree(x, z, 0.8 + (i % 4) * 0.15) : palm(x, z, 1);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI * 2) / 12,
      x = 458 + Math.cos(a) * 45,
      z = -280 + Math.sin(a) * 32,
      g = chunk(x, z);
    box(g, "#9d8157", x, 0.75, z, 3, 0.2, 0.8);
    box(g, "#8a7754", x, 1.3, z + 0.35, 3, 0.8, 0.12);
    for (const dx of [-1, 1])
      box(g, "#506c50", x + dx, 0.4, z, 0.12, 0.8, 0.65);
    box(g, "#3b5d4a", x + 2, 2.4, z, 0.1, 4.8, 0.1);
    box(g, "#f3dfac", x + 2, 4.8, z, 0.7, 0.25, 0.7);
  }
  // Gathering lawn and a small open pavilion.
  for (const x of [422, 438])
    for (const z of [-345, -333])
      box(chunk(x, z), "#d6c298", x, 2, z, 0.3, 4, 0.3);
  box(chunk(430, -339), "#b57958", 430, 4.2, -339, 20, 0.4, 16);
  sign(chunk(430, -339), 430, 3.1, -330, "ഒത്തുചേരാം", "LAKESIDE PAVILION", 12);
  b.colliders.push(
    ...PARK_COLLIDERS.filter((c) => c.water || c.w === 3).map((c) => ({
      ...c,
    })),
  );
}
export const parks: ParkDefinition[] = [
  { id: PARK.id, name: PARK.name, build: buildSarovaram },
];
export function buildParks(builders: ParkBuilders) {
  parks.forEach((p) => p.build(builders));
}
