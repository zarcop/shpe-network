import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { HubKind } from '@/background/hubs';
import { colors } from '@/ui/theme';

import { hubsOf, membersOf, sharedHubIds, type Graph, type HubNode, type PersonNode } from './graph';
import { HubMark } from './hub-mark';

export const KIND_NAMES: Record<HubKind, { one: string; many: string }> = {
  school: { one: 'College', many: 'Colleges' },
  company: { one: 'Company', many: 'Companies' },
  major: { one: 'Major', many: 'Majors' },
  country: { one: 'Roots', many: 'Roots' },
};

// The card for whatever is tapped in the graph: a person with what you have in common, or a hub with its people.
export function Details({
  graph,
  id,
  meId,
  onSelect,
}: {
  graph: Graph;
  id: string;
  meId: string;
  onSelect: (id: string | null) => void;
}) {
  const node = graph.nodes.get(id);
  if (!node) return null;
  return (
    <Card onClose={() => onSelect(null)}>
      {node.type === 'hub' ? (
        <HubDetails graph={graph} hub={node} meId={meId} onSelect={onSelect} />
      ) : (
        <PersonDetails graph={graph} person={node} meId={meId} onSelect={onSelect} />
      )}
    </Card>
  );
}

// The bottom card shared by details and search results.
export function Card({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} style={styles.close}>
        <Text style={styles.closeText}>×</Text>
      </Pressable>
      {children}
    </View>
  );
}

export function PeopleList({ people, onSelect }: { people: PersonNode[]; onSelect: (id: string) => void }) {
  return (
    <ScrollView style={styles.list} nestedScrollEnabled>
      {people.map((m) => (
        <Pressable
          key={m.id}
          onPress={() => onSelect(m.id)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <Text style={styles.rowName} numberOfLines={1}>
            {m.name}
          </Text>
          {m.headline ? (
            <Text style={styles.rowMeta} numberOfLines={1}>
              {m.headline}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </ScrollView>
  );
}

function PersonDetails({
  graph,
  person,
  meId,
  onSelect,
}: {
  graph: Graph;
  person: PersonNode;
  meId: string;
  onSelect: (id: string) => void;
}) {
  const isMe = person.id === meId;
  const hubs = hubsOf(graph, person.id);
  const shared = isMe ? new Set<string>() : sharedHubIds(graph, meId, person.id);
  const meta = [person.headline, person.gradYear ? `Class of ${person.gradYear}` : null].filter(Boolean).join(' · ');

  return (
    <>
      <Text style={styles.name} numberOfLines={2}>
        {isMe ? `${person.name} (you)` : person.name}
      </Text>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      {!isMe && shared.size ? (
        <Text style={styles.shared}>
          You both: {hubs.filter((h) => shared.has(h.id)).map((h) => h.name).join(', ')}
        </Text>
      ) : null}
      {hubs.length ? (
        <View style={styles.chips}>
          {hubs.map((hub) => (
            <HubChip key={hub.id} hub={hub} shared={shared.has(hub.id)} onPress={() => onSelect(hub.id)} />
          ))}
        </View>
      ) : (
        <Text style={styles.meta}>{isMe ? 'Add your background to connect with people.' : 'No background yet.'}</Text>
      )}
      {isMe ? (
        <TextButton title={hubs.length ? 'Edit background' : 'Add your background'} onPress={() => router.push('/background')} />
      ) : person.linkedinUrl ? (
        <TextButton title="View LinkedIn profile" onPress={() => Linking.openURL(person.linkedinUrl!)} />
      ) : null}
    </>
  );
}

function HubDetails({
  graph,
  hub,
  meId,
  onSelect,
}: {
  graph: Graph;
  hub: HubNode;
  meId: string;
  onSelect: (id: string) => void;
}) {
  const members = membersOf(graph, hub.id);
  const includesMe = members.some((m) => m.id === meId);
  const others = members.filter((m) => m.id !== meId);

  return (
    <>
      <View style={styles.eyebrow}>
        <HubMark kind={hub.kind} />
        <Text style={styles.eyebrowText}>{KIND_NAMES[hub.kind].one}</Text>
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {hub.name}
      </Text>
      <Text style={styles.meta}>
        {members.length === 1 ? '1 person' : `${members.length} people`}
        {includesMe ? ', including you' : ''}
      </Text>
      <PeopleList people={others} onSelect={onSelect} />
    </>
  );
}

function HubChip({ hub, shared, onPress }: { hub: HubNode; shared: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${KIND_NAMES[hub.kind].one}: ${hub.name}${shared ? ', shared with you' : ''}`}
      style={({ pressed }) => [styles.chip, shared && styles.chipShared, pressed && styles.rowPressed]}
    >
      <HubMark kind={hub.kind} size={9} />
      <Text style={styles.chipText} numberOfLines={1}>
        {hub.name}
      </Text>
    </Pressable>
  );
}

function TextButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8} style={styles.textButton}>
      <Text style={styles.textButtonText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 20,
    gap: 8,
    boxShadow: '0 8px 32px rgba(29, 34, 38, 0.10)',
  },
  close: { position: 'absolute', top: 10, right: 12, zIndex: 1, padding: 4 },
  closeText: { fontSize: 24, lineHeight: 24, color: colors.muted },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrowText: { fontSize: 12, fontWeight: '600', color: colors.muted, letterSpacing: 0.6, textTransform: 'uppercase' },
  name: { fontSize: 19, fontWeight: '600', color: colors.text, paddingRight: 28 },
  meta: { fontSize: 14, lineHeight: 20, color: colors.muted },
  shared: { fontSize: 14, lineHeight: 20, color: colors.text, fontWeight: '500' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipShared: { borderColor: colors.text },
  chipText: { fontSize: 13, color: colors.text, flexShrink: 1 },
  list: { maxHeight: 220, marginTop: 4, marginHorizontal: -8 },
  row: { paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8 },
  rowPressed: { backgroundColor: colors.background },
  rowName: { fontSize: 15, fontWeight: '500', color: colors.text },
  rowMeta: { fontSize: 13, color: colors.muted, marginTop: 1 },
  textButton: { alignSelf: 'flex-start', marginTop: 6 },
  textButtonText: { fontSize: 15, fontWeight: '600', color: colors.primary },
});
