export type ThemeMode = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

const shared = {
  strength: '#245F8D',
  endurance: '#67438E',
  mixed: '#805326',
  intervals: '#685080',
  success: '#67438E',
  danger: '#B4443C',
  white: '#FFFFFF',
};

export const palettes = {
  light: {
    ...shared,
    background: '#EDF1F4',
    card: '#FFFFFF',
    elevated: '#FFFFFF',
    text: '#182126',
    textSecondary: '#374955',
    textTertiary: '#435661',
    tint: '#67438E',
    tintText: '#67438E',
    tintSoft: '#E9DFF5',
    fill: '#E3EAF0',
    fillStrong: '#CEDAE3',
    separator: '#B7C4CE',
    controlBorder: '#6D808D',
    strong: '#182126',
    strongText: '#FFFFFF',
    tab: '#FFFFFF',
    overlay: 'rgba(16,25,31,0.38)',
  },
  dark: {
    ...shared,
    strength: '#99CFF5',
    endurance: '#CFB6F5',
    mixed: '#EDBE82',
    intervals: '#CCB8E8',
    success: '#CFB6F5',
    danger: '#F0A49D',
    background: '#0C1013',
    card: '#19242C',
    elevated: '#26353F',
    text: '#F6F7F4',
    textSecondary: '#D6E0E7',
    textTertiary: '#C0CDD6',
    tint: '#CFB6F5',
    tintText: '#CFB6F5',
    tintSoft: '#372948',
    fill: '#243440',
    fillStrong: '#344A59',
    separator: '#465D6E',
    controlBorder: '#7B8F9D',
    strong: '#F3F2ED',
    strongText: '#182126',
    tab: '#19242C',
    overlay: 'rgba(0,0,0,0.64)',
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
  card: 16,
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
  shadowOpacity: 0.04,
  shadowOffset: { width: 0, height: 2 },
  shadowRadius: 8,
  elevation: 1,
} as const;
