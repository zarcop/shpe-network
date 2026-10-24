import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef } from 'react';

import { AuthProvider, useAuth, type AuthStatus } from '@/auth/session';
import { SessionError } from '@/auth/session-error';
import { Loading } from '@/ui/kit';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AuthProvider>
  );
}

// Each screen is reachable only in its sign-in state; when the state changes, Expo Router moves the
// person to the first screen they're allowed on. Guards only steer navigation: row level security
// is what protects the data.
function RootNavigator() {
  const { status: current } = useAuth();
  // After sign-in the profile loads briefly. Unmounting the navigator for that would flash the
  // screen and drop navigation actions, so keep showing the last settled state until it resolves.
  const settled = useRef<AuthStatus | null>(null);
  if (current !== 'loading') settled.current = current;
  const status = settled.current;

  if (status === null) return <Loading />;
  if (status === 'error') return <SessionError />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'signed-out'}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'needs-profile'}>
        <Stack.Screen name="create-profile" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'ready'}>
        <Stack.Screen name="index" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="background" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="save-account" />
      </Stack.Protected>
    </Stack>
  );
}
