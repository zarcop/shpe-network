import { useState } from 'react';

import { Button, ErrorText, Field } from '@/ui/kit';

import { parseProfileForm, type FieldErrors, type ProfileForm, type ProfileInput } from './validation';

// The profile fields, shared by "create your profile" and "edit profile". The caller decides how to save.
export function ProfileFields({
  initial,
  submitTitle,
  onSubmit,
}: {
  initial: ProfileForm;
  submitTitle: string;
  // Resolves to an error message to show, or null on success.
  onSubmit: (value: ProfileInput) => Promise<string | null>;
}) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const set = (field: keyof ProfileForm) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

  async function submit() {
    const parsed = parseProfileForm(form);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setSaveError(undefined);
    setBusy(true);
    const error = await onSubmit(parsed.value);
    setBusy(false);
    if (error) setSaveError(error);
  }

  return (
    <>
      <Field label="Full name" value={form.full_name} onChangeText={set('full_name')} autoComplete="name" error={errors.full_name} />
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
      <Button title={submitTitle} onPress={submit} busy={busy} />
    </>
  );
}
