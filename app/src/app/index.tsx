import { useAuth } from '@/auth/session';
import { supabase } from '@/lib/supabase';
import { Body, Button, Screen, Title } from '@/ui/kit';

// Placeholder home until the graph screen exists.
export default function Home() {
  const { profile } = useAuth();
  return (
    <Screen>
      <Title>Welcome, {profile?.full_name.split(' ')[0]}</Title>
      <Body>You’re in. The people graph and search are coming next.</Body>
      <Button title="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
