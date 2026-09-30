import * as T from "three";
import { heightAt } from "../../shared/world.js";
export function createTerrain(root: T.Group) {
  const material = new T.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 1,
  });
  for (let x = -300; x < 780; x += 90)
    for (let z = -780; z < 330; z += 90) {
      const geo = new T.PlaneGeometry(90, 90, 15, 15);
      geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position;
      const colors = [];
      for (let i = 0; i < p.count; i++) {
        const wx = p.getX(i) + x + 45,
          wz = p.getZ(i) + z + 45,
          y = heightAt(wx, wz);
        p.setY(i, y - 0.025);
        const color = new T.Color(
          y > 45 ? "#829960" : y > 15 ? "#93a869" : "#9cab65",
        );
        color.multiplyScalar(
          0.96 + 0.06 * Math.sin(wx * 0.08) * Math.cos(wz * 0.09),
        );
        colors.push(color.r, color.g, color.b);
      }
      geo.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const mesh = new T.Mesh(geo, material);
      mesh.position.set(x + 45, 0, z + 45);
      mesh.receiveShadow = true;
      root.add(mesh);
    }
}
export function roadRibbon(
  points: number[][],
  width: number,
  color = "#747e77",
  offset = 0.18,
) {
  const positions: number[] = [],
    indices: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)];
    const angle = Math.atan2(b[0] - a[0], b[1] - a[1]);
    for (const sign of [-1, 1]) {
      const x = p[0] + ((Math.cos(angle) * width) / 2) * sign,
        z = p[1] - ((Math.sin(angle) * width) / 2) * sign;
      positions.push(x, heightAt(x, z) + offset, z);
    }
    if (i > 0) {
      const k = i * 2;
      indices.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new T.Mesh(
    geo,
    new T.MeshStandardMaterial({ color, side: T.DoubleSide, roughness: 1 }),
  );
  mesh.receiveShadow = true;
  return mesh;
}
export function samplePath(points: number[][], step = 3) {
  const out: number[][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1],
      n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step);
    for (let j = 0; j < n; j++)
      out.push([
        a[0] + ((b[0] - a[0]) * j) / n,
        a[1] + ((b[1] - a[1]) * j) / n,
      ]);
  }
  out.push(points[points.length - 1]);
  return out;
}
