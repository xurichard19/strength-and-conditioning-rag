import { Picker } from '@expo/ui/community/picker';
import { Check, ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';

import { useApp } from '@/state/app-context';
import { ActionSheet } from './action-sheet';
import { AppText, SecondaryButton } from './ui';

export type SelectOption = { label: string; value: string };

/** Compact form row; time/duration use the native iPhone wheel, other choices use a list. */
export function SelectionField({ label, value, options, onChange, wheel = false, disabled = false, last = false }: {
  label: string; value: string; options: readonly SelectOption[]; onChange: (value: string) => void;
  wheel?: boolean; disabled?: boolean; last?: boolean;
}) {
  const { colors } = useApp();
  const [open, setOpen] = useState(false);
  const index = Math.max(0, options.findIndex(option => option.value === value));
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${options[index].label}`} disabled={disabled}
      onPress={() => { Keyboard.dismiss(); setOpen(true); }}
      style={[styles.field, !last && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <AppText style={styles.label}>{label}</AppText>
      <AppText tone="secondary" style={styles.value}>{options[index].label}</AppText>
      <ChevronDown color={colors.textTertiary} size={17} />
    </Pressable>
    {open ? <ActionSheet title={label} onClose={() => setOpen(false)}>
      {wheel && Platform.OS === 'ios' ? <>
        <Picker selectedValue={value} onValueChange={onChange} style={styles.wheel}>
          {options.map(option => <Picker.Item key={option.value} value={option.value} label={option.label} color={colors.text} />)}
        </Picker>
        <SecondaryButton onPress={() => setOpen(false)}>Done</SecondaryButton>
      </> : <FlatList data={options} keyExtractor={option => option.value} style={styles.list}
        initialScrollIndex={index} getItemLayout={(_, itemIndex) => ({ length: 52, offset: itemIndex * 52, index: itemIndex })}
        renderItem={({ item }) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: item.value === value }}
          accessibilityLabel={item.label} onPress={() => { onChange(item.value); setOpen(false); }} style={styles.option}>
          <AppText style={styles.label}>{item.label}</AppText>
          {item.value === value ? <Check color={colors.tintText} size={20} /> : <View style={styles.checkSpace} />}
        </Pressable>} />}
    </ActionSheet> : null}
  </>;
}

const styles = StyleSheet.create({
  field: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { flex: 1, fontSize: 15 },
  value: { fontSize: 15 },
  wheel: { width: '100%' },
  list: { maxHeight: 312, marginBottom: 8 },
  option: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkSpace: { width: 20 },
});
