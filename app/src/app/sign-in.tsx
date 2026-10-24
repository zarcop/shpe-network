import { useState } from 'react';

import { EmailCodeFlow } from '@/auth/email-code';
import { authErrorMessage } from '@/auth/errors';
import { supabase } from '@/lib/supabase';
import { Body, Button, ErrorText, Screen, Title } from '@/ui/kit';

// Joining takes one tap: a guest account with no email (D17). Email codes are only for coming back on another
// device after saving your account.
export default function SignIn() {
  const [withEmail, setWithEmail] = useState(false);
  return withEmail ? (
    <EmailCodeFlow
      title="Welcome back"
      intro="Enter the email you saved your account with. We’ll send you a 6-digit code."
      // Returning people only, but creating the account too keeps one flow if they never saved one.
      send={(email) => supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })}
      verify={(email, token) => supabase.auth.verifyOtp({ email, token, type: 'email' })}
      extra={<Button title="Back" variant="secondary" onPress={() => setWithEmail(false)} />}
    />
  ) : (
    <Join onUseEmail={() => setWithEmail(true)} />
  );
}

function Join({ onUseEmail }: { onUseEmail: () => void }) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function join() {
    setBusy(true);
    setError(undefined);
    // On success the session changes and the layout moves the person on to create their profile.
    const { error: joinError } = await supabase.auth.signInAnonymously();
    setBusy(false);
    if (joinError) setError(authErrorMessage(joinError) ?? undefined);
  }

  return (
    <Screen>
      <Title>Find your people at SHPE</Title>
      <Body>See who’s going and what you have in common: colleges, companies, majors and roots. No email needed.</Body>
      <ErrorText>{error}</ErrorText>
      <Button title="Join now" onPress={join} busy={busy} />
      <Button title="Saved your account before? Sign in" variant="secondary" onPress={onUseEmail} />
    </Screen>
  );
}
