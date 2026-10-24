import { useEffect, useState, type ReactNode } from 'react';

import { authErrorMessage } from '@/auth/errors';
import { codeSchema, emailSchema } from '@/auth/validation';
import { Body, Button, ErrorText, Field, Screen, Title } from '@/ui/kit';

// Matches auth.email.max_frequency in supabase/config.toml.
const RESEND_AFTER_SECONDS = 60;

type AuthResult = Promise<{ error: { code?: string; status?: number } | null }>;

// "Type your email, then the 6-digit code we sent": shared by signing in and by a guest saving their account.
// Both steps live on one screen so the email stays in memory, never in the URL or browser history.
export function EmailCodeFlow({
  title,
  intro,
  send,
  verify,
  extra,
}: {
  title: string;
  intro: string;
  send: (email: string) => AuthResult;
  verify: (email: string, code: string) => AuthResult;
  extra?: ReactNode;
}) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  return sentTo ? (
    <CodeStep email={sentTo} send={send} verify={verify} onChangeEmail={() => setSentTo(null)} />
  ) : (
    <EmailStep title={title} intro={intro} send={send} onSent={setSentTo} extra={extra} />
  );
}

function EmailStep({
  title,
  intro,
  send,
  onSent,
  extra,
}: {
  title: string;
  intro: string;
  send: (email: string) => AuthResult;
  onSent: (email: string) => void;
  extra?: ReactNode;
}) {
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
    const { error: sendError } = await send(parsed.data);
    setBusy(false);
    if (sendError) setError(authErrorMessage(sendError) ?? undefined);
    else onSent(parsed.data);
  }

  return (
    <Screen>
      <Title>{title}</Title>
      <Body>{intro}</Body>
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
      {extra}
    </Screen>
  );
}

function CodeStep({
  email,
  send,
  verify,
  onChangeEmail,
}: {
  email: string;
  send: (email: string) => AuthResult;
  verify: (email: string, code: string) => AuthResult;
  onChangeEmail: () => void;
}) {
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

  async function submit() {
    const parsed = codeSchema.safeParse(code);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError(undefined);
    // On success the caller (or the session change) moves the person on.
    const { error: verifyError } = await verify(email, parsed.data);
    setBusy(false);
    if (verifyError) setError(authErrorMessage(verifyError) ?? undefined);
  }

  async function resend() {
    setError(undefined);
    setNotice(undefined);
    const { error: sendError } = await send(email);
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
        onSubmitEditing={submit}
      />
      <ErrorText>{error}</ErrorText>
      {notice ? <Body>{notice}</Body> : null}
      <Button title="Continue" onPress={submit} busy={busy} />
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
