import { createAdminClient } from '@/lib/supabase/admin';

export async function enforceRateLimit(
  userId: string,
  bucket: string,
  limit: number,
  windowSeconds: number,
) {
  const { data, error } = await createAdminClient().rpc('consume_private_rate_limit', {
    p_user_id: userId,
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error(`Rate-limit check failed: ${error.message}`);
  if (!data) throw new Error('RATE_LIMITED');
}
