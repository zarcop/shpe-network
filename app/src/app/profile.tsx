import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/session';
import { loadMyHubs } from '@/background/data';
import { HUB_KINDS, HUB_LABELS, isEmpty, type Hubs } from '@/background/hubs';
import { supabase } from '@/lib/supabase';
import { Body, Button, Chip, Screen, Title } from '@/ui/kit';
import { colors } from '@/ui/theme';

// Your profile at a glance until the graph screen exists.
export default function Home() {
  const { profile } = useAuth();
  const [hubs, setHubs] = useState<Hubs | null>(null);
  const p = profile!;

  // Reload on every visit: you come back here after editing your background.
  useFocusEffect(
    useCallback(() => {
      loadMyHubs(p.id).then(setHubs, () => setHubs(null));
    }, [p.id]),
  );

  return (
    <Screen>
      <Title>{p.full_name}</Title>
      {p.headline ? <Body>{p.headline}</Body> : null}
      {p.grad_year ? <Body>Class of {p.grad_year}</Body> : null}

      {hubs && isEmpty(hubs) ? (
        <View style={styles.callout}>
          <Text style={styles.calloutTitle}>Add your background</Text>
          <Body>
            Your colleges, companies, majors and roots are what connect you to others. Upload your resume or LinkedIn
            PDF to fill it in, or add it yourself.
          </Body>
          <Button title="Add your background" onPress={() => router.push('/background')} />
        </View>
      ) : null}

      {hubs && !isEmpty(hubs)
        ? HUB_KINDS.filter((kind) => hubs[kind].length).map((kind) => (
            <View key={kind} style={styles.section}>
              <Text style={styles.sectionTitle}>{HUB_LABELS[kind].title}</Text>
              <View style={styles.chips}>
                {hubs[kind].map((name) => (
                  <Chip key={name} label={name} />
                ))}
              </View>
            </View>
          ))
        : null}

      {hubs && !isEmpty(hubs) ? (
        <Button title="Edit background" variant="secondary" onPress={() => router.push('/background')} />
      ) : null}
      <Button title="Edit profile" variant="secondary" onPress={() => router.push('/edit-profile')} />
      <Button title="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  callout: { gap: 12, padding: 16, borderRadius: 8, backgroundColor: colors.background },
  calloutTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  section: { gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
