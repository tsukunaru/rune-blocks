import type { BlockColor, ThemeId } from './game/types.ts';

export interface ThemeData {
  id: ThemeId;
  nameKey: string;
  cost: number;
  accent: string;
  glow: string;
  board: string;
  blocks: Record<BlockColor, string>;
}

const common = (overrides: Partial<Record<BlockColor, string>> = {}): Record<BlockColor, string> => ({
  blue: '#4d8cff', cyan: '#35d9db', green: '#57c987', orange: '#ff9f43',
  purple: '#9a6bff', pink: '#ee6fb5', gold: '#f6c95c', ...overrides,
});

export const THEMES: readonly ThemeData[] = [
  { id: 'classic', nameKey: 'themeClassic', cost: 0, accent: '#f6c95c', glow: '#5ddde0', board: '#121a3e', blocks: common() },
  { id: 'emerald', nameKey: 'themeEmerald', cost: 50, accent: '#e7c76b', glow: '#66e5a4', board: '#0e2b2c', blocks: common({ blue: '#2fb98f', purple: '#6bcf8d', pink: '#9ee27c', orange: '#e5b953' }) },
  { id: 'crystal', nameKey: 'themeCrystal', cost: 100, accent: '#aeeaff', glow: '#7b9dff', board: '#161d4b', blocks: common({ green: '#59dfe1', orange: '#9b8cff', gold: '#d0f5ff' }) },
  { id: 'moon', nameKey: 'themeMoon', cost: 150, accent: '#e8e5ff', glow: '#b99cff', board: '#17172f', blocks: common({ blue: '#8996d8', cyan: '#b4d5e8', green: '#8bbab0', orange: '#d2ad8e', purple: '#b29aca', pink: '#d7a9c8', gold: '#eee0ab' }) },
  { id: 'fire', nameKey: 'themeFire', cost: 220, accent: '#ffc15a', glow: '#ff6b4a', board: '#321329', blocks: common({ blue: '#8b4b87', cyan: '#e96869', green: '#d48448', orange: '#ff713d', purple: '#b54064', pink: '#fa6681', gold: '#ffc44f' }) },
  { id: 'golden', nameKey: 'themeGolden', cost: 450, accent: '#fff0a6', glow: '#f9ca54', board: '#2c2215', blocks: common({ blue: '#cda248', cyan: '#efd176', green: '#bfa33f', orange: '#edab3d', purple: '#c18449', pink: '#efb66a', gold: '#ffe48a' }) },
];

export const themeById = (id: ThemeId): ThemeData => THEMES.find((theme) => theme.id === id) ?? THEMES[0];
