import { Award, Dumbbell, Footprints, TrendingUp } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { AppText, Card, Screen, SectionTitle } from '@/components/ui';
import { consistency, milestones } from '@/data/mock';
import type { ProgressMetric } from '@/domain/types';
import { useApp } from '@/state/app-context';

function Trend({ metric }: { metric: ProgressMetric }) {
  const { colors } = useApp();
  const width = 340;
  const height = 112;
  const min = Math.min(...metric.series);
  const max = Math.max(...metric.series);
  const laneColor = metric.lane === 'strength' ? colors.strength : colors.endurance;
  const points = metric.series.map((value, index) => ({
    x: 8 + index * ((width - 16) / Math.max(1, metric.series.length - 1)),
    y: height - 12 - ((value - min) / Math.max(1, max - min)) * (height - 30),
  }));
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} accessibilityLabel={`${metric.label}: ${metric.series[0]} to ${metric.series.at(-1)} ${metric.unit}`}>
      <Line x1="8" y1="20" x2={width - 8} y2="20" stroke={colors.separator} strokeDasharray="3 7" />
      <Line x1="8" y1="60" x2={width - 8} y2="60" stroke={colors.separator} strokeDasharray="3 7" />
      <Line x1="8" y1={height - 12} x2={width - 8} y2={height - 12} stroke={colors.separator} />
      <Path d={path} fill="none" stroke={laneColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => <Circle key={index} cx={point.x} cy={point.y} r={index === points.length - 1 ? 4 : 2} fill={laneColor} />)}
    </Svg>
  );
}

function MetricCard({ metric }: { metric: ProgressMetric }) {
  const { colors } = useApp();
  const Icon = metric.lane === 'strength' ? Dumbbell : Footprints;
  const color = metric.lane === 'strength' ? colors.strength : colors.endurance;
  return <Card style={styles.metricCard}>
    <View style={styles.metricHeader}>
      <Icon color={color} size={18} strokeWidth={1.6} />
      <AppText weight="medium" style={styles.copy}>{metric.label}</AppText>
      <TrendingUp color={colors.textTertiary} size={16} strokeWidth={1.6} />
    </View>
    <View style={styles.metricReading}>
      <AppText style={styles.metricValue}>{metric.series.at(-1)}<AppText tone="secondary" style={styles.metricUnit}> {metric.unit}</AppText></AppText>
      <AppText tone="secondary" style={styles.caption}>from {metric.series[0]} {metric.unit}</AppText>
    </View>
    <Trend metric={metric} />
  </Card>;
}

export default function ProgressScreen() {
  const { colors, metrics, refreshPreview } = useApp();
  const maxSessions = 5;
  const sessionCount = consistency.reduce((total, week) => total + week.strength + week.cardio, 0);

  if (!metrics.length) return <Screen title="Progress" onRefresh={refreshPreview}><Card><AppText>No training history yet. Progress tracking is not connected in this build.</AppText></Card></Screen>;

  return (
    <Screen title="Progress" subtitle="A longer view of your training." context="my progress" onRefresh={refreshPreview}>
      <SectionTitle>12-week consistency</SectionTitle>
      <Card>
        <View style={styles.consistencyHeader}>
          <AppText style={styles.consistencyValue}>{sessionCount}<AppText tone="secondary" style={styles.metricUnit}> sessions</AppText></AppText>
          <AppText tone="secondary" style={styles.caption}>Over {consistency.length} weeks</AppText>
        </View>
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
      {metrics.filter((metric) => metric.lane === 'strength').map((metric) => <MetricCard key={metric.id} metric={metric} />)}

      <SectionTitle>Cardio</SectionTitle>
      {metrics.filter((metric) => metric.lane === 'endurance').map((metric) => <MetricCard key={metric.id} metric={metric} />)}

      <SectionTitle>Milestones</SectionTitle>
      <View style={[styles.milestones, { borderTopColor: colors.separator }]}>
        {milestones.map((item, index) => (
          <View key={item.text} style={[styles.milestone, index < milestones.length - 1 && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <Award color={colors.tint} size={19} />
            <View style={styles.copy}><AppText weight="medium" style={styles.milestoneText}>{item.text}</AppText><AppText tone="secondary" style={styles.caption}>{item.when}</AppText></View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  consistencyHeader: { gap: 3, marginBottom: 22 },
  consistencyValue: { fontSize: 34, lineHeight: 42, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  legend: { flexDirection: 'row', gap: 20, marginBottom: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 5, height: 5, borderRadius: 3 },
  legendText: { fontSize: 12 },
  barChart: { height: 108, flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginBottom: 18 },
  barColumn: { flex: 1, alignItems: 'center', gap: 5 },
  bars: { height: 78, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 5, borderRadius: 2 },
  weekLabel: { fontSize: 8, lineHeight: 10 },
  caption: { fontSize: 12, lineHeight: 18 },
  metricCard: { gap: 18 },
  metricHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metricReading: { gap: 3 },
  metricValue: { fontSize: 34, lineHeight: 42, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  metricUnit: { fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  copy: { flex: 1 },
  milestones: { borderTopWidth: StyleSheet.hairlineWidth },
  milestone: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 14 },
  milestoneText: { fontSize: 14 },
});
