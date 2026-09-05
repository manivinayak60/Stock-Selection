import { randomBytes } from 'node:crypto';

import { NextResponse } from 'next/server';

import { requireUserId } from '@/lib/brokers/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireUserId();
    const apiKey = process.env.KITE_API_KEY;
    const apiSecret = process.env.KITE_API_SECRET;
    const encryptionKey = process.env.BROKER_TOKEN_ENCRYPTION_KEY;
    if (!apiKey || !apiSecret || !encryptionKey) {
      return NextResponse.redirect(new URL('/?broker_error=zerodha_not_configured', request.url));
    }
    const state = randomBytes(24).toString('base64url');
    const login = new URL('https://kite.zerodha.com/connect/login');
    login.searchParams.set('v', '3');
    login.searchParams.set('api_key', apiKey);
    login.searchParams.set('redirect_params', new URLSearchParams({ state }).toString());
    const response = NextResponse.redirect(login);
    response.cookies.set('kite_oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
