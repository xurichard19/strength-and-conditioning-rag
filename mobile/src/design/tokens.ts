export type ThemeMode = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

const shared = {
  strength: '#38658A',
  endurance: '#735397',
  mixed: '#916338',
  intervals: '#75618E',
  success: '#735397',
  danger: '#B4443C',
  white: '#FFFFFF',
};

export const palettes = {
  light: {
    ...shared,
    background: '#F5F7F8',
    card: '#FFFFFF',
    elevated: '#FFFFFF',
    text: '#182126',
    textSecondary: '#566771',
    textTertiary: '#65757E',
    tint: '#735397',
    tintText: '#735397',
    tintSoft: '#EFE9F8',
    fill: '#EBEFF1',
    fillStrong: '#DCE3E7',
    separator: '#D4DDE2',
    strong: '#182126',
    strongText: '#FFFFFF',
    tab: '#F5F7F8',
    overlay: 'rgba(16,25,31,0.38)',
  },
  dark: {
    ...shared,
    strength: '#A8C8E6',
    endurance: '#C4B2EB',
    mixed: '#D7B58D',
    intervals: '#BEAFD4',
    success: '#C4B2EB',
    danger: '#F0A49D',
    background: '#0C1013',
    card: '#141A1E',
    elevated: '#20282E',
    text: '#F3F2ED',
    textSecondary: '#B1BBC4',
    textTertiary: '#8D9BA6',
    tint: '#C4B2EB',
    tintText: '#C4B2EB',
    tintSoft: '#2B233C',
    fill: '#1C242A',
    fillStrong: '#303C45',
    separator: '#303C45',
    strong: '#F3F2ED',
    strongText: '#182126',
    tab: '#0C1013',
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
