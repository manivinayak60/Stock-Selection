import { NextResponse } from 'next/server';

import { runDailyPipeline } from '@/lib/market/pipeline';
import { requireOwnerUserId } from '@/lib/brokers/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function authorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');
  if (cronSecret && authorization === `Bearer ${cronSecret}`) return true;
  try {
    await requireOwnerUserId();
    return true;
  } catch {
    return false;
  }
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
    return NextResponse.json({ error: 'An EOD sync is already running. Please wait for it to finish.' }, { status: 409 });
  }
  const leaseToken = String(lease.data);
  let completed = false;
  try {
    const result = await runDailyPipeline(admin);
    completed = true;
    await admin.from('pipeline_events').insert({
      level: 'INFO',
      stage: 'DAILY_PIPELINE',
      message: `Completed ${result.marketDate} with ${result.candidates.length} validated candidates`,
      details: { runId: result.runId, marketDate: result.marketDate },
    });
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
    await admin.from('pipeline_events').insert({
      level: 'ERROR',
      stage: 'DAILY_PIPELINE',
      message: error instanceof Error ? error.message.slice(0, 1_000) : 'EOD pipeline failed',
      details: { triggeredAt: new Date().toISOString() },
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'EOD pipeline failed' },
      { status: 500 },
    );
  } finally {
    const released = await admin.rpc('release_swing_signal_pipeline_lease', {
      p_lease_token: leaseToken,
      p_completed: completed,
    });
    if (released.error) console.error('Unable to release EOD pipeline lease', released.error);
  }
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Cron authorization required' }, { status: 401 });
  }
  return run(request);
}

export const POST = run;
