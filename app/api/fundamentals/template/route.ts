import { NextResponse } from 'next/server';

import {
  buildFundamentalTemplateCsv,
  selectFundamentalTemplateCandidates,
  type FundamentalTemplateRow,
} from '@/lib/market/fundamental-template';
import type { CandidateSnapshot } from '@/lib/trading';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const admin = createAdminClient();
  const runResult = await admin
    .from('market_scan_runs')
    .select('id,market_date')
    .eq('status', 'COMPLETED')
    .order('market_date', { ascending: false })
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runResult.error || !runResult.data) {
    return NextResponse.json(
      { error: 'Run an NSE EOD sync before downloading the shortlist template' },
      { status: 409 },
    );
  }

  const candidateResult = await admin
    .from('market_scan_candidates')
    .select('payload')
    .eq('run_id', runResult.data.id);
  if (candidateResult.error) {
    return NextResponse.json({ error: 'Unable to load the latest shortlist' }, { status: 500 });
  }
  const selected = selectFundamentalTemplateCandidates(
    (candidateResult.data ?? []).map((row) => row.payload as CandidateSnapshot),
  );
  if (!selected.length) {
    return NextResponse.json({ error: 'The latest scan has no shortlisted stocks' }, { status: 409 });
  }

  const fundamentalResult = await admin
    .from('fundamentals')
    .select('symbol,as_of_date,market_cap_cr,debt_equity,opm,roe,sales_growth,capital_adequacy,gross_npa,net_npa,source_name,source_url')
    .in('symbol', selected.map((candidate) => candidate.symbol))
    .order('as_of_date', { ascending: false });
  if (fundamentalResult.error) {
    return NextResponse.json({ error: 'Unable to load saved fundamentals' }, { status: 500 });
  }

  const marketDate = String(runResult.data.market_date);
  const csv = buildFundamentalTemplateCsv(
    selected,
    (fundamentalResult.data ?? []) as FundamentalTemplateRow[],
    marketDate,
  );
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="swing-signal-fundamentals-${marketDate}.csv"`,
      'cache-control': 'private, no-store, max-age=0',
    },
  });
}
