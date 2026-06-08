import Link from 'next/link';
import { regenerateBriefingAction } from '@/app/actions';
import { getDashboardData } from '@/lib/data';
import { getHouseholdIdOrThrow } from '@/lib/session';

function EmptyState({ children }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">{children}</div>;
}

export default async function DashboardPage() {
  const householdId = await getHouseholdIdOrThrow();
  const data = await getDashboardData(householdId);

  return (
    <section className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 lg:col-span-2">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Today's Briefing Preview</h2>
              <p className="text-sm text-slate-500">Date: {data.today} ({data.timezone})</p>
            </div>
            <form action={regenerateBriefingAction}>
              <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500" type="submit">
                Regenerate
              </button>
            </form>
          </div>

          {data.briefing ? (
            <div className="space-y-5">
              <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-800">{data.briefing.content}</pre>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Spouse / Partner Text</p>
                  <p className="text-sm text-slate-700">{data.briefing.partner_text}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Caregiver / Au Pair Text</p>
                  <p className="text-sm text-slate-700">{data.briefing.caregiver_text}</p>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState>
              No briefing generated yet for today. Connect Google in <Link className="font-medium text-indigo-600 underline" href="/settings">Settings</Link> and press Regenerate.
            </EmptyState>
          )}
        </article>

        <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Briefing Delivery</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Connected account</dt>
              <dd className="font-medium text-slate-800">{data.token?.email || 'Not connected'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Send time</dt>
              <dd className="font-medium text-slate-800">{data.preference?.send_time || '04:00'} {data.preference?.timezone || 'UTC'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Recipient</dt>
              <dd className="font-medium text-slate-800">{data.preference?.recipient_email || data.token?.email || 'Not set'}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <a
              href="/api/auth/google/start"
              className="inline-flex rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Connect / Refresh Google
            </a>
          </div>
        </article>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h3 className="mb-3 text-base font-semibold">Flagged Household Tasks</h3>
          {data.tasks.length === 0 ? (
            <EmptyState>No flagged tasks. Add tasks from Settings to include them in each brief.</EmptyState>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.tasks.map((task) => (
                <li className="rounded-md border border-slate-200 p-3" key={task.id}>
                  <p className="font-medium text-slate-800">{task.task}</p>
                  <p className="text-xs text-slate-500">Source: {task.source || 'manual'}</p>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h3 className="mb-3 text-base font-semibold">Family Members in Briefing Context</h3>
          {data.familyMembers.length === 0 ? (
            <EmptyState>Add partner, caregiver, and children on the settings page for better briefing context.</EmptyState>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.familyMembers.map((member) => (
                <li className="rounded-md border border-slate-200 p-3" key={member.id}>
                  <p className="font-medium text-slate-800">{member.name}</p>
                  <p className="text-xs text-slate-500">{member.role || 'Role not set'}</p>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </section>
  );
}
