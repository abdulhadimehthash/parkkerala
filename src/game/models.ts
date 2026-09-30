import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as T from "three";
import { part } from "../world";
import { seatOffset } from "../../shared/world.js";
export function vehicleModel(kind: string, color = "#ceaa61") {
  const g = new T.Group(),
    body = new T.Group();
  g.add(body);
  g.userData.body = body;
  const box = (c: string, p: number[], s: number[]) =>
    part(body, "box", c, p, s);
  if (kind === "helicopter") {
    part(body, "sphere", color, [0, 1.7, 0], [1.6, 1.25, 2.6]);
    part(body, "sphere", "#9dcac4", [0, 1.85, -1.45], [1.4, 0.9, 1.15]);
    box(color, [0, 2, 3.1], [0.6, 0.6, 4]);
    box("#e1d9b4", [0, 2.9, 4.7], [0.2, 2, 1]);
    for (const x of [-1.35, 1.35]) {
      box("#536454", [x, 0.3, 0], [0.15, 0.2, 4.7]);
      box("#657761", [x * 0.65, 0.75, 0], [0.15, 1.2, 0.2]);
    }
    const rotor = new T.Group();
    rotor.position.y = 3.2;
    body.add(rotor);
    part(rotor, "box", "#34493c", [0, 0, 0], [10, 0.1, 0.26]);
    part(rotor, "box", "#34493c", [0, 0, 0], [0.26, 0.1, 10]);
    g.userData.rotor = rotor;
  } else if (kind === "bike") {
    box(color, [0, 0.9, -0.1], [0.5, 0.5, 1.5]);
    box("#465044", [0, 1.18, 0.3], [0.6, 0.15, 1]);
    box("#d4d7b5", [0, 1.6, -0.65], [1, 0.12, 0.12]);
    box("#ddd8b4", [0, 1.2, -0.9], [0.35, 0.3, 0.12]);
    for (const z of [-0.85, 0.85])
      part(
        body,
        "cylinder",
        "#303c32",
        [0, 0.4, z],
        [0.4, 0.18, 0.4],
        [0, 0, Math.PI / 2],
      );
  } else if (kind === "bus") {
    box("#ad624d", [0, 0.9, 0], [3, 1, 10]);
    box("#e8cf94", [0, 1.2, 0], [2.9, 0.12, 9.8]);
    box("#f2dfb2", [0, 3.5, 0], [3.1, 0.18, 10.1]);
    box("#82aca6", [0, 2.4, -4.8], [2.8, 1.5, 0.08]);
    box("#bd7355", [0, 2.2, 4.9], [3, 2, 0.2]);
    for (const x of [-1.48, 1.48])
      for (let z = -4; z < 5; z += 1.2)
        box("#e9d8ae", [x, 2.35, z], [0.1, 2.2, 0.1]);
    for (let i = 0; i < 20; i++) {
      const s = seatOffset(i);
      box("#52796a", [s.x, 1.6, s.z], [0.48, 0.22, 0.75]);
      box("#547b6b", [s.x, 2, s.z + 0.35], [0.48, 0.8, 0.15]);
    }
    const door = box("#d2bc88", [1.5, 2, -3.7], [0.1, 2.3, 1.6]);
    g.userData.door = door;
    for (const x of [-1.5, 1.5])
      for (const z of [-3, 3])
        part(
          body,
          "cylinder",
          "#354136",
          [x, 0.5, z],
          [0.6, 0.25, 0.6],
          [0, 0, Math.PI / 2],
        );
  } else {
    box(color, [0, 0.85, 0], [2.25, 1.1, 4.5]);
    box(color, [0, 1.7, 0.2], [2, 1, 2.6]);
    box("#a7ceca", [0, 1.8, -1.12], [1.8, 0.65, 0.06]);
    box("#a7ceca", [0, 1.8, 1.52], [1.8, 0.65, 0.06]);
    for (const x of [-1.01, 1.01])
      box("#a7ceca", [x, 1.8, 0.1], [0.03, 0.6, 1.9]);
    for (const x of [-0.75, 0.75])
      box("#f4e8b7", [x, 0.9, -2.28], [0.4, 0.24, 0.07]);
    for (const x of [-1.1, 1.1])
      for (const z of [-1.45, 1.45])
        part(
          body,
          "cylinder",
          "#344236",
          [x, 0.45, z],
          [0.45, 0.25, 0.45],
          [0, 0, Math.PI / 2],
        );
  }
  const batches = new Map<T.Material, T.Mesh[]>();
  for (const child of body.children) {
    if (!(child instanceof T.Mesh) || child === g.userData.door) continue;
    const list = batches.get(child.material) || [];
    list.push(child);
    batches.set(child.material, list);
  }
  for (const [material, meshes] of batches) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map((m) => {
      m.updateMatrix();
      return m.geometry.clone().applyMatrix4(m.matrix);
    });
    const geometry = mergeGeometries(geometries, false);
    if (geometry) {
      const mesh = new T.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      body.add(mesh);
      meshes.forEach((m) => m.removeFromParent());
    }
    geometries.forEach((g) => g.dispose());
  }
  return g;
}
export function nameplate(name: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#274b3be8";
  c.beginPath();
  c.roundRect(4, 4, 504, 88, 36);
  c.fill();
  c.fillStyle = "#ecf0ce";
  c.textAlign = "center";
  c.font = 'bold 34px "Noto Sans Malayalam", sans-serif';
  c.fillText(name, 256, 61, 440);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  const sprite = new T.Sprite(
    new T.SpriteMaterial({ map: texture, depthTest: false }),
  );
  sprite.scale.set(3.4, 0.64, 1);
  sprite.position.y = 2.85;
  sprite.renderOrder = 20;
  return sprite;
}
