import * as T from "three";
import {
  ROADS,
  MAIN_ROAD,
  ROAD_STOPS,
  roadFrame,
  laneOffset,
  bayWidening,
  surfaceHeight,
  nearestRoad,
  insideOtherRoad,
  validateRoads,
} from "../../shared/roads.js";
import { heightAt, VEHICLE_SPAWNS } from "../../shared/world.js";
export function createTerrain(root: T.Group) {
  const material = new T.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 1,
  });
  for (let x = -300; x < 780; x += 90)
    for (let z = -780; z < 330; z += 90) {
      const near = ROADS.some((r) =>
        r.points.some(
          (p) => p.x > x - 22 && p.x < x + 112 && p.z > z - 22 && p.z < z + 112,
        ),
      );
      const divisions = near ? 45 : 15;
      const geo = new T.PlaneGeometry(90, 90, divisions, divisions);
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
      mesh.userData.terrain = true;
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

export function buildRoadNetwork(root: T.Group) {
  for (const road of ROADS) {
    for (const shoulder of [true, false]) {
      const vertices: number[] = [],
        indices: number[] = [];
      const columns = shoulder ? 4 : 13;
      for (const p of road.points) {
        const extra = shoulder ? 2.4 : 0,
          left = -(
            road.width / 2 +
            (road.id === "main" ? bayWidening(p.s) : 0) +
            extra
          ),
          right = road.width / 2 + extra;
        for (let column = 0; column < columns; column++) {
          const offset = shoulder
              ? [left, left + extra, right - extra, right][column]
              : left + ((right - left) * column) / (columns - 1),
            f = roadFrame(road, p.s, offset);
          const surface = surfaceHeight(f.x, f.z),
            y = shoulder
              ? nearestRoad(f.x, f.z)?.edge <= 0
                ? surface - 0.045
                : heightAt(f.x, f.z) + 0.035
              : surface;
          vertices.push(f.x, y, f.z);
        }
      }
      for (let i = 1; i < road.points.length; i++)
        for (let c = 0; c < columns - 1; c++) {
          if (shoulder && c === 1) continue;
          const k = i * columns + c;
          if (
            shoulder &&
            [k - columns, k - columns + 1, k, k + 1].some((v) =>
              insideOtherRoad(
                vertices[v * 3],
                vertices[v * 3 + 2],
                road.id,
                0.8,
              ),
            )
          )
            continue;
          indices.push(
            k - columns,
            k - columns + 1,
            k,
            k - columns + 1,
            k + 1,
            k,
          );
        }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute(
        "position",
        new T.Float32BufferAttribute(vertices, 3),
      );
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const mesh = new T.Mesh(
        geometry,
        new T.MeshStandardMaterial({
          color: shoulder ? "#baad88" : road.width < 6 ? "#d5c8a0" : "#747e77",
          roughness: 1,
          side: T.DoubleSide,
        }),
      );
      mesh.receiveShadow = true;
      mesh.userData.roadId = road.id;
      mesh.userData.roadSurface = !shoulder;
      mesh.userData.roadShoulder = shoulder;
      root.add(mesh);
    }
    if (road.width >= 10) {
      const vertices: number[] = [];
      for (let s = 2; s < road.length - 4; s += 10) {
        const a = roadFrame(road, s),
          b = roadFrame(road, s + 4);
        for (const p of [a, b]) vertices.push(p.x, p.y + 0.012, p.z);
      }
      const line = new T.LineSegments(
        new T.BufferGeometry().setAttribute(
          "position",
          new T.Float32BufferAttribute(vertices, 3),
        ),
        new T.LineBasicMaterial({ color: "#eee2ba" }),
      );
      root.add(line);
    }
  }
}
export function roadDebugGroup() {
  const group = new T.Group();
  group.name = "Development road integrity";
  for (const road of ROADS)
    for (const offset of [0, -road.width / 2, road.width / 2]) {
      const points = road.points.map((p) => {
        const f = roadFrame(road, p.s, offset);
        return new T.Vector3(f.x, f.y + 0.2, f.z);
      });
      group.add(
        new T.Line(
          new T.BufferGeometry().setFromPoints(points),
          new T.LineBasicMaterial({
            color: offset ? "#ff775c" : "#46edbc",
            depthTest: false,
          }),
        ),
      );
    }
  const lane = MAIN_ROAD.points.map((p) => {
    const f = roadFrame(MAIN_ROAD, p.s, laneOffset(p.s));
    return new T.Vector3(f.x, f.y + 0.35, f.z);
  });
  group.add(
    new T.Line(
      new T.BufferGeometry().setFromPoints(lane),
      new T.LineBasicMaterial({ color: "#56b7ff", depthTest: false }),
    ),
  );
  for (const stop of ROAD_STOPS) {
    const mesh = new T.Mesh(
      new T.SphereGeometry(0.7),
      new T.MeshBasicMaterial({ color: "#f5eb70", depthTest: false }),
    );
    mesh.position.set(stop.x, stop.y + 1, stop.z);
    group.add(mesh);
  }
  for (const spawn of VEHICLE_SPAWNS) {
    const marker = new T.Mesh(
      new T.SphereGeometry(0.65),
      new T.MeshBasicMaterial({ color: "#bf7aff", depthTest: false }),
    );
    marker.position.set(spawn.x, surfaceHeight(spawn.x, spawn.z) + 1, spawn.z);
    group.add(marker);
  }
  const issues = validateRoads();
  for (const issue of issues) {
    const p = ROADS.find((r) => r.id === issue.road)?.points[issue.segment];
    if (p) {
      const marker = new T.Mesh(
        new T.SphereGeometry(2),
        new T.MeshBasicMaterial({ color: "#ff2222", depthTest: false }),
      );
      marker.position.set(p.x, p.y + 1, p.z);
      group.add(marker);
    }
  }
  if (issues.length) console.warn("Road validation", issues);
  return group;
}
