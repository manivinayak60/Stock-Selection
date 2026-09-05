import { createClient } from '@/lib/supabase/server';

export async function requireUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) throw new Error('AUTHENTICATION_REQUIRED');
  return userId;
}

export function nextSixAmIndia(now = new Date()) {
  const todaySixAmUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    30,
  );
  return new Date(now.getTime() < todaySixAmUtc ? todaySixAmUtc : todaySixAmUtc + 86_400_000);
}
