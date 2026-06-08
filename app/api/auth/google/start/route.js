import { NextResponse } from 'next/server';
import { getGoogleAuthUrl } from '@/lib/google';
import { HOUSEHOLD_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(request) {
  const householdId = request.cookies.get(HOUSEHOLD_COOKIE)?.value;

  if (!householdId) {
    return NextResponse.redirect(new URL('/settings?error=session-missing', request.url));
  }

  const nonce = crypto.randomUUID();
  const state = Buffer.from(JSON.stringify({ householdId, nonce })).toString('base64url');
  const authUrl = getGoogleAuthUrl(state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set({
    name: 'daily_brief_google_nonce',
    value: nonce,
    path: '/',
    maxAge: 600,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });

  return response;
}
