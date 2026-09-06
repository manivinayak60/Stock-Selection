import { NextResponse } from 'next/server';

import { requireUserId } from '@/lib/brokers/auth';
import { importFundamentalCsv, MAX_FUNDAMENTALS_CSV_BYTES } from '@/lib/market/fundamentals';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await requireUserId();
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > MAX_FUNDAMENTALS_CSV_BYTES) {
      return NextResponse.json({ error: 'Fundamentals CSV must be smaller than 2 MB' }, { status: 413 });
    }
    const sourceUrl = request.headers.get('x-fundamentals-source-url')?.trim() || undefined;
    if (sourceUrl && !/^https:\/\//i.test(sourceUrl)) {
      return NextResponse.json({ error: 'Fundamentals source URL must use HTTPS' }, { status: 400 });
    }
    const result = await importFundamentalCsv(createAdminClient(), await request.text(), {
      sourceUrl,
      sourceName: sourceUrl?.includes('screener.in') ? 'Screener.in export' : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fundamentals import failed';
    const status = message === 'AUTHENTICATION_REQUIRED' ? 401 : 400;
    return NextResponse.json({ error: status === 401 ? 'Authentication required' : message }, { status });
  }
}
