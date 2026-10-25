import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, KIND_NAMES, PeopleList } from '@/graph/details';
import type { PersonNode } from '@/graph/graph';
import { HubMark } from '@/graph/hub-mark';
import { colors, glass } from '@/ui/theme';

import { EXAMPLES, typedAt } from './placeholder';
import type { SearchFilter } from './query';

const STILL_HINT = 'Search people, colleges, companies, majors, roots';

// The grey example questions typing themselves while the box is empty and untouched. Still when the device asks
// for reduced motion.
function useTypingHint(running: boolean): string {
  const [hint, setHint] = useState('');
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion, () => {});
  }, []);
  useEffect(() => {
    if (!running || reduceMotion) return;
    const start = Date.now();
    const timer = setInterval(() => setHint(typedAt(EXAMPLES, Date.now() - start)), 50);
    return () => clearInterval(timer);
  }, [running, reduceMotion]);
  return running && !reduceMotion ? hint : STILL_HINT;
}

// One line to type a question; Enter runs it. The text stays so it can be tweaked and run again.
export function SearchBar({ onSearch, onClear, active }: { onSearch: (text: string) => void; onClear: () => void; active: boolean }) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const hint = useTypingHint(!text && !focused && !active);
  return (
    <View style={styles.bar}>
      <Text style={styles.icon} aria-hidden>
        ⌕
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => onSearch(text)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={hint}
        placeholderTextColor={colors.muted}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel="Search people"
        style={styles.input}
      />
      {active || text ? (
        <Pressable
          onPress={() => {
            setText('');
            onClear();
          }}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={10}
        >
          <Text style={styles.clear}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const filterLabel = (f: SearchFilter) =>
  f.type === 'hub' ? f.name : f.type === 'year' ? `Class of ${f.year}` : `Name: ${f.text}`;

// What the search understood, one removable chip per filter.
export function FilterChips({ filters, onRemove }: { filters: SearchFilter[]; onRemove: (f: SearchFilter) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {filters.map((f) => (
        <Pressable
          key={filterLabel(f)}
          onPress={() => onRemove(f)}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${f.type === 'hub' ? `${KIND_NAMES[f.kind].one}: ` : ''}${filterLabel(f)}`}
          style={({ pressed }) => [styles.chip, pressed && { opacity: 0.8 }]}
        >
          {f.type === 'hub' ? <HubMark kind={f.kind} /> : null}
          <Text style={styles.chipText} numberOfLines={1}>
            {filterLabel(f)}
          </Text>
          <Text style={styles.chipRemove}>×</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export type SmartState = { busy: boolean; message?: string };

export function SearchResults({
  people,
  unknown,
  smart,
  onSmarter,
  onSelect,
  onClose,
}: {
  people: PersonNode[];
  unknown: string[];
  smart: SmartState;
  onSmarter: () => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Card onClose={onClose}>
      <Text style={styles.title}>
        {people.length === 0 ? 'No one matches yet' : people.length === 1 ? '1 person matches' : `${people.length} people match`}
      </Text>
      {unknown.length ? (
        <View style={styles.smart}>
          <Text style={[styles.meta, styles.smartText]}>Didn’t understand: {unknown.join(', ')}</Text>
          <Pressable
            onPress={onSmarter}
            disabled={smart.busy}
            accessibilityRole="button"
            style={({ pressed }) => [styles.smartButton, pressed && { opacity: 0.85 }]}
          >
            {smart.busy ? <ActivityIndicator color={colors.surface} size="small" /> : null}
            <Text style={styles.smartButtonText}>✨ Search smarter</Text>
          </Pressable>
        </View>
      ) : people.length === 0 ? (
        <Text style={styles.meta}>Remove a filter to see more people.</Text>
      ) : null}
      {smart.message ? <Text style={styles.meta}>{smart.message}</Text> : null}
      <PeopleList people={people} onSelect={onSelect} />
    </Card>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 22, ...glass },
  icon: { fontSize: 18, color: colors.muted },
  input: { flex: 1, minWidth: 0, paddingVertical: 10, fontSize: 15, color: colors.text },
  clear: { fontSize: 22, lineHeight: 22, color: colors.muted, paddingHorizontal: 2 },
  chips: { gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 12, paddingRight: 10, paddingVertical: 7, borderRadius: 18, ...glass },
  chipText: { fontSize: 14, fontWeight: '500', color: colors.text, maxWidth: 220 },
  chipRemove: { fontSize: 16, lineHeight: 16, color: colors.muted },
  title: { fontSize: 19, fontWeight: '600', color: colors.text, paddingRight: 28 },
  meta: { fontSize: 14, lineHeight: 20, color: colors.muted },
  smart: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  smartText: { flex: 1, minWidth: 160 },
  smartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.navy,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  smartButtonText: { color: colors.surface, fontSize: 14, fontWeight: '600' },
});
