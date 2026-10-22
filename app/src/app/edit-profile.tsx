import { router } from 'expo-router';

import { profileErrorMessage } from '@/auth/errors';
import { useAuth } from '@/auth/session';
import { supabase } from '@/lib/supabase';
import { ProfileFields } from '@/profile/profile-form';
import type { ProfileInput } from '@/profile/validation';
import { Button, Screen, Title } from '@/ui/kit';

export default function EditProfile() {
  const { profile, reloadProfile } = useAuth();
  const p = profile!;

  async function update(value: ProfileInput) {
    const { error } = await supabase.from('profiles').update(value).eq('id', p.id);
    if (error) return profileErrorMessage(error);
    await reloadProfile();
    router.dismissTo('/');
    return null;
  }

  return (
    <Screen>
      <Title>Edit profile</Title>
      <ProfileFields
        initial={{
          full_name: p.full_name,
          headline: p.headline ?? '',
          linkedin_url: p.linkedin_url ?? '',
          grad_year: p.grad_year ? String(p.grad_year) : '',
        }}
        submitTitle="Save profile"
        onSubmit={update}
      />
      <Button title="Cancel" variant="secondary" onPress={() => router.dismissTo('/')} />
    </Screen>
  );
}
