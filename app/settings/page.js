import {
  addFamilyMemberAction,
  addFlaggedTaskAction,
  removeFamilyMemberAction,
  removeFlaggedTaskAction,
  savePreferencesAction
} from '@/app/actions';
import { getSettingsData } from '@/lib/data';
import { getHouseholdIdOrThrow } from '@/lib/session';

function Card({ title, children }) {
  return (
    <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </article>
  );
}

export default async function SettingsPage() {
  const householdId = await getHouseholdIdOrThrow();
  const data = await getSettingsData(householdId);

  return (
    <section className="space-y-6">
      <Card title="Connected Accounts">
        <p className="mb-3 text-sm text-slate-600">
          Google Calendar + Gmail connection status: <span className="font-semibold text-slate-800">{data.token?.email || 'Not connected'}</span>
        </p>
        <a
          href="/api/auth/google/start"
          className="inline-flex rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Connect Google Account
        </a>
      </Card>

      <Card title="Delivery Preferences">
        <form action={savePreferencesAction} className="grid gap-4 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700">Send time</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              defaultValue={data.preference?.send_time || '04:00'}
              name="send_time"
              required
              type="time"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700">Timezone</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              defaultValue={data.preference?.timezone || 'America/New_York'}
              name="timezone"
              placeholder="America/New_York"
              required
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700">Recipient email</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              defaultValue={data.preference?.recipient_email || data.token?.email || ''}
              name="recipient_email"
              placeholder="briefing@example.com"
              type="email"
            />
          </label>

          <div className="md:col-span-3">
            <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700" type="submit">
              Save Preferences
            </button>
          </div>
        </form>
      </Card>

      <Card title="Family Members">
        <form action={addFamilyMemberAction} className="grid gap-3 md:grid-cols-4">
          <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" name="name" placeholder="Name" required />
          <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" name="role" placeholder="Role (partner, child, au pair)" />
          <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" name="phone" placeholder="Phone" />
          <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" name="email" placeholder="Email" type="email" />
          <div className="md:col-span-4">
            <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700" type="submit">
              Add Family Member
            </button>
          </div>
        </form>

        <ul className="mt-4 space-y-2 text-sm">
          {data.familyMembers.length === 0 ? (
            <li className="text-slate-500">No family members added yet.</li>
          ) : (
            data.familyMembers.map((member) => (
              <li className="flex items-center justify-between rounded-md border border-slate-200 p-3" key={member.id}>
                <div>
                  <p className="font-medium text-slate-800">{member.name}</p>
                  <p className="text-xs text-slate-500">{member.role || 'No role'} | {member.phone || 'No phone'} | {member.email || 'No email'}</p>
                </div>
                <form action={removeFamilyMemberAction}>
                  <input name="member_id" type="hidden" value={member.id} />
                  <button className="text-xs font-semibold text-rose-600 hover:text-rose-500" type="submit">
                    Remove
                  </button>
                </form>
              </li>
            ))
          )}
        </ul>
      </Card>

      <Card title="Flagged Tasks">
        <form action={addFlaggedTaskAction} className="grid gap-3 md:grid-cols-3">
          <input className="rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2" name="task" placeholder="Task description" required />
          <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" name="source" placeholder="Source (school, house, travel)" />
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block font-medium text-slate-700">Due at (optional)</span>
            <input className="w-full rounded-md border border-slate-300 px-3 py-2" name="due_at" type="datetime-local" />
          </label>
          <div className="flex items-end">
            <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700" type="submit">
              Add Task
            </button>
          </div>
        </form>

        <ul className="mt-4 space-y-2 text-sm">
          {data.tasks.length === 0 ? (
            <li className="text-slate-500">No tasks yet.</li>
          ) : (
            data.tasks.map((task) => (
              <li className="flex items-center justify-between rounded-md border border-slate-200 p-3" key={task.id}>
                <div>
                  <p className="font-medium text-slate-800">{task.task}</p>
                  <p className="text-xs text-slate-500">{task.source || 'manual'} {task.due_at ? `| due ${new Date(task.due_at).toLocaleString()}` : ''}</p>
                </div>
                <form action={removeFlaggedTaskAction}>
                  <input name="task_id" type="hidden" value={task.id} />
                  <button className="text-xs font-semibold text-rose-600 hover:text-rose-500" type="submit">
                    Remove
                  </button>
                </form>
              </li>
            ))
          )}
        </ul>
      </Card>
    </section>
  );
}
