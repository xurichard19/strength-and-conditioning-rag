export type ThemeMode = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

const shared = {
  strength: '#0088FF',
  endurance: '#00B9A7',
  mixed: '#FF8D28',
  intervals: '#8B5CF6',
  success: '#17803A',
  danger: '#D92D20',
  white: '#FFFFFF',
};

export const palettes = {
  light: {
    ...shared,
    background: '#FBFAFD',
    card: '#FFFFFF',
    elevated: '#FFFFFF',
    text: '#101014',
    textSecondary: '#5F5F68',
    textTertiary: '#85858D',
    tint: '#8B5CF6',
    tintText: '#6D28D9',
    tintSoft: '#F1EAFF',
    fill: '#F1F0F4',
    fillStrong: '#E6E4EA',
    separator: 'rgba(60,60,67,0.18)',
    strong: '#101014',
    strongText: '#FFFFFF',
    tab: 'rgba(255,255,255,0.96)',
    washToday: ['rgba(0,136,255,0.13)', 'rgba(139,92,246,0.07)', 'rgba(251,250,253,0)'] as const,
    washWeek: ['rgba(139,92,246,0.12)', 'rgba(255,141,40,0.04)', 'rgba(251,250,253,0)'] as const,
    washProgress: ['rgba(0,136,255,0.11)', 'rgba(0,185,167,0.06)', 'rgba(251,250,253,0)'] as const,
    washYou: ['rgba(139,92,246,0.12)', 'rgba(251,250,253,0.02)', 'rgba(251,250,253,0)'] as const,
  },
  dark: {
    ...shared,
    strength: '#0A84FF',
    endurance: '#63E6E2',
    mixed: '#FF9F0A',
    intervals: '#A78BFA',
    background: '#0D0B12',
    card: '#1C1926',
    elevated: '#2B2735',
    text: '#F6ECE7',
    textSecondary: '#BAB5C4',
    textTertiary: '#8B8794',
    tint: '#A78BFA',
    tintText: '#C2B4FF',
    tintSoft: '#2D2444',
    fill: '#292632',
    fillStrong: '#363240',
    separator: 'rgba(255,255,255,0.14)',
    strong: '#F6ECE7',
    strongText: '#15121B',
    tab: 'rgba(28,25,38,0.96)',
    washToday: ['rgba(10,132,255,0.22)', 'rgba(139,92,246,0.13)', 'rgba(13,11,18,0)'] as const,
    washWeek: ['rgba(139,92,246,0.20)', 'rgba(255,159,10,0.07)', 'rgba(13,11,18,0)'] as const,
    washProgress: ['rgba(10,132,255,0.18)', 'rgba(99,230,226,0.08)', 'rgba(13,11,18,0)'] as const,
    washYou: ['rgba(139,92,246,0.19)', 'rgba(255,255,255,0.03)', 'rgba(13,11,18,0)'] as const,
  },
} as const;

export type Palette = (typeof palettes)[ColorScheme];

export const spacing = {
  2: 2,
  4: 4,
  6: 6,
  8: 8,
  10: 10,
  12: 12,
  16: 16,
  20: 20,
  24: 24,
  32: 32,
  40: 40,
} as const;

export const radius = {
  hairline: 4,
  segment: 8,
  card: 20,
  button: 14,
  panel: 16,
  capsule: 999,
} as const;

export const fonts = {
  regular: 'Rubik_400Regular',
  medium: 'Rubik_500Medium',
  semibold: 'Rubik_600SemiBold',
  bold: 'Rubik_700Bold',
} as const;

export const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowOffset: { width: 0, height: 4 },
  shadowRadius: 12,
  elevation: 3,
} as const;
