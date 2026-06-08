import { NextResponse } from 'next/server';

const HOUSEHOLD_COOKIE = 'daily_brief_household_id';

export function proxy(request) {
  const response = NextResponse.next();

  if (!request.cookies.get(HOUSEHOLD_COOKIE)) {
    response.cookies.set({
      name: HOUSEHOLD_COOKIE,
      value: crypto.randomUUID(),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 365,
      path: '/'
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
