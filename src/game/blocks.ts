export const CHUNK = 16;
export const WORLD_HEIGHT = 48;

export type BlockId = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export interface BlockDef { id: BlockId; name: string; color: number; solid: boolean; }
export const BLOCKS: Record<BlockId, BlockDef> = {
  0: { id: 0, name: '공기', color: 0, solid: false },
  1: { id: 1, name: '잔디', color: 0x6fae3b, solid: true },
  2: { id: 2, name: '흙', color: 0x875536, solid: true },
  3: { id: 3, name: '돌', color: 0x7a8083, solid: true },
  4: { id: 4, name: '나무', color: 0x71452c, solid: true },
  5: { id: 5, name: '잎', color: 0x3d8745, solid: true },
  6: { id: 6, name: '모래', color: 0xd8bd78, solid: true }
};
export const HOTBAR: BlockId[] = [1, 2, 3, 4, 5, 6];
