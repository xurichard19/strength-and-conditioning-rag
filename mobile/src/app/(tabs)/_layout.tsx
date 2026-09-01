import { Tabs } from 'expo-router';
import { CalendarDays, ChartNoAxesCombined, MessageCircle, Sparkles, UserRound } from 'lucide-react-native';
import { StyleSheet } from 'react-native';

import { fonts, shadow } from '@/design/tokens';
import { useApp } from '@/state/app-context';

export default function TabsLayout() {
  const { colors } = useApp();
  return (
    <Tabs initialRouteName="today" screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.text,
      tabBarInactiveTintColor: colors.textTertiary,
      tabBarHideOnKeyboard: true,
      sceneStyle: { backgroundColor: colors.background },
      tabBarLabelStyle: styles.label,
      tabBarItemStyle: styles.item,
      tabBarStyle: [styles.bar, shadow, { backgroundColor: colors.tab, borderTopColor: colors.separator }],
    }}>
      <Tabs.Screen name="today" options={{ title: 'Today', tabBarIcon: ({ color, size }) => <Sparkles color={color} size={size} strokeWidth={1.8} /> }} />
      <Tabs.Screen name="week" options={{ title: 'Week', tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} strokeWidth={1.8} /> }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: ({ color, size }) => <ChartNoAxesCombined color={color} size={size} strokeWidth={1.8} /> }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat', tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} strokeWidth={1.8} /> }} />
      <Tabs.Screen name="you" options={{ title: 'You', tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} strokeWidth={1.8} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { height: 82, paddingTop: 7, paddingBottom: 18, borderTopWidth: StyleSheet.hairlineWidth },
  item: { paddingVertical: 3 },
  label: { fontFamily: fonts.medium, fontSize: 10, lineHeight: 13 },
});
