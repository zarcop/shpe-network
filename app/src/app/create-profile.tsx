import { profileErrorMessage } from '@/auth/errors';
import { useAuth } from '@/auth/session';
import { supabase } from '@/lib/supabase';
import { ProfileFields } from '@/profile/profile-form';
import type { ProfileInput } from '@/profile/validation';
import { Body, Button, Screen, Title } from '@/ui/kit';

export default function CreateProfile() {
  const { session, reloadProfile } = useAuth();

  async function create(value: ProfileInput) {
    // The id must be the signed-in user's; row level security refuses anything else.
    const { error } = await supabase.from('profiles').insert({ id: session!.user.id, ...value });
    // 23505: the profile already exists (a double tap, or another tab got there first), so just load it.
    if (error && error.code !== '23505') return profileErrorMessage(error);
    await reloadProfile();
    return null;
  }

  return (
    <Screen>
      <Title>Create your profile</Title>
      <Body>This is how other attendees and recruiters will find you. You can change it later.</Body>
      <ProfileFields
        initial={{ full_name: '', headline: '', linkedin_url: '', grad_year: '' }}
        submitTitle="Join the network"
        onSubmit={create}
      />
      <Button title="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
