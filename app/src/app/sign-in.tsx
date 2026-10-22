import { useEffect, useState } from 'react';

import { authErrorMessage } from '@/auth/errors';
import { codeSchema, emailSchema } from '@/auth/validation';
import { supabase } from '@/lib/supabase';
import { Body, Button, ErrorText, Field, Screen, Title } from '@/ui/kit';

// Matches auth.email.max_frequency in supabase/config.toml.
const RESEND_AFTER_SECONDS = 60;

// Both steps live on one screen so the email stays in memory, never in the URL or browser history.
export default function SignIn() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  return sentTo ? (
    <CodeStep email={sentTo} onChangeEmail={() => setSentTo(null)} />
  ) : (
    <EmailStep onSent={setSentTo} />
  );
}

function sendCode(email: string) {
  // One flow for new and returning people: Supabase creates the account on first sign-in.
  return supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
}

function EmailStep({ onSent }: { onSent: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError(undefined);
    const { error: sendError } = await sendCode(parsed.data);
    setBusy(false);
    if (sendError) setError(authErrorMessage(sendError) ?? undefined);
    else onSent(parsed.data);
  }

  return (
    <Screen>
      <Title>Find your people at SHPE</Title>
      <Body>Sign in or join with your email. We’ll send you a 6-digit code, no password needed.</Body>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@school.edu"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        returnKeyType="send"
        onSubmitEditing={submit}
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Send code" onPress={submit} busy={busy} />
    </Screen>
  );
}

function CodeStep({ email, onChangeEmail }: { email: string; onChangeEmail: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_AFTER_SECONDS);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function verify() {
    const parsed = codeSchema.safeParse(code);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError(undefined);
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: parsed.data, type: 'email' });
    // On success the session changes and the layout moves the person on; nothing to do here.
    setBusy(false);
    if (verifyError) setError(authErrorMessage(verifyError) ?? undefined);
  }

  async function resend() {
    setError(undefined);
    setNotice(undefined);
    const { error: sendError } = await sendCode(email);
    if (sendError) {
      setError(authErrorMessage(sendError) ?? undefined);
      return;
    }
    setCode('');
    setResendIn(RESEND_AFTER_SECONDS);
    setNotice('New code sent. Only the latest code works.');
  }

  return (
    <Screen>
      <Title>Check your email</Title>
      <Body>We sent a 6-digit code to {email}. It expires in 10 minutes.</Body>
      <Field
        label="Code"
        value={code}
        onChangeText={setCode}
        placeholder="123456"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={7}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={verify}
      />
      <ErrorText>{error}</ErrorText>
      {notice ? <Body>{notice}</Body> : null}
      <Button title="Continue" onPress={verify} busy={busy} />
      <Button
        title={resendIn > 0 ? `Send a new code in ${resendIn}s` : 'Send a new code'}
        variant="secondary"
        disabled={resendIn > 0}
        onPress={resend}
      />
      <Button title="Use a different email" variant="secondary" onPress={onChangeEmail} />
    </Screen>
  );
}
