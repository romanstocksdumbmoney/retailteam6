import { NextResponse } from 'next/server';
import { processDueBriefings } from '@/lib/scheduler';

export const runtime = 'nodejs';

function authorized(request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return false;
  }

  const header = request.headers.get('authorization') || '';
  const token = header.replace('Bearer ', '').trim();
  return token === secret;
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processDueBriefings();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
