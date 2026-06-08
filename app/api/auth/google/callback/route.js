import { NextResponse } from 'next/server';
import {
  exchangeCodeForTokens,
  fetchGooglePrimaryEmail,
  persistGoogleCredentials
} from '@/lib/google';
import { getSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code || !state) {
    return NextResponse.redirect(new URL('/settings?error=missing-code', request.url));
  }

  try {
    const stateJson = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    const nonceFromCookie = request.cookies.get('daily_brief_google_nonce')?.value;

    if (!nonceFromCookie || nonceFromCookie !== stateJson.nonce) {
      return NextResponse.redirect(new URL('/settings?error=invalid-state', request.url));
    }

    const { client, tokens } = await exchangeCodeForTokens(code);
    const email = await fetchGooglePrimaryEmail(client);

    await persistGoogleCredentials({
      householdId: stateJson.householdId,
      email,
      tokens
    });

    const supabase = getSupabaseAdmin();

    await supabase
      .from('preferences')
      .upsert({ household_id: stateJson.householdId, recipient_email: email || null }, { onConflict: 'household_id' });

    const response = NextResponse.redirect(new URL('/settings?connected=1', request.url));
    response.cookies.delete('daily_brief_google_nonce');
    return response;
  } catch (error) {
    return NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent(error.message)}`, request.url));
  }
}
