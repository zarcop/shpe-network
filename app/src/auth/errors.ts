// Supabase Auth error codes → what to tell the person. Anything unexpected gets a generic retry
// message, so internal details never reach the screen.
export function authErrorMessage(error: { code?: string; status?: number } | null): string | null {
  if (!error) return null;
  switch (error.code) {
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many codes requested. Wait a minute, then try again.';
    case 'otp_expired':
      return 'That code is wrong or has expired. Check the latest email or send a new code.';
    case 'email_address_invalid':
      return 'That email address can’t receive codes. Try another one.';
  }
  if (error.status === 429) return 'Too many attempts. Wait a minute, then try again.';
  return 'Something went wrong. Check your connection and try again.';
}

// Postgres error codes from inserting a profile.
export function profileErrorMessage(error: { code?: string } | null): string | null {
  if (!error) return null;
  // 23514: a check constraint refused a value the app's own validation let through.
  if (error.code === '23514') return 'Some details don’t look right. Check the fields and try again.';
  return 'Couldn’t save your profile. Check your connection and try again.';
}
