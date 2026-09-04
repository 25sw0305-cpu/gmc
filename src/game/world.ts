import * as THREE from 'three';
import { BLOCKS, CHUNK, type BlockId, WORLD_HEIGHT } from './blocks';
import { noise2, terrainHeight } from './noise';

type Face = [number, number, number, number, number, number, number, number, number, number, number, number];
const FACES: Face[] = [
  [0,0,0, 0,0,1, 0,1,1, 0,1,0], [1,0,0, 1,1,0, 1,1,1, 1,0,1],
  [0,0,0, 1,0,0, 1,0,1, 0,0,1], [0,1,1, 1,1,1, 1,1,0, 0,1,0],
  [0,0,0, 0,1,0, 1,1,0, 1,0,0], [0,0,1, 1,0,1, 1,1,1, 0,1,1]
];
const OFFSETS: [number, number, number][] = [[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]];

export interface Hit { x: number; y: number; z: number; nx: number; ny: number; nz: number; }
export class VoxelWorld {
  readonly group = new THREE.Group();
  readonly seed: number;
  private chunks = new Map<string, THREE.Group>();
  private edits = new Map<string, BlockId>();
  private materials = new Map<BlockId, THREE.MeshLambertMaterial>();
  private visibleRadius = 2;
  constructor(seed = Math.floor(Math.random() * 1e9)) {
    this.seed = seed;
    this.group.name = 'voxel-world';
    for (const block of Object.values(BLOCKS)) if (block.id) this.materials.set(block.id, new THREE.MeshLambertMaterial({ color: block.color, flatShading: true }));
    this.load();
    localStorage.setItem('meadow-voxels-seed', String(this.seed));
  }
  private editKey(x: number, y: number, z: number) { return `${x},${y},${z}`; }
  private chunkKey(cx: number, cz: number) { return `${cx},${cz}`; }
  private terrainBlock(x: number, y: number, z: number): BlockId {
    const h = terrainHeight(x, z, this.seed);
    if (y > h) return 0;
    if (y === h) return h < 17 ? 6 : 1;
    if (y > h - 4) return 2;
    if (y < 5 || noise2(x / 8, z / 8, this.seed + 91) > .77) return 3;
    return 2;
  }
  private isTreeOrigin(x: number, z: number): boolean {
    const localX = ((x % CHUNK) + CHUNK) % CHUNK;
    const localZ = ((z % CHUNK) + CHUNK) % CHUNK;
    if (localX !== 2 && localX !== 8 && localX !== 14) return false;
    if (localZ !== 2 && localZ !== 8 && localZ !== 14) return false;
    const h = terrainHeight(x, z, this.seed);
    return h >= 18 && noise2(x / 5, z / 5, this.seed + 45) >= .72;
  }
  private treeBlock(x: number, y: number, z: number): BlockId {
    // A leaf canopy reaches one block in every horizontal direction from its trunk.
    for (let tz = z - 1; tz <= z + 1; tz++) for (let tx = x - 1; tx <= x + 1; tx++) {
      if (!this.isTreeOrigin(tx, tz)) continue;
      const h = terrainHeight(tx, tz, this.seed);
      if (x === tx && z === tz && y >= h + 1 && y <= h + 4) return 4;
      if (Math.abs(x - tx) <= 1 && Math.abs(z - tz) <= 1 && y >= h + 5 && y <= h + 7) return 5;
    }
    return 0;
  }
  private naturalBlock(x: number, y: number, z: number): BlockId {
    const terrain = this.terrainBlock(x, y, z);
    return terrain || this.treeBlock(x, y, z);
  }
  get(x: number, y: number, z: number): BlockId {
    if (y < 0 || y >= WORLD_HEIGHT) return y < 0 ? 3 : 0;
    return this.edits.get(this.editKey(x, y, z)) ?? this.naturalBlock(x, y, z);
  }
  set(x: number, y: number, z: number, id: BlockId) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const key = this.editKey(x, y, z);
    if (id === this.naturalBlock(x, y, z)) this.edits.delete(key); else this.edits.set(key, id);
    this.rebuildAround(x, z);
    this.save();
  }
  update(centerX: number, centerZ: number) {
    const cx = Math.floor(centerX / CHUNK), cz = Math.floor(centerZ / CHUNK);
    const needed = new Set<string>();
    for (let z = cz - this.visibleRadius; z <= cz + this.visibleRadius; z++) for (let x = cx - this.visibleRadius; x <= cx + this.visibleRadius; x++) {
      const key = this.chunkKey(x, z); needed.add(key); if (!this.chunks.has(key)) this.buildChunk(x, z);
    }
    for (const [key, mesh] of this.chunks) if (!needed.has(key)) { this.group.remove(mesh); mesh.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); this.chunks.delete(key); }
  }
  private buildChunk(cx: number, cz: number) {
    const byType = new Map<BlockId, number[]>();
    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) for (let y = 0; y < WORLD_HEIGHT; y++) {
      const wx = cx * CHUNK + x, wz = cz * CHUNK + z, id = this.get(wx, y, wz);
      if (!id) continue;
      for (let f = 0; f < 6; f++) if (!this.get(wx + OFFSETS[f][0], y + OFFSETS[f][1], wz + OFFSETS[f][2])) {
        const list = byType.get(id) ?? []; byType.set(id, list);
        const q = FACES[f];
        // BufferGeometry without an index consumes vertices in triangles. Each
        // exposed block face is therefore emitted as two triangles (0-1-2, 0-2-3).
        const quad: number[] = [];
        for (let i = 0; i < q.length; i++) quad.push(q[i] + (i % 3 === 0 ? wx : i % 3 === 1 ? y : wz));
        list.push(...quad.slice(0, 9), ...quad.slice(0, 3), ...quad.slice(6, 12));
      }
    }
    const holder = new THREE.Group(); holder.position.set(0,0,0);
    for (const [id, vertices] of byType) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, this.materials.get(id)!); holder.add(mesh);
    }
    holder.userData.chunk = [cx, cz]; this.chunks.set(this.chunkKey(cx, cz), holder); this.group.add(holder);
  }
  private rebuildAround(x: number, z: number) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const key = this.chunkKey(cx + dx, cz + dz), old = this.chunks.get(key);
      if (old) { this.group.remove(old); old.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); this.chunks.delete(key); this.buildChunk(cx + dx, cz + dz); }
    }
  }
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, max = 7): Hit | null {
    const step = .08, p = origin.clone(); let px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
    for (let t = 0; t < max; t += step) { p.addScaledVector(direction, step); const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z); if (x !== px || y !== py || z !== pz) { if (this.get(x,y,z)) return { x,y,z,nx:px-x,ny:py-y,nz:pz-z }; px=x;py=y;pz=z; } }
    return null;
  }
  private save() { localStorage.setItem('meadow-voxels-edits', JSON.stringify([...this.edits])); localStorage.setItem('meadow-voxels-seed', String(this.seed)); }
  private load() { try { for (const [key, value] of JSON.parse(localStorage.getItem('meadow-voxels-edits') ?? '[]')) this.edits.set(key, value); } catch { localStorage.removeItem('meadow-voxels-edits'); } }
}
