import { NextResponse } from 'next/server';

import type { CandidateSnapshot } from '@/lib/trading';
import { candidateSessionDates } from '@/lib/market/nse';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const runResult = await supabase
    .from('market_scan_runs')
    .select('*')
    .order('market_date', { ascending: false })
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runResult.error) {
    return NextResponse.json({ error: 'Unable to load the latest market scan' }, { status: 500 });
  }
  if (!runResult.data) {
    return NextResponse.json(
      { error: 'No validated NSE scan is available. Run the EOD backfill first.' },
      { status: 503 },
    );
  }

  const candidateResult = await supabase
    .from('market_scan_candidates')
    .select('score,payload')
    .eq('run_id', runResult.data.id)
    .order('score', { ascending: false });
  if (candidateResult.error) {
    return NextResponse.json({ error: 'Unable to load ranked candidates' }, { status: 500 });
  }

  const historyResult = await supabase
    .from('market_scan_runs')
    .select('id,market_date,provider,status,universe_count,qualified_count,started_at')
    .order('started_at', { ascending: false })
    .limit(20);
  if (historyResult.error) {
    console.error('Unable to load market scan history', historyResult.error);
  }
  const eventResult = await supabase
    .from('pipeline_events')
    .select('level,stage,message,created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const storageResult = await createAdminClient().rpc('get_swing_signal_database_bytes');

  const marketDate = String(runResult.data.market_date);
  // Accept the two most recent expected weekday sessions. This covers a
  // one-day exchange holiday without treating a several-day-old weekday scan
  // as current.
  const acceptableSessions = candidateSessionDates(new Date(), 2)
    .map((date) => date.toISOString().slice(0, 10));
  return NextResponse.json({
    candidates: (candidateResult.data ?? []).map(
      (row) => row.payload as CandidateSnapshot,
    ),
    meta: {
      runId: runResult.data.id,
      marketDate,
      status: runResult.data.status,
      marketRegime: runResult.data.market_regime,
      universeCount: runResult.data.universe_count,
      receivedCount: runResult.data.received_count,
      validatedCount: runResult.data.validated_count,
      qualifiedCount: runResult.data.qualified_count,
      failedCount: runResult.data.failed_count,
      source: runResult.data.source,
      completedAt: runResult.data.completed_at,
      warnings: runResult.data.warnings ?? [],
      missingSymbols: runResult.data.missing_symbols ?? [],
      stale: !acceptableSessions.includes(marketDate),
      lastPipelineError: eventResult.error || !eventResult.data || eventResult.data.level !== 'ERROR' ? null : {
        stage: eventResult.data.stage,
        message: eventResult.data.message,
        createdAt: eventResult.data.created_at,
      },
      databaseBytes: storageResult.error ? null : Number(storageResult.data),
    },
    history: (historyResult.data ?? []).map((run) => ({
      id: run.id,
      marketDate: run.market_date,
      provider: run.provider,
      status: run.status,
      universeCount: run.universe_count,
      qualifiedCount: run.qualified_count,
      createdAt: run.started_at,
    })),
  });
}
