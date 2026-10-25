import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/session';
import { loadKnownHubs } from '@/background/data';
import { HUB_KINDS, type HubKind } from '@/background/hubs';
import type { KnownHub } from '@/background/resume/parse';
import { loadGraph } from '@/graph/data';
import { Details, KIND_NAMES } from '@/graph/details';
import { filterGraph, personId, type Graph, type PersonNode } from '@/graph/graph';
import { GraphView } from '@/graph/graph-view';
import { HubMark } from '@/graph/hub-mark';
import { findPeople, parseQuery, type ParsedQuery, type SearchFilter } from '@/search/query';
import { FilterChips, SearchBar, SearchResults } from '@/search/search-panel';
import { Button } from '@/ui/kit';
import { colors, glass } from '@/ui/theme';

// Home: everyone who's going, linked through the colleges, companies, majors and roots they share.
export default function Home() {
  const { profile } = useAuth();
  const p = profile!;
  const meId = personId(p.id);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [failed, setFailed] = useState(false);
  const [kinds, setKinds] = useState<ReadonlySet<HubKind>>(new Set(HUB_KINDS));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Hub names and nicknames for reading search questions (the graph only has names).
  const [known, setKnown] = useState<KnownHub[]>([]);
  const [search, setSearch] = useState<ParsedQuery | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([loadGraph(), loadKnownHubs()]).then(([g, k]) => {
      setGraph(g);
      setKnown(k);
    }, () => setFailed(true));
  }, []);
  // Reload on every visit: you come back here after editing your background.
  useFocusEffect(load);

  // While searching every kind is drawn, so nobody found is hidden by a kind switched off. Same set when all are
  // on already: new graph data restarts the layout, and the found people would drift out of view.
  const drawnKinds = search && kinds.size < HUB_KINDS.length ? ALL_KINDS : kinds;
  const shown = useMemo(() => (graph ? filterGraph(graph, drawnKinds) : null), [graph, drawnKinds]);
  const found = useMemo(() => (graph && search ? findPeople(graph, search.filters) : null), [graph, search]);
  const highlight = useMemo(() => {
    if (selectedId && graph) return new Set([selectedId, ...(graph.neighbors.get(selectedId) ?? [])]);
    return new Set(found ? [...found.people, ...found.hubs] : []);
  }, [graph, selectedId, found]);
  const foundPeople = useMemo(
    () =>
      found && graph
        ? [...found.people].map((id) => graph.nodes.get(id) as PersonNode).sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [found, graph],
  );

  function runSearch(text: string) {
    if (!graph) return;
    const names = [...graph.nodes.values()].filter((n) => n.type === 'person').map((n) => n.name);
    const parsed = parseQuery(text, known, names);
    setSelectedId(null);
    setSearch(parsed.filters.length || parsed.unknown.length ? parsed : null);
  }

  function removeFilter(f: SearchFilter) {
    const filters = search!.filters.filter((x) => x !== f);
    setSearch(filters.length ? { filters, unknown: search!.unknown } : null);
  }

  function toggle(kind: HubKind) {
    const next = new Set(kinds);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    setKinds(next);
    // A hidden hub can't stay selected.
    const selected = selectedId ? graph?.nodes.get(selectedId) : null;
    if (selected?.type === 'hub' && !next.has(selected.kind)) setSelectedId(null);
  }

  const people = graph ? [...graph.nodes.values()].filter((n) => n.type === 'person').length : 0;
  const noBackground = graph ? (graph.neighbors.get(meId)?.size ?? 0) === 0 : false;
  const initials = p.full_name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={styles.screen}>
      {shown ? (
        <GraphView
          nodes={shown.nodes}
          links={shown.links}
          meId={meId}
          selectedId={selectedId}
          highlight={highlight}
          onSelect={setSelectedId}
        />
      ) : (
        <View style={styles.center}>
          {failed ? (
            <View style={styles.message}>
              <Text style={styles.messageText}>Couldn’t load the graph. Check your connection.</Text>
              <Button title="Try again" variant="secondary" onPress={load} />
            </View>
          ) : (
            <ActivityIndicator color={colors.primary} size="large" />
          )}
        </View>
      )}

      <SafeAreaView style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={styles.top} pointerEvents="box-none">
          <View style={styles.header}>
            <Text style={styles.brand} accessibilityRole="header">
              Who is going to <Text style={styles.brandShpe}>SHPE?</Text>
            </Text>
            <Pressable
              onPress={() => router.push('/profile')}
              accessibilityRole="button"
              accessibilityLabel="My profile"
              style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.avatarText}>{initials}</Text>
            </Pressable>
          </View>
          <SearchBar onSearch={runSearch} onClear={() => setSearch(null)} active={!!search} />
          {search ? (
            <FilterChips filters={search.filters} onRemove={removeFilter} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {HUB_KINDS.map((kind) => {
                const on = kinds.has(kind);
                return (
                  <Pressable
                    key={kind}
                    onPress={() => toggle(kind)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`Show ${KIND_NAMES[kind].many}`}
                    style={[styles.filter, !on && styles.filterOff]}
                  >
                    <View style={!on && { opacity: 0.35 }}>
                      <HubMark kind={kind} />
                    </View>
                    <Text style={[styles.filterText, !on && { color: colors.muted }]}>{KIND_NAMES[kind].many}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>

        <View style={styles.bottom} pointerEvents="box-none">
          {graph && selectedId ? (
            <Details graph={graph} id={selectedId} meId={meId} onSelect={setSelectedId} />
          ) : graph && search ? (
            <SearchResults
              people={foundPeople}
              unknown={search.unknown}
              onSelect={setSelectedId}
              onClose={() => setSearch(null)}
            />
          ) : graph && noBackground ? (
            <View style={styles.callout}>
              <Text style={styles.calloutTitle}>You’re not connected yet</Text>
              <Text style={styles.messageText}>
                Add your colleges, companies, majors and roots to link up with everyone who shares them.
              </Text>
              <Button title="Add your background" onPress={() => router.push('/background')} />
            </View>
          ) : graph ? (
            <View style={styles.summary}>
              <Text style={styles.summaryText}>
                <Text style={styles.summaryCount}>{people}</Text> people going · tap anyone to see what you share
              </Text>
              <Pressable
                onPress={() => setSelectedId(meId)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.findMe, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.findMeText}>Find me</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const ALL_KINDS: ReadonlySet<HubKind> = new Set(HUB_KINDS);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FCFCFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { gap: 16, alignItems: 'center', maxWidth: 320 },
  messageText: { fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center' },
  top: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 18, fontWeight: '700', color: colors.navy },
  brandShpe: { fontWeight: '800', color: colors.orange, letterSpacing: 0.5 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.orange,
  },
  avatarText: { color: colors.surface, fontSize: 13, fontWeight: '700' },
  filters: { gap: 8 },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    ...glass,
  },
  filterOff: { backgroundColor: 'rgba(244, 242, 238, 0.85)', boxShadow: 'none' },
  filterText: { fontSize: 14, fontWeight: '500', color: colors.text },
  bottom: { flex: 1, justifyContent: 'flex-end', padding: 16 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'center',
    maxWidth: 480,
    width: '100%',
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 24,
    ...glass,
  },
  summaryText: { flex: 1, fontSize: 13, color: colors.muted },
  summaryCount: { fontWeight: '700', color: colors.text },
  findMe: { backgroundColor: colors.navy, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  findMeText: { color: colors.surface, fontSize: 14, fontWeight: '600' },
  callout: {
    alignSelf: 'center',
    maxWidth: 480,
    width: '100%',
    gap: 10,
    padding: 20,
    borderRadius: 16,
    ...glass,
  },
  calloutTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
});
