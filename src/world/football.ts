import * as T from "three";
import { FOOTBALL as F } from "../../shared/football-config.js";
import type { Collider } from "../world";
export function buildFootballTurf(root: T.Group, colliders: Collider[]) {
  const g = new T.Group();
  g.name = "Park Kerala Football Turf";
  root.add(g);
  const materials = new Map<string, T.MeshStandardMaterial>();
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    solid = false,
  ) => {
    let material = materials.get(color);
    if (!material) {
      material = new T.MeshStandardMaterial({ color, roughness: 1 });
      materials.set(color, material);
    }
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = h > 0.3;
    mesh.receiveShadow = true;
    g.add(mesh);
    if (solid) colliders.push({ x, z, w, d, h: y + h / 2 });
    return mesh;
  };
  for (let i = 0; i < 10; i++)
    box(
      F.x,
      -0.015,
      F.z - F.length / 2 + ((i + 0.5) * F.length) / 10,
      F.width,
      0.03,
      F.length / 10,
      i % 2 ? "#3e8751" : "#458f57",
    );
  const line = (x: number, z: number, w: number, d: number) =>
    box(x, 0.046, z, w, 0.015, d, "#f5f0d9");
  for (const x of [F.x - F.width / 2, F.x + F.width / 2])
    line(x, F.z, 0.16, F.length);
  for (const z of [F.z - F.length / 2, F.z + F.length / 2, F.z])
    line(F.x, z, F.width, 0.16);
  const ring = new T.Mesh(
    new T.RingGeometry(7.9, 8.06, 64),
    new T.MeshBasicMaterial({ color: "#f5f0d9", side: T.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(F.x, 0.05, F.z);
  g.add(ring);
  const dot = new T.Mesh(
    new T.CircleGeometry(0.22, 16),
    new T.MeshBasicMaterial({ color: "#f5f0d9" }),
  );
  dot.rotation.x = -Math.PI / 2;
  dot.position.set(F.x, 0.055, F.z);
  g.add(dot);
  const net: number[] = [];
  for (const side of [-1, 1]) {
    const z = F.z + (side * F.length) / 2;
    line(F.x, z - side * 10, 22, 0.16);
    for (const x of [F.x - 11, F.x + 11]) line(x, z - side * 5, 0.16, 10);
    line(F.x, z - side * 4, 14, 0.16);
    for (const x of [F.x - 7, F.x + 7]) line(x, z - side * 2, 0.16, 4);
    for (const x of [F.x - F.goalWidth / 2, F.x + F.goalWidth / 2])
      box(x, F.goalHeight / 2, z, 0.18, F.goalHeight, 0.18, "#f7f2df", true);
    box(F.x, F.goalHeight, z, F.goalWidth, 0.18, 0.18, "#f7f2df");
    for (let x = F.x - F.goalWidth / 2; x <= F.x + F.goalWidth / 2; x += 0.65)
      net.push(
        x,
        0,
        z + side * F.goalDepth,
        x,
        F.goalHeight,
        z + side * F.goalDepth,
        x,
        F.goalHeight,
        z + side * F.goalDepth,
        x,
        F.goalHeight,
        z,
      );
    for (let y = 0; y <= F.goalHeight; y += 0.5)
      net.push(
        F.x - F.goalWidth / 2,
        y,
        z + side * F.goalDepth,
        F.x + F.goalWidth / 2,
        y,
        z + side * F.goalDepth,
      );
    for (const x of [F.x - F.goalWidth / 2, F.x + F.goalWidth / 2])
      for (let y = 0; y <= F.goalHeight; y += 0.5)
        net.push(x, y, z, x, y, z + side * F.goalDepth);
  }
  const fence = (x1: number, z1: number, x2: number, z2: number) => {
    const length = Math.hypot(x2 - x1, z2 - z1),
      n = Math.ceil(length / 5);
    for (let i = 0; i <= n; i++) {
      const x = x1 + ((x2 - x1) * i) / n,
        z = z1 + ((z2 - z1) * i) / n;
      box(x, 1.5, z, 0.1, 3, 0.1, "#476b56");
    }
    for (let y = 0.25; y <= 3; y += 0.5) net.push(x1, y, z1, x2, y, z2);
    for (let i = 0; i < length; i += 1) {
      const x = x1 + ((x2 - x1) * i) / length,
        z = z1 + ((z2 - z1) * i) / length;
      net.push(x, 0, z, x, 3, z);
    }
    colliders.push({
      x: (x1 + x2) / 2,
      z: (z1 + z2) / 2,
      w: Math.abs(x2 - x1) + 0.12,
      d: Math.abs(z2 - z1) + 0.12,
      h: 3,
    });
  };
  const left = F.x - F.width / 2 - 4,
    right = F.x + F.width / 2 + 4,
    north = F.z - F.length / 2 - 4,
    south = F.z + F.length / 2 + 4;
  fence(left, north, right, north);
  fence(right, north, right, south);
  fence(left, south, right, south);
  fence(left, north, left, F.entrance.z - 4);
  fence(left, F.entrance.z + 4, left, south);
  g.add(
    new T.LineSegments(
      new T.BufferGeometry().setAttribute(
        "position",
        new T.Float32BufferAttribute(net, 3),
      ),
      new T.LineBasicMaterial({
        color: "#c0d0b9",
        transparent: true,
        opacity: 0.48,
      }),
    ),
  );
  for (const x of [left - 4, right + 4])
    for (const z of [north - 4, south + 4]) {
      box(x, 5, z, 0.22, 10, 0.22, "#667867", true);
      box(x, 9.8, z, 2.5, 0.6, 0.45, "#fff0c5");
    }
  for (const z of [216, 222]) {
    box(25, 0.65, z, 6, 0.2, 1, "#bc956c", true);
    box(25, 1.15, z + 0.4, 6, 0.8, 0.16, "#bc956c");
  }
  for (const z of [247, 255, 263]) line(27, z, 12, 0.12);
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#244d3c";
  ctx.fillRect(0, 0, 768, 160);
  ctx.fillStyle = "#fff1ca";
  ctx.textAlign = "center";
  ctx.font = "bold 38px sans-serif";
  ctx.fillText("PARK KERALA", 384, 61);
  ctx.font = "bold 44px sans-serif";
  ctx.fillText("FOOTBALL TURF", 384, 118);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  const sign = new T.Mesh(
    new T.PlaneGeometry(7, 1.5),
    new T.MeshBasicMaterial({ map: texture, side: T.FrontSide }),
  );
  sign.rotation.y = -Math.PI / 2;
  sign.position.set(left, 4, F.entrance.z);
  g.add(sign);
  const back = sign.clone();
  back.rotation.y += Math.PI;
  back.position.x += 0.02;
  g.add(back);
  for (const z of [F.entrance.z - 4, F.entrance.z + 4])
    box(left, 2, z, 0.17, 4, 0.17, "#42644c");
}
export function footballModel() {
  const group = new T.Group();
  const ball = new T.Mesh(
    new T.IcosahedronGeometry(F.radius, 2),
    new T.MeshStandardMaterial({ color: "#f2efd9", roughness: 0.8 }),
  );
  ball.castShadow = true;
  group.add(ball);
  for (const [x, y, z] of [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ]) {
    const patch = new T.Mesh(
      new T.CircleGeometry(0.13, 5),
      new T.MeshStandardMaterial({ color: "#304138", side: T.DoubleSide }),
    );
    patch.position.set(x * F.radius, y * F.radius, z * F.radius);
    patch.lookAt(x * 2, y * 2, z * 2);
    group.add(patch);
  }
  return group;
}
