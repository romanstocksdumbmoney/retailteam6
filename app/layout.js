import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'Daily Brief',
  description: 'Family Chief of Staff daily briefing app'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-8">
          <header className="mb-8 flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Family Chief of Staff</p>
              <h1 className="text-2xl font-bold text-slate-900">Daily Brief</h1>
            </div>
            <nav className="flex gap-3 text-sm font-medium">
              <Link className="rounded-md bg-white px-3 py-2 text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100" href="/">
                Dashboard
              </Link>
              <Link className="rounded-md bg-white px-3 py-2 text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100" href="/settings">
                Settings
              </Link>
            </nav>
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}
