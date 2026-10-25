import { TopTabs, type MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { CalendarDays, ChartNoAxesCombined, Layers, Sparkles, UserRound } from 'lucide-react-native';
import { StyleSheet, type ColorValue } from 'react-native';

import GlassTabBar from '@/components/glass-tab-bar';
import { TabDockContext } from '@/components/ui';
import { fonts } from '@/design/tokens';
import { useApp } from '@/state/app-context';

export default function TabsLayout() {
  const { colors } = useApp();
  return (
    <TabDockContext value={true}>
      <TopTabs tabBarPosition="bottom" keyboardDismissMode="on-drag" tabBar={(props: MaterialTopTabBarProps) => <GlassTabBar {...props} />} screenOptions={{
        swipeEnabled: true,
        lazy: true,
        tabBarShowIcon: true,
        tabBarActiveTintColor: colors.tintText,
        tabBarInactiveTintColor: colors.textSecondary,
        sceneStyle: { backgroundColor: colors.background },
        tabBarIndicatorStyle: { backgroundColor: colors.tintSoft, height: 56, top: 4, borderRadius: 28, marginHorizontal: 4 },
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        tabBarStyle: styles.bar,
      }}>
        <TopTabs.Screen name="today" options={{ title: 'Today', tabBarIcon: ({ color }: { color: ColorValue }) => <Sparkles color={color} size={24} strokeWidth={2.2} /> }} />
        <TopTabs.Screen name="week" options={{ title: 'Calendar', tabBarIcon: ({ color }: { color: ColorValue }) => <CalendarDays color={color} size={24} strokeWidth={2.2} /> }} />
        <TopTabs.Screen name="plans" options={{ title: 'Plans', tabBarIcon: ({ color }: { color: ColorValue }) => <Layers color={color} size={24} strokeWidth={2.2} /> }} />
        <TopTabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: ({ color }: { color: ColorValue }) => <ChartNoAxesCombined color={color} size={24} strokeWidth={2.2} /> }} />
        <TopTabs.Screen name="you" options={{ title: 'You', tabBarIcon: ({ color }: { color: ColorValue }) => <UserRound color={color} size={24} strokeWidth={2.2} /> }} />
      </TopTabs>
    </TabDockContext>
  );
}

const styles = StyleSheet.create({
  bar: { height: 64, backgroundColor: 'transparent', elevation: 0, shadowOpacity: 0 },
  item: { height: 64, paddingVertical: 8, paddingHorizontal: 0 },
  label: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 15, letterSpacing: 0, textTransform: 'none' },
});
