import { useState } from 'react';

import { supabase } from '@/lib/supabase';
import { Body, Button, Screen, Title } from '@/ui/kit';

import { useAuth } from './session';

export function SessionError() {
  const { reloadProfile } = useAuth();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    await reloadProfile();
    setBusy(false);
  }

  return (
    <Screen>
      <Title>We couldn’t load your profile</Title>
      <Body>Check your connection and try again.</Body>
      <Button title="Try again" onPress={retry} busy={busy} />
      <Button title="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
