import { google } from 'googleapis';
import { getSupabaseAdmin } from '@/lib/supabase';
import { formatDisplayDate } from '@/lib/time';
import { getAuthorizedGoogleClient } from '@/lib/google';

function toRawEmail({ recipient, subject, body }) {
  const email = [
    `To: ${recipient}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body
  ].join('\n');

  return Buffer.from(email).toString('base64url');
}

export async function sendBriefingEmail(householdId, briefing, preferences) {
  const supabase = getSupabaseAdmin();
  const { client, email } = await getAuthorizedGoogleClient(householdId);

  const recipient = preferences?.recipient_email || email;
  if (!recipient) {
    throw new Error('No recipient_email configured and Google profile email unavailable.');
  }

  const subject = `Daily Brief - ${formatDisplayDate(new Date(briefing.briefing_date), preferences?.timezone || 'UTC')}`;
  const body = [
    'Daily Brief',
    '',
    briefing.content,
    '',
    'Text to spouse/partner:',
    briefing.partner_text,
    '',
    'Text to caregiver/au pair:',
    briefing.caregiver_text
  ].join('\n');

  const gmail = google.gmail({ version: 'v1', auth: client });

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: toRawEmail({ recipient, subject, body })
    }
  });

  const { error } = await supabase
    .from('briefings')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', briefing.id);

  if (error) {
    throw error;
  }
}
