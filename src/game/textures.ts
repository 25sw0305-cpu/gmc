import * as THREE from 'three';

// 외부 이미지 없이, 캔버스에 픽셀 단위로 절차적 텍스처를 그려서 아틀라스를 만든다.
const TILE = 16, COLS = 5, ROWS = 3;
const NAMES = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'sand',
  'wood_top', 'wood_side', 'leaves', 'sandstone', 'snow',
  'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'water'
] as const;
export type TileName = typeof NAMES[number];

const rand = (seed: number) => { const x = Math.sin(seed) * 43758.5453123; return x - Math.floor(x); };

function paint(ctx: CanvasRenderingContext2D, i: number, base: string, accent: string, pattern: 'speckle' | 'grain' | 'ring' | 'sparkle' | 'ripple' | 'tuft') {
  const col = i % COLS, row = Math.floor(i / COLS), x0 = col * TILE, y0 = row * TILE;
  ctx.fillStyle = base; ctx.fillRect(x0, y0, TILE, TILE);
  ctx.fillStyle = accent;
  for (let py = 0; py < TILE; py++) for (let px = 0; px < TILE; px++) {
    const n = rand(i * 97.7 + px * 13.1 + py * 71.3);
    let on = false;
    if (pattern === 'speckle') on = n > .8;
    else if (pattern === 'grain') on = n > .55 && (px + Math.floor(py / 3)) % 3 === 0;
    else if (pattern === 'ring') { const d = Math.hypot(px - 7.5, py - 7.5); on = Math.abs((d % 3.4) - 1.6) < .55; }
    else if (pattern === 'sparkle') on = n > .93;
    else if (pattern === 'ripple') on = Math.abs(((px + py) % 6) - 3) < 1 && n > .3;
    else if (pattern === 'tuft') on = py < 3 && n > .35;
    if (on) ctx.fillRect(x0 + px, y0 + py, 1, 1);
  }
}

let cached: THREE.CanvasTexture | null = null;
export function buildAtlas(): THREE.CanvasTexture {
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = COLS * TILE; canvas.height = ROWS * TILE;
  const ctx = canvas.getContext('2d')!;
  paint(ctx, 0, '#6fae3b', '#5c9931', 'speckle');   // grass_top
  paint(ctx, 1, '#875536', '#6fae3b', 'tuft');      // grass_side (흙 + 위쪽 초록 잔디 술)
  paint(ctx, 2, '#875536', '#6a4029', 'speckle');   // dirt
  paint(ctx, 3, '#7a8083', '#666b6e', 'speckle');   // stone
  paint(ctx, 4, '#d8bd78', '#c7a95f', 'speckle');   // sand
  paint(ctx, 5, '#a9764a', '#8a5e39', 'ring');      // wood_top (나이테)
  paint(ctx, 6, '#71452c', '#5c3721', 'grain');     // wood_side (나뭇결)
  paint(ctx, 7, '#3d8745', '#316b37', 'speckle');   // leaves
  paint(ctx, 8, '#cbb98a', '#b8a575', 'grain');     // sandstone
  paint(ctx, 9, '#f1f6f8', '#dbe6ea', 'speckle');   // snow
  paint(ctx, 10, '#3b3b3d', '#1c1c1d', 'sparkle');  // coal ore
  paint(ctx, 11, '#8b6f57', '#cfa77e', 'sparkle');  // iron ore
  paint(ctx, 12, '#7a7350', '#e8d24a', 'sparkle');  // gold ore
  paint(ctx, 13, '#4a6b68', '#5be3d6', 'sparkle');  // diamond ore
  paint(ctx, 14, '#3d92d5', '#6fb6ea', 'ripple');   // water
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; // 확대해도 또렷한 픽셀아트 느낌
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  cached = texture;
  return texture;
}

function tileIndex(name: TileName) { return NAMES.indexOf(name); }
export function tileUV(name: TileName): [number, number, number, number] {
  const i = tileIndex(name), col = i % COLS, row = Math.floor(i / COLS);
  return [col / COLS, row / ROWS, (col + 1) / COLS, (row + 1) / ROWS];
}

// face 순서는 world.ts의 FACES 배열과 동일: 0=-x,1=+x,2=-y(바닥),3=+y(위),4=-z,5=+z
export function tileForFace(id: number, face: number): TileName {
  if (id === 1) return face === 3 ? 'grass_top' : face === 2 ? 'dirt' : 'grass_side';
  if (id === 4) return face === 2 || face === 3 ? 'wood_top' : 'wood_side';
  switch (id) {
    case 2: return 'dirt'; case 3: return 'stone'; case 5: return 'leaves'; case 6: return 'sand';
    case 7: return 'water'; case 8: return 'coal_ore'; case 9: return 'iron_ore'; case 10: return 'gold_ore';
    case 11: return 'diamond_ore'; case 12: return 'snow'; case 13: return 'sandstone';
    default: return 'stone';
  }
}
