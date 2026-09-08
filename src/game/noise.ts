// Small deterministic value-noise implementation; no external assets needed.
const hash = (x: number, z: number, seed: number) => {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + seed * 1447;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const hash3 = (x: number, y: number, z: number, seed: number) => {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647) + seed * 1447;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const smooth = (t: number) => t * t * (3 - 2 * t);

export function noise2(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  const top = a + (b - a) * fx, bottom = c + (d - c) * fx;
  return top + (bottom - top) * fz;
}

// 3D value noise, used for cave carving and ore pocket placement.
export function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
  const c000 = hash3(ix, iy, iz, seed), c100 = hash3(ix + 1, iy, iz, seed);
  const c010 = hash3(ix, iy + 1, iz, seed), c110 = hash3(ix + 1, iy + 1, iz, seed);
  const c001 = hash3(ix, iy, iz + 1, seed), c101 = hash3(ix + 1, iy, iz + 1, seed);
  const c011 = hash3(ix, iy + 1, iz + 1, seed), c111 = hash3(ix + 1, iy + 1, iz + 1, seed);
  const x00 = c000 + (c100 - c000) * fx, x10 = c010 + (c110 - c010) * fx;
  const x01 = c001 + (c101 - c001) * fx, x11 = c011 + (c111 - c011) * fx;
  const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
  return y0 + (y1 - y0) * fz;
}

export type Biome = 'plains' | 'forest' | 'desert' | 'mountain';

// Large-scale temperature/moisture/elevation fields pick a biome the same way
// Minecraft layers climate noise before choosing a surface type.
export function biomeAt(x: number, z: number, seed: number): Biome {
  const elevation = noise2(x / 220, z / 220, seed + 1300);
  if (elevation > 0.68) return 'mountain';
  const temperature = noise2(x / 180, z / 180, seed + 500);
  const moisture = noise2(x / 180, z / 180, seed + 900);
  if (temperature > 0.62 && moisture < 0.45) return 'desert';
  if (moisture > 0.55) return 'forest';
  return 'plains';
}

export function terrainHeight(x: number, z: number, seed: number, biome: Biome = biomeAt(x, z, seed)): number {
  const broad = noise2(x / 45, z / 45, seed) * 11;
  const detail = noise2(x / 12, z / 12, seed + 13) * 4;
  switch (biome) {
    case 'desert': return Math.floor(10 + noise2(x / 60, z / 60, seed + 7) * 5 + detail * 0.5);
    case 'mountain': return Math.floor(18 + noise2(x / 70, z / 70, seed + 21) * 26 + detail * 1.4);
    case 'forest': return Math.floor(13 + broad + detail);
    default: return Math.floor(12 + broad + detail);
  }
}
