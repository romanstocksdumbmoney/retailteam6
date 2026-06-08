import { getSupabaseAdmin } from '@/lib/supabase';
import { getDateStringInTimeZone, getTimeStringInTimeZone } from '@/lib/time';
import { generateBriefingForHousehold } from '@/lib/briefing';
import { sendBriefingEmail } from '@/lib/gmail';

function isDueNow({ sendTime, timeZone, now }) {
  const nowHm = getTimeStringInTimeZone(now, timeZone);
  return nowHm === sendTime;
}

export async function processDueBriefings(now = new Date()) {
  const supabase = getSupabaseAdmin();

  const [{ data: preferences, error: preferencesError }, { data: connectedTokens, error: tokenError }] = await Promise.all([
    supabase.from('preferences').select('*'),
    supabase.from('google_tokens').select('household_id')
  ]);

  if (preferencesError) {
    throw preferencesError;
  }

  if (tokenError) {
    throw tokenError;
  }

  const connectedHouseholds = new Set((connectedTokens || []).map((row) => row.household_id));

  const outcomes = [];

  for (const pref of preferences || []) {
    const householdId = pref.household_id;
    const sendTime = pref.send_time || '04:00';
    const timeZone = pref.timezone || 'UTC';

    if (!connectedHouseholds.has(householdId)) {
      continue;
    }

    if (!isDueNow({ sendTime, timeZone, now })) {
      continue;
    }

    const localDate = getDateStringInTimeZone(now, timeZone);

    const { data: alreadySent } = await supabase
      .from('briefings')
      .select('id')
      .eq('household_id', householdId)
      .eq('briefing_date', localDate)
      .not('sent_at', 'is', null)
      .maybeSingle();

    if (alreadySent) {
      continue;
    }

    try {
      const briefing = await generateBriefingForHousehold(householdId, {
        force: true,
        briefingDate: localDate
      });

      await sendBriefingEmail(householdId, briefing, pref);

      outcomes.push({ householdId, status: 'sent' });
    } catch (error) {
      outcomes.push({ householdId, status: 'error', message: error.message });
    }
  }

  return {
    processedAt: now.toISOString(),
    outcomes
  };
}
