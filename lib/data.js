import { getSupabaseAdmin } from '@/lib/supabase';
import { ensureHouseholdScaffold } from '@/lib/session';
import { getDateStringInTimeZone } from '@/lib/time';

export async function getDashboardData(householdId) {
  const supabase = getSupabaseAdmin();

  await ensureHouseholdScaffold(supabase, householdId);

  const { data: preference } = await supabase
    .from('preferences')
    .select('*')
    .eq('household_id', householdId)
    .maybeSingle();

  const timezone = preference?.timezone || 'UTC';
  const today = getDateStringInTimeZone(new Date(), timezone);

  const [{ data: token }, { data: familyMembers }, { data: tasks }, { data: briefing }] = await Promise.all([
    supabase.from('google_tokens').select('email,updated_at').eq('household_id', householdId).maybeSingle(),
    supabase.from('family_members').select('*').eq('household_id', householdId).order('created_at', { ascending: true }),
    supabase
      .from('flagged_tasks')
      .select('*')
      .eq('household_id', householdId)
      .eq('is_flagged', true)
      .order('due_at', { ascending: true }),
    supabase
      .from('briefings')
      .select('*')
      .eq('household_id', householdId)
      .eq('briefing_date', today)
      .order('created_at', { ascending: false })
      .maybeSingle()
  ]);

  return {
    timezone,
    today,
    preference: preference || null,
    token: token || null,
    familyMembers: familyMembers || [],
    tasks: tasks || [],
    briefing: briefing || null
  };
}

export async function getSettingsData(householdId) {
  const supabase = getSupabaseAdmin();

  await ensureHouseholdScaffold(supabase, householdId);

  const [{ data: preference }, { data: token }, { data: familyMembers }, { data: tasks }] = await Promise.all([
    supabase.from('preferences').select('*').eq('household_id', householdId).maybeSingle(),
    supabase.from('google_tokens').select('email,updated_at').eq('household_id', householdId).maybeSingle(),
    supabase.from('family_members').select('*').eq('household_id', householdId).order('created_at', { ascending: true }),
    supabase.from('flagged_tasks').select('*').eq('household_id', householdId).order('created_at', { ascending: true })
  ]);

  return {
    preference: preference || null,
    token: token || null,
    familyMembers: familyMembers || [],
    tasks: tasks || []
  };
}
