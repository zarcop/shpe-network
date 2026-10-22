import { useState } from 'react';

import { profileErrorMessage } from '@/auth/errors';
import { useAuth } from '@/auth/session';
import { supabase } from '@/lib/supabase';
import { parseProfileForm, type FieldErrors, type ProfileForm } from '@/profile/validation';
import { Body, Button, ErrorText, Field, Screen, Title } from '@/ui/kit';

const empty: ProfileForm = { full_name: '', headline: '', linkedin_url: '', grad_year: '' };

export default function CreateProfile() {
  const { session, reloadProfile } = useAuth();
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const set = (field: keyof ProfileForm) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

  async function save() {
    const parsed = parseProfileForm(form);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setSaveError(undefined);
    setBusy(true);
    // The id must be the signed-in user's; row level security refuses anything else.
    const { error } = await supabase.from('profiles').insert({ id: session!.user.id, ...parsed.value });
    // 23505: the profile already exists (a double tap, or another tab got there first), so just load it.
    if (error && error.code !== '23505') {
      setBusy(false);
      setSaveError(profileErrorMessage(error) ?? undefined);
      return;
    }
    await reloadProfile();
  }

  return (
    <Screen>
      <Title>Create your profile</Title>
      <Body>This is how other attendees and recruiters will find you. You can change it later.</Body>
      <Field
        label="Full name"
        value={form.full_name}
        onChangeText={set('full_name')}
        autoComplete="name"
        error={errors.full_name}
      />
      <Field
        label="Headline (optional)"
        value={form.headline}
        onChangeText={set('headline')}
        placeholder="Mechanical Engineering student at UF"
        error={errors.headline}
      />
      <Field
        label="Graduation year (optional)"
        value={form.grad_year}
        onChangeText={set('grad_year')}
        placeholder="2027"
        keyboardType="number-pad"
        maxLength={4}
        error={errors.grad_year}
      />
      <Field
        label="LinkedIn profile (optional)"
        value={form.linkedin_url}
        onChangeText={set('linkedin_url')}
        placeholder="linkedin.com/in/your-name"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        error={errors.linkedin_url}
      />
      <ErrorText>{saveError}</ErrorText>
      <Button title="Join the network" onPress={save} busy={busy} />
      <Button title="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
