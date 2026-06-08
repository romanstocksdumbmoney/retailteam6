import { cookies } from 'next/headers';

export const HOUSEHOLD_COOKIE = 'daily_brief_household_id';

export async function getHouseholdIdOrThrow() {
  const cookieStore = await cookies();
  const householdId = cookieStore.get(HOUSEHOLD_COOKIE)?.value;

  if (!householdId) {
    throw new Error('Missing household session cookie. Reload the page and try again.');
  }

  return householdId;
}

export async function ensureHouseholdScaffold(supabase, householdId) {
  await supabase.from('households').upsert({ id: householdId }, { onConflict: 'id' });

  await supabase
    .from('preferences')
    .upsert({ household_id: householdId, send_time: '04:00', timezone: 'America/New_York' }, { onConflict: 'household_id' });
}
