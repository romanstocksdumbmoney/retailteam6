'use server';

import { revalidatePath } from 'next/cache';
import { getHouseholdIdOrThrow } from '@/lib/session';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getDateStringInTimeZone } from '@/lib/time';
import { generateBriefingForHousehold } from '@/lib/briefing';

export async function regenerateBriefingAction() {
  const householdId = await getHouseholdIdOrThrow();
  const supabase = getSupabaseAdmin();

  const { data: preference } = await supabase
    .from('preferences')
    .select('timezone')
    .eq('household_id', householdId)
    .maybeSingle();

  const today = getDateStringInTimeZone(new Date(), preference?.timezone || 'UTC');

  await generateBriefingForHousehold(householdId, {
    force: true,
    briefingDate: today
  });

  revalidatePath('/');
}

export async function savePreferencesAction(formData) {
  const householdId = await getHouseholdIdOrThrow();
  const supabase = getSupabaseAdmin();

  const payload = {
    household_id: householdId,
    send_time: formData.get('send_time') || '04:00',
    timezone: formData.get('timezone') || 'America/New_York',
    recipient_email: formData.get('recipient_email') || null
  };

  const { error } = await supabase.from('preferences').upsert(payload, { onConflict: 'household_id' });

  if (error) {
    throw error;
  }

  revalidatePath('/settings');
  revalidatePath('/');
}

export async function addFamilyMemberAction(formData) {
  const householdId = await getHouseholdIdOrThrow();
  const supabase = getSupabaseAdmin();

  const name = `${formData.get('name') || ''}`.trim();
  if (!name) {
    throw new Error('Family member name is required.');
  }

  const payload = {
    household_id: householdId,
    name,
    role: `${formData.get('role') || ''}`.trim() || null,
    phone: `${formData.get('phone') || ''}`.trim() || null,
    email: `${formData.get('email') || ''}`.trim() || null
  };

  const { error } = await supabase.from('family_members').insert(payload);

  if (error) {
    throw error;
  }

  revalidatePath('/settings');
}

export async function removeFamilyMemberAction(formData) {
  const householdId = await getHouseholdIdOrThrow();
  const supabase = getSupabaseAdmin();

  const id = `${formData.get('member_id') || ''}`.trim();
  if (!id) {
    return;
  }

  await supabase.from('family_members').delete().eq('household_id', householdId).eq('id', id);
  revalidatePath('/settings');
}

export async function addFlaggedTaskAction(formData) {
  const householdId = await getHouseholdIdOrThrow();
  const supabase = getSupabaseAdmin();

  const task = `${formData.get('task') || ''}`.trim();
  if (!task) {
    throw new Error('Task description is required.');
  }

  const dueAt = `${formData.get('due_at') || ''}`.trim();

  const payload = {
    household_id: householdId,
    task,
    source: `${formData.get('source') || 'manual'}`.trim() || 'manual',
    due_at: dueAt ? new Date(dueAt).toISOString() : null,
    is_flagged: true
  };

  const { error } = await supabase.from('flagged_tasks').insert(payload);

  if (error) {
    throw error;
  }

  revalidatePath('/settings');
  revalidatePath('/');
}

export async function removeFlaggedTaskAction(formData) {
  const householdId = await getHouseholdIdOrThrow();
  const supabase = getSupabaseAdmin();

  const id = `${formData.get('task_id') || ''}`.trim();
  if (!id) {
    return;
  }

  await supabase.from('flagged_tasks').delete().eq('household_id', householdId).eq('id', id);

  revalidatePath('/settings');
  revalidatePath('/');
}
