import { NextResponse } from 'next/server';

import { runDailyPipeline } from '@/lib/market/pipeline';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function authorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');
  if (cronSecret && authorization === `Bearer ${cronSecret}`) return true;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return Boolean(data?.claims?.sub);
}

async function run(request: Request) {
  if (!(await authorized(request))) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const admin = createAdminClient();
  const lease = await admin.rpc('acquire_swing_signal_pipeline_lease');
  if (lease.error) {
    console.error(lease.error);
    return NextResponse.json({ error: 'Unable to acquire the EOD pipeline lease' }, { status: 500 });
  }
  if (!lease.data) {
    return NextResponse.json({ error: 'An EOD sync is already running. Please wait two minutes.' }, { status: 409 });
  }
  let completed = false;
  try {
    const result = await runDailyPipeline(admin);
    completed = true;
    return NextResponse.json({
      ok: true,
      runId: result.runId,
      marketDate: result.marketDate,
      status: result.status,
      marketRegime: result.regime.label,
      validatedCount: result.candidates.length,
      qualifiedCount: result.candidates.filter((item) => item.status !== 'Watch').length,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'EOD pipeline failed' },
      { status: 500 },
    );
  } finally {
    const released = await admin.rpc('release_swing_signal_pipeline_lease', { p_completed: completed });
    if (released.error) console.error('Unable to release EOD pipeline lease', released.error);
  }
}

export const GET = run;
export const POST = run;
