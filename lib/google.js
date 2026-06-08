import { google } from 'googleapis';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getDateStringInTimeZone } from '@/lib/time';

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send'
];

function required(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function buildGoogleOAuthClient() {
  return new google.auth.OAuth2(required('GOOGLE_CLIENT_ID'), required('GOOGLE_CLIENT_SECRET'), required('GOOGLE_REDIRECT_URI'));
}

export function getGoogleAuthUrl(state) {
  const client = buildGoogleOAuthClient();

  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: GOOGLE_SCOPES,
    state
  });
}

export async function exchangeCodeForTokens(code) {
  const client = buildGoogleOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  return { client, tokens };
}

export async function fetchGooglePrimaryEmail(oauthClient) {
  const oauth = google.oauth2({ version: 'v2', auth: oauthClient });
  const { data } = await oauth.userinfo.get();
  return data.email || null;
}

export async function persistGoogleCredentials({ householdId, email, tokens }) {
  const supabase = getSupabaseAdmin();

  const payload = {
    household_id: householdId,
    email,
    access_token: tokens.access_token ?? null,
    refresh_token: tokens.refresh_token ?? null,
    scope: tokens.scope ?? null,
    token_type: tokens.token_type ?? null,
    expiry_date: tokens.expiry_date ?? null,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('google_tokens').upsert(payload, { onConflict: 'household_id' });

  if (error) {
    throw error;
  }
}

export async function getAuthorizedGoogleClient(householdId) {
  const supabase = getSupabaseAdmin();
  const { data: tokenRecord, error } = await supabase
    .from('google_tokens')
    .select('*')
    .eq('household_id', householdId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!tokenRecord) {
    throw new Error('Google account is not connected yet. Connect it from Settings.');
  }

  const client = buildGoogleOAuthClient();
  client.setCredentials({
    access_token: tokenRecord.access_token,
    refresh_token: tokenRecord.refresh_token,
    scope: tokenRecord.scope,
    token_type: tokenRecord.token_type,
    expiry_date: tokenRecord.expiry_date
  });

  const shouldRefresh = !tokenRecord.access_token || !tokenRecord.expiry_date || Number(tokenRecord.expiry_date) < Date.now() + 60_000;

  if (shouldRefresh && tokenRecord.refresh_token) {
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials({ ...client.credentials, ...credentials });

    await persistGoogleCredentials({
      householdId,
      email: tokenRecord.email,
      tokens: {
        access_token: client.credentials.access_token,
        refresh_token: client.credentials.refresh_token || tokenRecord.refresh_token,
        scope: client.credentials.scope,
        token_type: client.credentials.token_type,
        expiry_date: client.credentials.expiry_date
      }
    });
  }

  return {
    client,
    email: tokenRecord.email
  };
}

export async function fetchTodaysCalendarEvents(householdId, timeZone = 'UTC') {
  const { client } = await getAuthorizedGoogleClient(householdId);
  const calendar = google.calendar({ version: 'v3', auth: client });

  const windowStart = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();
  const today = getDateStringInTimeZone(new Date(), timeZone);

  const { data } = await calendar.events.list({
    calendarId: 'primary',
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 50,
    timeMin: windowStart,
    timeMax: windowEnd
  });

  const events = (data.items ?? [])
    .filter((event) => {
      if (event.start?.date) {
        return event.start.date === today;
      }

      if (event.start?.dateTime) {
        return getDateStringInTimeZone(new Date(event.start.dateTime), timeZone) === today;
      }

      return false;
    })
    .map((event) => ({
      id: event.id,
      summary: event.summary || '(No title)',
      location: event.location || '',
      description: event.description || '',
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      allDay: Boolean(event.start?.date)
    }));

  return events;
}

function readHeader(headers, target) {
  return headers?.find((header) => header.name?.toLowerCase() === target.toLowerCase())?.value || '';
}

export async function fetchRecentEmails(householdId) {
  const { client } = await getAuthorizedGoogleClient(householdId);
  const gmail = google.gmail({ version: 'v1', auth: client });

  const { data: messageList } = await gmail.users.messages.list({
    userId: 'me',
    q: 'newer_than:1d',
    maxResults: 15
  });

  const messages = messageList.messages ?? [];

  const detailed = await Promise.all(
    messages.slice(0, 10).map(async (item) => {
      const { data } = await gmail.users.messages.get({
        userId: 'me',
        id: item.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date']
      });

      const headers = data.payload?.headers || [];

      return {
        id: data.id,
        from: readHeader(headers, 'From'),
        subject: readHeader(headers, 'Subject') || '(No subject)',
        date: readHeader(headers, 'Date'),
        snippet: data.snippet || ''
      };
    })
  );

  return detailed;
}
