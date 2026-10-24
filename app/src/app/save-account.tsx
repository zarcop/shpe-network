import { router } from 'expo-router';

import { EmailCodeFlow } from '@/auth/email-code';
import { supabase } from '@/lib/supabase';
import { Button } from '@/ui/kit';

// A guest adds an email so they can sign in on another device later. The code proves the email is theirs,
// which is why email confirmations must stay on (config.toml, D17). Same account and profile, just saved.
export default function SaveAccount() {
  return (
    <EmailCodeFlow
      title="Save your account"
      intro="Add your email so you can come back on any device. We’ll send you a 6-digit code to confirm it."
      send={(email) => supabase.auth.updateUser({ email })}
      verify={async (email, token) => {
        const result = await supabase.auth.verifyOtp({ email, token, type: 'email_change' });
        if (!result.error) router.dismissTo('/profile');
        return result;
      }}
      extra={<Button title="Cancel" variant="secondary" onPress={() => router.back()} />}
    />
  );
}
