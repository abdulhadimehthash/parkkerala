export type Interaction = {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  range: number;
  enabled: boolean;
};
export class Interactions {
  items: Interaction[] = [];
  closest(x: number, y: number, z: number) {
    return (
      this.items
        .filter(
          (i) =>
            Math.hypot(i.x - x, i.z - z) < i.range && Math.abs(i.y - y) < 5,
        )
        .sort(
          (a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z),
        )[0] ?? null
    );
  }
}
