import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/session';
import { loadMyHubs } from '@/background/data';
import { HUB_KINDS, HUB_LABELS, isEmpty, type Hubs } from '@/background/hubs';
import { supabase } from '@/lib/supabase';
import { Body, Button, Chip, Screen, Title } from '@/ui/kit';
import { colors } from '@/ui/theme';

// Your own profile and background, reached from the graph's header.
export default function Profile() {
  const { profile, session } = useAuth();
  const [hubs, setHubs] = useState<Hubs | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const p = profile!;
  // A guest who signs out can never get back in: the account has no email to sign in with.
  const isGuest = !!session?.user.is_anonymous;

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

      {isGuest ? (
        <View style={styles.callout}>
          <Text style={styles.calloutTitle}>Save your account</Text>
          <Body>You joined as a guest, so your profile lives only in this browser. Add your email to keep it and come back on any device.</Body>
          <Button title="Save your account" onPress={() => router.push('/save-account')} />
        </View>
      ) : null}

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
      <Button title="Back to the graph" variant="secondary" onPress={() => router.dismissTo('/')} />
      {confirmSignOut && isGuest ? (
        <View style={styles.callout}>
          <Text style={styles.calloutTitle}>Sign out and lose your profile?</Text>
          <Body>Your account isn’t saved, so you won’t be able to sign back in. Save your account first to keep it.</Body>
          <Button title="Save your account" onPress={() => router.push('/save-account')} />
          <Button title="Sign out anyway" variant="secondary" onPress={() => supabase.auth.signOut()} />
          <Button title="Cancel" variant="secondary" onPress={() => setConfirmSignOut(false)} />
        </View>
      ) : (
        <Button
          title="Sign out"
          variant="secondary"
          onPress={() => (isGuest ? setConfirmSignOut(true) : supabase.auth.signOut())}
        />
      )}
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
