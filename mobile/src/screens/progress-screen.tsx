import { Award, Dumbbell, Footprints, TrendingUp } from 'lucide-react-native';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { AppText, Card, Screen, SectionTitle } from '@/components/ui';
import { consistency, milestones } from '@/data/mock';
import type { ProgressMetric } from '@/domain/types';
import { useApp } from '@/state/app-context';

function Trend({ metric, width }: { metric: ProgressMetric; width: number }) {
  const { colors } = useApp();
  const height = 104;
  const min = Math.min(...metric.series);
  const max = Math.max(...metric.series);
  const laneColor = metric.lane === 'strength' ? colors.strength : colors.endurance;
  const points = metric.series.map((value, index) => ({
    x: 8 + index * ((width - 16) / Math.max(1, metric.series.length - 1)),
    y: height - 12 - ((value - min) / Math.max(1, max - min)) * (height - 30),
  }));
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  return (
    <Svg width={width} height={height} accessibilityLabel={`${metric.label} increased from ${metric.series[0]} to ${metric.series.at(-1)} ${metric.unit}`}>
      <Line x1="8" y1={height - 12} x2={width - 8} y2={height - 12} stroke={colors.separator} />
      <Path d={path} fill="none" stroke={laneColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => <Circle key={index} cx={point.x} cy={point.y} r={index === points.length - 1 ? 5 : 2.5} fill={laneColor} />)}
    </Svg>
  );
}

export default function ProgressScreen() {
  const { colors, metrics } = useApp();
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(250, Math.min(width - 64, 560));
  const maxSessions = 5;

  return (
    <Screen title="Progress" subtitle="Both threads, kept separate" context="my progress" wash="progress">
      <SectionTitle>12-week consistency</SectionTitle>
      <Card>
        <View style={styles.legend}>
          <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.strength }]} /><AppText tone="secondary" style={styles.legendText}>Strength</AppText></View>
          <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.endurance }]} /><AppText tone="secondary" style={styles.legendText}>Cardio</AppText></View>
        </View>
        <View style={styles.barChart}>
          {consistency.map((week) => (
            <View key={week.week} style={styles.barColumn}>
              <View style={styles.bars}>
                <View style={[styles.bar, { height: Math.max(3, (week.strength / maxSessions) * 74), backgroundColor: colors.strength }]} />
                <View style={[styles.bar, { height: Math.max(3, (week.cardio / maxSessions) * 74), backgroundColor: colors.endurance }]} />
              </View>
              <AppText tone="secondary" style={styles.weekLabel}>{week.week === 'Now' ? 'Now' : week.week.slice(0, 3)}</AppText>
            </View>
          ))}
        </View>
        <AppText tone="secondary" style={styles.caption}>A missed week is visible, but it does not erase the trend.</AppText>
      </Card>

      <SectionTitle>Strength</SectionTitle>
      {metrics.filter((metric) => metric.lane === 'strength').map((metric) => (
        <Card key={metric.id}>
          <View style={styles.metricHeader}>
            <View style={[styles.metricIcon, { backgroundColor: `${colors.strength}18` }]}><Dumbbell color={colors.strength} size={19} /></View>
            <View style={styles.copy}><AppText weight="semibold">{metric.label}</AppText><AppText tone="secondary" style={styles.caption}>{metric.series[0]} → {metric.series.at(-1)} {metric.unit}</AppText></View>
            <TrendingUp color={colors.success} size={18} />
          </View>
          <Trend metric={metric} width={chartWidth} />
        </Card>
      ))}

      <SectionTitle>Cardio</SectionTitle>
      {metrics.filter((metric) => metric.lane === 'endurance').map((metric) => (
        <Card key={metric.id}>
          <View style={styles.metricHeader}>
            <View style={[styles.metricIcon, { backgroundColor: `${colors.endurance}18` }]}><Footprints color={colors.endurance} size={19} /></View>
            <View style={styles.copy}><AppText weight="semibold">{metric.label}</AppText><AppText tone="secondary" style={styles.caption}>{metric.series[0]} → {metric.series.at(-1)} {metric.unit}</AppText></View>
            <TrendingUp color={colors.success} size={18} />
          </View>
          <Trend metric={metric} width={chartWidth} />
        </Card>
      ))}

      <SectionTitle>Milestones</SectionTitle>
      <Card style={styles.milestones}>
        {milestones.map((item, index) => (
          <View key={item.text} style={[styles.milestone, index < milestones.length - 1 && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <Award color={colors.tint} size={19} />
            <View style={styles.copy}><AppText weight="medium" style={styles.milestoneText}>{item.text}</AppText><AppText tone="secondary" style={styles.caption}>{item.when}</AppText></View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12 },
  barChart: { height: 108, flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  barColumn: { flex: 1, alignItems: 'center', gap: 5 },
  bars: { height: 78, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 5, borderRadius: 3 },
  weekLabel: { fontSize: 8, lineHeight: 10 },
  caption: { fontSize: 12, lineHeight: 17 },
  metricHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metricIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  milestones: { paddingVertical: 4 },
  milestone: { minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 12 },
  milestoneText: { fontSize: 14 },
});
