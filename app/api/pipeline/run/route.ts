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
  try {
    const result = await runDailyPipeline(createAdminClient());
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
  }
}

export const GET = run;
export const POST = run;
