export const CHUNK = 16;
export const WORLD_HEIGHT = 48;

export type BlockId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export interface BlockDef { id: BlockId; name: string; color: number; solid: boolean; }
export const BLOCKS: Record<BlockId, BlockDef> = {
  0: { id: 0, name: '공기', color: 0, solid: false },
  1: { id: 1, name: '잔디', color: 0x6fae3b, solid: true },
  2: { id: 2, name: '흙', color: 0x875536, solid: true },
  3: { id: 3, name: '돌', color: 0x7a8083, solid: true },
  4: { id: 4, name: '나무', color: 0x71452c, solid: true },
  5: { id: 5, name: '잎', color: 0x3d8745, solid: true },
  6: { id: 6, name: '모래', color: 0xd8bd78, solid: true },
  7: { id: 7, name: '물', color: 0x3d92d5, solid: false },
  8: { id: 8, name: '석탄 광석', color: 0x3b3b3d, solid: true },
  9: { id: 9, name: '철 광석', color: 0xcfa77e, solid: true },
  10: { id: 10, name: '금 광석', color: 0xe8d24a, solid: true },
  11: { id: 11, name: '다이아몬드 광석', color: 0x5be3d6, solid: true },
  12: { id: 12, name: '눈', color: 0xf1f6f8, solid: true },
  13: { id: 13, name: '사암', color: 0xcbb98a, solid: true }
};
// 숫자키 1~9에 대응 (광석은 채굴로 얻는 자원이라 hotbar에는 대표로 석탄만 배치)
export const HOTBAR: BlockId[] = [1, 2, 3, 4, 5, 6, 13, 8, 7];

// 마인크래프트의 "맨손 채굴" 소요 시간(초)과 동일한 값. 광석류는 전부 hardness=3 → 15초로 통일되어 있음.
const HARDNESS: Partial<Record<BlockId, number>> = {
  1: .9, 2: .75, 3: 7.5, 4: 3, 5: .3, 6: .75, 8: 15, 9: 15, 10: 15, 11: 15, 12: .3, 13: 1.2
};
export function breakSeconds(id: BlockId): number { return HARDNESS[id] ?? .75; }
