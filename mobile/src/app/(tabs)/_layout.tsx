import { TopTabs } from 'expo-router/js-top-tabs';
import { CalendarDays, ChartNoAxesCombined, MessageCircle, Sparkles, UserRound } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, shadow } from '@/design/tokens';
import { useApp } from '@/state/app-context';

export default function TabsLayout() {
  const { colors } = useApp();
  const insets = useSafeAreaInsets();
  const [keyboardShown, setKeyboardShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardShown(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardShown(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return (
    <TopTabs initialRouteName="today" tabBarPosition="bottom" keyboardDismissMode="on-drag" screenOptions={{
      swipeEnabled: true,
      lazy: true,
      tabBarShowIcon: true,
      tabBarActiveTintColor: colors.text,
      tabBarInactiveTintColor: colors.textTertiary,
      sceneStyle: { backgroundColor: colors.background },
      tabBarIndicatorStyle: styles.hidden,
      tabBarLabelStyle: styles.label,
      tabBarItemStyle: styles.item,
      tabBarStyle: [styles.bar, shadow, { backgroundColor: colors.tab, borderTopColor: colors.separator,
        height: 64 + Math.max(insets.bottom, 18), paddingBottom: Math.max(insets.bottom, 18) }, keyboardShown && styles.hidden],
    }}>
      <TopTabs.Screen name="today" options={{ title: 'Today', tabBarIcon: ({ color }: { color: ColorValue }) => <Sparkles color={color} size={24} strokeWidth={1.8} /> }} />
      <TopTabs.Screen name="week" options={{ title: 'Calendar', tabBarIcon: ({ color }: { color: ColorValue }) => <CalendarDays color={color} size={24} strokeWidth={1.8} /> }} />
      <TopTabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: ({ color }: { color: ColorValue }) => <ChartNoAxesCombined color={color} size={24} strokeWidth={1.8} /> }} />
      <TopTabs.Screen name="chat" options={{ title: 'Chat', tabBarIcon: ({ color }: { color: ColorValue }) => <MessageCircle color={color} size={24} strokeWidth={1.8} /> }} />
      <TopTabs.Screen name="you" options={{ title: 'You', tabBarIcon: ({ color }: { color: ColorValue }) => <UserRound color={color} size={24} strokeWidth={1.8} /> }} />
    </TopTabs>
  );
}

const styles = StyleSheet.create({
  bar: { paddingTop: 7, borderTopWidth: StyleSheet.hairlineWidth },
  item: { paddingVertical: 3, paddingHorizontal: 0 },
  label: { fontFamily: fonts.medium, fontSize: 10, lineHeight: 13, textTransform: 'none' },
  hidden: { display: 'none' },
});
