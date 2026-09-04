// Small deterministic value-noise implementation; no asset or external map required.
const hash = (x: number, z: number, seed: number) => {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + seed * 1447;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const smooth = (t: number) => t * t * (3 - 2 * t);
export function noise2(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz;
}
export function terrainHeight(x: number, z: number, seed: number): number {
  const broad = noise2(x / 45, z / 45, seed) * 11;
  const detail = noise2(x / 12, z / 12, seed + 13) * 4;
  return Math.floor(12 + broad + detail);
}
