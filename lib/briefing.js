import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '@/lib/supabase';
import { ensureHouseholdScaffold } from '@/lib/session';
import { fetchRecentEmails, fetchTodaysCalendarEvents } from '@/lib/google';

function parseClaudeJson(rawText) {
  const withoutCodeFence = rawText.replace(/```json|```/g, '').trim();
  const jsonCandidate = withoutCodeFence.match(/\{[\s\S]*\}/)?.[0];

  if (!jsonCandidate) {
    throw new Error('Claude response did not include valid JSON.');
  }

  return JSON.parse(jsonCandidate);
}

function reminderCandidates(events, emails, tasks) {
  const keywords = ['birthday', 'pickup', 'travel', 'flight', 'doctor', 'appointment', 'deadline', 'school'];

  const eventMatches = events
    .filter((event) => {
      const haystack = `${event.summary} ${event.description} ${event.location}`.toLowerCase();
      return keywords.some((keyword) => haystack.includes(keyword));
    })
    .map((event) => `Event reminder: ${event.summary}`);

  const emailMatches = emails
    .filter((email) => {
      const haystack = `${email.subject} ${email.snippet}`.toLowerCase();
      return keywords.some((keyword) => haystack.includes(keyword));
    })
    .map((email) => `Email watch item: ${email.subject}`);

  const taskMatches = tasks.map((task) => `Task: ${task.task}`);

  return [...eventMatches, ...emailMatches, ...taskMatches];
}

function buildPrompt({ familyMembers, events, emails, tasks, reminders, sendTime, timezone }) {
  return [
    'Create today\'s Daily Brief for a family chief of staff.',
    'Tone rules: warm, concise, executive-style. No fluff. Lead with what needs action today.',
    '',
    'Return STRICT JSON only with keys:',
    '{',
    '  "briefing_markdown": "string",',
    '  "partner_text": "string",',
    '  "caregiver_text": "string"',
    '}',
    '',
    'Required briefing sections (in this order):',
    '1) Action-first summary (top priorities for today)',
    '2) Schedule overview',
    '3) Time-sensitive reminders (birthdays, appointments, pickups, travel)',
    '4) Household tasks and dependencies',
    '5) Email watchlist (messages requiring attention)',
    '',
    `Configured send time: ${sendTime || '04:00'} ${timezone || 'UTC'}`,
    '',
    `Family members JSON: ${JSON.stringify(familyMembers)}`,
    `Events JSON: ${JSON.stringify(events)}`,
    `Emails JSON: ${JSON.stringify(emails)}`,
    `Flagged tasks JSON: ${JSON.stringify(tasks)}`,
    `Detected reminders JSON: ${JSON.stringify(reminders)}`,
    '',
    'Text drafting requirements:',
    '- Produce 2 short texts (max 280 chars each):',
    '  a) spouse/partner text that summarizes the day and includes one affirmation',
    '  b) caregiver/au pair text with logistics + one affirmation',
    '- Keep both texts kind, direct, and practical.'
  ].join('\n');
}

export async function generateBriefingForHousehold(householdId, options = {}) {
  const supabase = getSupabaseAdmin();
  const force = options.force ?? false;

  await ensureHouseholdScaffold(supabase, householdId);

  const { data: preference } = await supabase
    .from('preferences')
    .select('*')
    .eq('household_id', householdId)
    .maybeSingle();

  const timezone = preference?.timezone || 'UTC';
  const sendTime = preference?.send_time || '04:00';
  const briefingDate = options.briefingDate;

  if (!briefingDate) {
    throw new Error('generateBriefingForHousehold requires briefingDate (YYYY-MM-DD).');
  }

  if (!force) {
    const { data: existing } = await supabase
      .from('briefings')
      .select('*')
      .eq('household_id', householdId)
      .eq('briefing_date', briefingDate)
      .maybeSingle();

    if (existing) {
      return existing;
    }
  }

  const [{ data: familyMembers }, { data: tasks }] = await Promise.all([
    supabase.from('family_members').select('*').eq('household_id', householdId).order('created_at', { ascending: true }),
    supabase
      .from('flagged_tasks')
      .select('*')
      .eq('household_id', householdId)
      .eq('is_flagged', true)
      .order('due_at', { ascending: true })
  ]);

  const [events, emails] = await Promise.all([
    fetchTodaysCalendarEvents(householdId, timezone),
    fetchRecentEmails(householdId)
  ]);

  const reminders = reminderCandidates(events, emails, tasks || []);

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Missing environment variable: ANTHROPIC_API_KEY');
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1400,
    temperature: 0.35,
    system:
      'You are Daily Brief, an operations-minded family chief-of-staff assistant. Prioritize urgency, sequence, and clarity while staying warm and concise.',
    messages: [
      {
        role: 'user',
        content: buildPrompt({
          familyMembers: familyMembers || [],
          events,
          emails,
          tasks: tasks || [],
          reminders,
          sendTime,
          timezone
        })
      }
    ]
  });

  const rawText = response.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
  const parsed = parseClaudeJson(rawText);

  const payload = {
    household_id: householdId,
    briefing_date: briefingDate,
    content: parsed.briefing_markdown?.trim() || 'No briefing generated.',
    partner_text: parsed.partner_text?.trim() || '',
    caregiver_text: parsed.caregiver_text?.trim() || '',
    status: 'drafted',
    sent_at: null
  };

  const { data: saved, error } = await supabase
    .from('briefings')
    .upsert(payload, { onConflict: 'household_id,briefing_date' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return saved;
}
