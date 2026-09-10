import * as THREE from 'three';
import { BLOCKS, CHUNK, type BlockId, WORLD_HEIGHT } from './blocks';
import { biomeAt, noise2, noise3, terrainHeight, type Biome } from './noise';
import { buildAtlas, tileForFace, tileUV } from './textures';

const WATER_LEVEL = 15;
const PAD = CHUNK + 2; // 청크 생성 시 이웃 블록 확인용 1칸 여백
const BIOMES: Biome[] = ['plains', 'forest', 'desert', 'mountain'];
const MAX_WATER_SPREAD = 7; // 마인크래프트처럼 수원지에서 가로로 최대 7칸까지만 흐름

type Face = number[];
const FACES: Face[] = [
  [0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0], [1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1],
  [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1], [0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0],
  [0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0], [0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1]
];
const NEIGHBORS: [number, number, number][] = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];

// face 정점의 지역좌표를 텍스처 (u,v)로 매핑: 옆면은 항상 v=y(높이), 위/아래는 u=x,v=z
function faceUV(face: number, lx: number, ly: number, lz: number): [number, number] {
  if (face === 2 || face === 3) return [lx, lz];
  if (face === 0 || face === 1) return [lz, ly];
  return [lx, ly];
}

export interface Hit { x: number; y: number; z: number; nx: number; ny: number; nz: number; }

export class VoxelWorld {
  readonly group = new THREE.Group();
  readonly seed: number;
  visibleRadius = 8;
  chunksPerFrame = 3; // 프레임당 생성할 청크 수 제한 (한 번에 몰아서 만들면 프리징 발생)
  private chunks = new Map<string, THREE.Group>();
  private edits = new Map<string, BlockId>();
  private materials = new Map<BlockId, THREE.MeshLambertMaterial>();
  private buildQueue: [number, number][] = [];
  private pending = new Set<string>();
  // --- 물/모래 물리 ---
  private dirty = new Set<string>();       // 다음 tick에 검사할 좌표
  private waterFlow = new Map<string, number>(); // 수원지에서부터의 가로 확산 거리
  private meshDirty = new Set<string>();   // 이번 물리 tick에서 다시 그려야 할 청크

  constructor(seed = Math.floor(Math.random() * 1e9)) {
    this.seed = seed;
    this.group.name = 'voxel-world';
    const atlas = buildAtlas();
    for (const block of Object.values(BLOCKS)) if (block.id) this.materials.set(block.id, new THREE.MeshLambertMaterial({
      map: atlas, flatShading: true, transparent: block.id === 7, opacity: block.id === 7 ? .75 : 1,
      depthWrite: block.id !== 7, side: block.id === 7 ? THREE.DoubleSide : THREE.FrontSide
    }));
    this.load();
    localStorage.setItem('meadow-voxels-seed', String(this.seed));
  }

  get pendingChunks() { return this.buildQueue.length; }

  private editKey(x: number, y: number, z: number) { return `${x},${y},${z}`; }
  private chunkKey(cx: number, cz: number) { return `${cx},${cz}`; }

  // 캐릭터가 있는 곳 근처의 동굴을 3D 노이즈로 지표면 아래에만 뚫음
  private isCave(x: number, y: number, z: number, h: number): boolean {
    if (y < 3 || y > h - 2) return false;
    return noise3(x / 15, y / 11, z / 15, this.seed + 777) > 0.62;
  }

  // 깊이별 광맥: 석탄은 얕고 흔하게, 다이아몬드는 깊고 희귀하게
  private oreAt(x: number, y: number, z: number): BlockId | null {
    if (y > 40) return null;
    const n = noise3(x / 6, y / 6, z / 6, this.seed + 321);
    if (y < 10 && n > 0.905) return 11;
    if (y < 24 && n > 0.87) return 10;
    if (y < 34 && n > 0.82) return 9;
    if (n > 0.78) return 8;
    return null;
  }

  // biome/height를 이미 알고 있을 때 쓰는 빠른 버전 (청크 생성 시 컬럼당 1회만 계산해서 재사용)
  private terrainWithCache(x: number, y: number, z: number, biome: Biome, h: number): BlockId {
    if (y > h) return 0;
    if (this.isCave(x, y, z, h)) return 0;
    if (y === h) {
      if (biome === 'desert') return 6;
      if (biome === 'mountain' && h > 34) return 12;
      return h < 17 ? 6 : 1;
    }
    if (y > h - 4) return biome === 'desert' ? 13 : 2;
    if (y < 5 || noise2(x / 8, z / 8, this.seed + 91) > .77) return this.oreAt(x, y, z) ?? 3;
    return 2;
  }
  private isTreeOrigin(x: number, z: number): boolean {
    const biome = biomeAt(x, z, this.seed);
    if (biome !== 'forest' && biome !== 'plains') return false;
    const localX = ((x % CHUNK) + CHUNK) % CHUNK, localZ = ((z % CHUNK) + CHUNK) % CHUNK;
    if (localX !== 2 && localX !== 8 && localX !== 14) return false;
    if (localZ !== 2 && localZ !== 8 && localZ !== 14) return false;
    const h = terrainHeight(x, z, this.seed, biome);
    const threshold = biome === 'forest' ? 0.6 : 0.72;
    return h >= 18 && noise2(x / 5, z / 5, this.seed + 45) >= threshold;
  }

  private treeBlock(x: number, y: number, z: number): BlockId {
    for (let tz = z - 1; tz <= z + 1; tz++) for (let tx = x - 1; tx <= x + 1; tx++) {
      if (!this.isTreeOrigin(tx, tz)) continue;
      const h = terrainHeight(tx, tz, this.seed);
      if (x === tx && z === tz && y >= h + 1 && y <= h + 4) return 4;
      if (Math.abs(x - tx) <= 1 && Math.abs(z - tz) <= 1 && y >= h + 5 && y <= h + 7) return 5;
    }
    return 0;
  }

  private naturalWithCache(x: number, y: number, z: number, biome: Biome, h: number): BlockId {
    const terrain = this.terrainWithCache(x, y, z, biome, h);
    if (terrain) return terrain;
    if (y <= WATER_LEVEL) return 7;
    return this.treeBlock(x, y, z);
  }
  private naturalBlock(x: number, y: number, z: number): BlockId {
    const biome = biomeAt(x, z, this.seed);
    return this.naturalWithCache(x, y, z, biome, terrainHeight(x, z, this.seed, biome));
  }

  get(x: number, y: number, z: number): BlockId {
    if (y < 0 || y >= WORLD_HEIGHT) return y < 0 ? 3 : 0;
    return this.edits.get(this.editKey(x, y, z)) ?? this.naturalBlock(x, y, z);
  }

  // edits만 갱신하고 메시는 아직 다시 그리지 않음 (여러 블록이 한꺼번에 바뀔 때 청크 재생성을 한 번으로 묶기 위함)
  private applyEdit(x: number, y: number, z: number, id: BlockId) {
    const key = this.editKey(x, y, z);
    if (id === this.naturalBlock(x, y, z)) this.edits.delete(key); else this.edits.set(key, id);
    if (id !== 7) this.waterFlow.delete(key);
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.meshDirty.add(this.chunkKey(cx + dx, cz + dz));
  }
  private flushMesh() {
    for (const key of this.meshDirty) {
      const old = this.chunks.get(key);
      if (!old) continue; // 아직 로드 안 된 청크는 나중에 생성될 때 edits를 반영해서 만들어짐
      const [cx, cz] = key.split(',').map(Number);
      this.group.remove(old); old.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      this.chunks.delete(key); this.buildChunk(cx, cz);
    }
    this.meshDirty.clear();
  }
  // 물/모래가 반응해야 할 좌표들을 다음 물리 tick 대상으로 표시
  private wake(x: number, y: number, z: number) {
    this.dirty.add(this.editKey(x, y, z));
    for (const [dx, dy, dz] of NEIGHBORS) this.dirty.add(this.editKey(x + dx, y + dy, z + dz));
  }

  set(x: number, y: number, z: number, id: BlockId) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    this.applyEdit(x, y, z, id);
    this.flushMesh();
    this.wake(x, y, z);
    this.save();
  }

  // 모래는 아래가 비어 있으면 한 칸씩 떨어짐 (여러 tick에 걸쳐 바닥까지 낙하)
  private tickFalling(x: number, y: number, z: number, id: BlockId) {
    if (y <= 0) return;
    const below = this.get(x, y - 1, z);
    if (below !== 0 && below !== 7) return;
    this.applyEdit(x, y, z, below === 7 ? 7 : 0);
    this.applyEdit(x, y - 1, z, id);
    this.wake(x, y - 1, z);
    this.dirty.add(this.editKey(x, y + 1, z)); // 위에 다른 모래가 쌓여있었다면 그것도 이어서 검사
  }

  // 물은 아래로 먼저 떨어지고, 더 떨어질 곳이 없으면 수원지에서 최대 7칸까지 옆으로 퍼짐
  private tickWater(x: number, y: number, z: number) {
    const below = this.get(x, y - 1, z);
    if (y > 0 && below === 0) {
      this.applyEdit(x, y - 1, z, 7);
      this.waterFlow.set(this.editKey(x, y - 1, z), 0);
      this.wake(x, y - 1, z);
      return;
    }
    const depth = this.waterFlow.get(this.editKey(x, y, z)) ?? 0;
    if (depth >= MAX_WATER_SPREAD) return;
    for (const [dx, , dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]] as const) {
      const nx = x + dx, nz = z + dz;
      if (this.get(nx, y, nz) !== 0) continue;
      this.applyEdit(nx, y, nz, 7);
      this.waterFlow.set(this.editKey(nx, y, nz), depth + 1);
      this.wake(nx, y, nz);
    }
  }

  // main.ts에서 일정 간격(약 0.15초)마다 호출. 매 프레임 전체 월드를 검사하지 않고,
  // 실제로 변화가 생긴 좌표(dirty)만 검사해서 성능을 지킴.
  tickPhysics() {
    if (!this.dirty.size) return;
    const batch = [...this.dirty]; this.dirty.clear();
    for (const key of batch) {
      const [x, y, z] = key.split(',').map(Number);
      const id = this.get(x, y, z);
      if (id === 6) this.tickFalling(x, y, z, id);
      else if (id === 7) this.tickWater(x, y, z);
    }
    this.flushMesh();
  }

  // 설정 패널에서 호출; 8~24 범위는 마인크래프트 자체 렌더 거리 슬라이더와 동일
  setRenderDistance(radius: number) {
    this.visibleRadius = Math.max(8, Math.min(24, Math.round(radius)));
  }

  update(centerX: number, centerZ: number) {
    const cx = Math.floor(centerX / CHUNK), cz = Math.floor(centerZ / CHUNK);
    const needed = new Set<string>();
    const fresh: [number, number, number][] = [];
    for (let z = cz - this.visibleRadius; z <= cz + this.visibleRadius; z++) for (let x = cx - this.visibleRadius; x <= cx + this.visibleRadius; x++) {
      const key = this.chunkKey(x, z); needed.add(key);
      if (!this.chunks.has(key) && !this.pending.has(key)) {
        this.pending.add(key); fresh.push([Math.max(Math.abs(x - cx), Math.abs(z - cz)), x, z]);
      }
    }
    // 플레이어와 가까운 청크부터 생성 큐에 넣어서, 눈에 보이는 곳부터 먼저 채워지게 함
    fresh.sort((a, b) => a[0] - b[0]);
    for (const [, x, z] of fresh) this.buildQueue.push([x, z]);
    for (const [key, mesh] of this.chunks) if (!needed.has(key)) {
      this.group.remove(mesh); mesh.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); this.chunks.delete(key);
    }
    // 한 프레임에 정해진 개수만 생성 — 이동/최초 스폰 시 프리징 방지의 핵심
    let budget = this.chunksPerFrame;
    while (budget-- > 0 && this.buildQueue.length) {
      const [x, z] = this.buildQueue.shift()!;
      const key = this.chunkKey(x, z); this.pending.delete(key);
      if (needed.has(key) && !this.chunks.has(key)) this.buildChunk(x, z);
    }
  }

  private buildChunk(cx: number, cz: number) {
    // 1) 청크 전체(+1칸 여백)의 블록을 딱 한 번씩만 계산해서 배열에 채움
    //    (기존에는 이웃 면 확인 때문에 블록 하나당 노이즈 계산이 최대 7번씩 중복 실행됐음)
    const data = new Uint8Array(PAD * WORLD_HEIGHT * PAD);
    const idx = (lx: number, y: number, lz: number) => (lz * WORLD_HEIGHT + y) * PAD + lx;
    const height = new Int16Array(PAD * PAD);
    const biomeIdx = new Uint8Array(PAD * PAD);
    for (let lz = 0; lz < PAD; lz++) for (let lx = 0; lx < PAD; lx++) {
      const wx = cx * CHUNK - 1 + lx, wz = cz * CHUNK - 1 + lz;
      const biome = biomeAt(wx, wz, this.seed);
      height[lz * PAD + lx] = terrainHeight(wx, wz, this.seed, biome);
      biomeIdx[lz * PAD + lx] = BIOMES.indexOf(biome);
    }
    for (let lz = 0; lz < PAD; lz++) for (let lx = 0; lx < PAD; lx++) {
      const wx = cx * CHUNK - 1 + lx, wz = cz * CHUNK - 1 + lz;
      const biome = BIOMES[biomeIdx[lz * PAD + lx]], h = height[lz * PAD + lx];
      for (let y = 0; y < WORLD_HEIGHT; y++) {
        const id = this.edits.get(this.editKey(wx, y, wz)) ?? this.naturalWithCache(wx, y, wz, biome, h);
        data[idx(lx, y, lz)] = id;
      }
    }
    // 2) 채워진 배열만 보고 보이는 면을 뽑아 메시 생성 (추가 노이즈 계산 없음), 텍스처 UV도 함께 기록
    const byType = new Map<BlockId, { pos: number[]; uv: number[] }>();
    for (let lz = 1; lz <= CHUNK; lz++) for (let lx = 1; lx <= CHUNK; lx++) for (let y = 0; y < WORLD_HEIGHT; y++) {
      const id = data[idx(lx, y, lz)] as BlockId;
      if (!id) continue;
      const wx = cx * CHUNK + (lx - 1), wz = cz * CHUNK + (lz - 1);
      for (let f = 0; f < 6; f++) {
        const [ox, oy, oz] = NEIGHBORS[f];
        const ny = y + oy;
        const neighbor = ny < 0 ? 3 : ny >= WORLD_HEIGHT ? 0 : data[idx(lx + ox, ny, lz + oz)];
        // 물은 반투명이라 완전히 가려주지 못함: 물이 아닌 블록은 이웃이 물이어도 면을 그려야
        // 물속 바닥/벽면이 사라져 뒤쪽 블록이 비쳐 보이는 문제가 생기지 않는다.
        const occluded = id === 7 ? neighbor !== 0 : (neighbor !== 0 && neighbor !== 7);
        if (occluded) continue;
        const entry = byType.get(id) ?? { pos: [], uv: [] }; byType.set(id, entry);
        const q = FACES[f];
        const corner = (v: number) => [q[v * 3] + wx, q[v * 3 + 1] + y, q[v * 3 + 2] + wz];
        const [p0, p1, p2, p3] = [corner(0), corner(1), corner(2), corner(3)];
        entry.pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
        const [tu0, tv0, tu1, tv1] = tileUV(tileForFace(id, f));
        const uvAt = (v: number) => {
          const [lu, lv] = faceUV(f, q[v * 3], q[v * 3 + 1], q[v * 3 + 2]);
          return [tu0 + lu * (tu1 - tu0), tv0 + lv * (tv1 - tv0)];
        };
        const [a, b, c, d] = [uvAt(0), uvAt(1), uvAt(2), uvAt(3)];
        entry.uv.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    }
    const holder = new THREE.Group();
    for (const [id, { pos, uv }] of byType) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      holder.add(new THREE.Mesh(geo, this.materials.get(id)!));
    }
    holder.userData.chunk = [cx, cz];
    this.chunks.set(this.chunkKey(cx, cz), holder);
    this.group.add(holder);
  }

  raycast(origin: THREE.Vector3, direction: THREE.Vector3, max = 7): Hit | null {
    const step = .08, p = origin.clone();
    let px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
    for (let t = 0; t < max; t += step) {
      p.addScaledVector(direction, step);
      const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z);
      if (x !== px || y !== py || z !== pz) {
        if (this.get(x, y, z)) return { x, y, z, nx: px - x, ny: py - y, nz: pz - z };
        px = x; py = y; pz = z;
      }
    }
    return null;
  }

  private save() {
    localStorage.setItem('meadow-voxels-edits', JSON.stringify([...this.edits]));
    localStorage.setItem('meadow-voxels-seed', String(this.seed));
  }
  private load() {
    try { for (const [key, value] of JSON.parse(localStorage.getItem('meadow-voxels-edits') ?? '[]')) this.edits.set(key, value); }
    catch { localStorage.removeItem('meadow-voxels-edits'); }
  }
}
