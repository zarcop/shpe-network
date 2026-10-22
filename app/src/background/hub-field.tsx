import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip, Field } from '@/ui/kit';
import { colors } from '@/ui/theme';

import { suggestHubs } from './data';
import { HUB_LABELS, HUB_LIMITS, type HubKind } from './hubs';

// One kind of hub: the entries as removable chips, and a field that suggests existing hubs as you type,
// so "UF" and "University of Florida" end up as one node in the graph.
export function HubField({
  kind,
  names,
  onAdd,
  onRemove,
}: {
  kind: HubKind;
  names: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
}) {
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const label = HUB_LABELS[kind];
  const full = names.length >= HUB_LIMITS[kind];

  useEffect(() => {
    const query = text.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    let current = true;
    const timer = setTimeout(async () => {
      const found = await suggestHubs(kind, query);
      if (current) setSuggestions(found.filter((s) => !names.some((n) => n.toLowerCase() === s.toLowerCase())));
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [kind, text, names]);

  function add(name: string) {
    if (!name.trim()) return;
    onAdd(name);
    setText('');
    setSuggestions([]);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{label.title}</Text>
      {label.hint ? <Text style={styles.hint}>{label.hint}</Text> : null}
      {names.length ? (
        <View style={styles.chips}>
          {names.map((name) => (
            <Chip key={name} label={name} onRemove={() => onRemove(name)} />
          ))}
        </View>
      ) : null}
      {full ? (
        <Text style={styles.hint}>That’s the most you can add here. Remove one to add another.</Text>
      ) : (
        <Field
          label={label.addLabel}
          value={text}
          onChangeText={setText}
          placeholder={label.placeholder}
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => add(text)}
        />
      )}
      {text.trim() ? (
        <View style={styles.suggestions}>
          {suggestions.map((s) => (
            <Pressable key={s} onPress={() => add(s)} accessibilityRole="button" style={styles.suggestion}>
              <Text style={styles.suggestionText}>{s}</Text>
            </Pressable>
          ))}
          {!suggestions.some((s) => s.toLowerCase() === text.trim().toLowerCase()) ? (
            <Pressable onPress={() => add(text)} accessibilityRole="button" style={styles.suggestion}>
              <Text style={styles.suggestionNew}>Add “{text.trim()}”</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  title: { fontSize: 17, fontWeight: '600', color: colors.text },
  hint: { fontSize: 13, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestions: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, overflow: 'hidden' },
  suggestion: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface },
  suggestionText: { fontSize: 15, color: colors.text },
  suggestionNew: { fontSize: 15, color: colors.primary },
});
