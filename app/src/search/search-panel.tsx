import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, KIND_NAMES, PeopleList } from '@/graph/details';
import type { PersonNode } from '@/graph/graph';
import { HubMark } from '@/graph/hub-mark';
import { colors, glass } from '@/ui/theme';

import type { SearchFilter } from './query';

// One line to type a question; Enter runs it. The text stays so it can be tweaked and run again.
export function SearchBar({ onSearch, onClear, active }: { onSearch: (text: string) => void; onClear: () => void; active: boolean }) {
  const [text, setText] = useState('');
  return (
    <View style={styles.bar}>
      <Text style={styles.icon} aria-hidden>
        ⌕
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => onSearch(text)}
        placeholder="Try “mechanical engineers from Mexico at Boeing”"
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

export function SearchResults({
  people,
  unknown,
  onSelect,
  onClose,
}: {
  people: PersonNode[];
  unknown: string[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Card onClose={onClose}>
      <Text style={styles.title}>
        {people.length === 0 ? 'No one matches yet' : people.length === 1 ? '1 person matches' : `${people.length} people match`}
      </Text>
      {unknown.length ? (
        <Text style={styles.meta}>Didn’t understand: {unknown.join(', ')}</Text>
      ) : people.length === 0 ? (
        <Text style={styles.meta}>Remove a filter to see more people.</Text>
      ) : null}
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
});
