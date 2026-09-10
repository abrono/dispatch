import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        // Staff are invite-only. shouldCreateUser: false means an email
        // that has no auth.users row will not silently create one.
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin + '/dashboard',
      },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-24 max-w-sm space-y-3 p-4">
      <h1 className="text-lg font-semibold">Staff sign in</h1>
      <p className="text-xs text-slate-500">
        Accounts are provisioned by invitation. Enter your work email to receive a sign-in link.
      </p>
      {sent ? (
        <div className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          Check your inbox for a sign-in link.
        </div>
      ) : (
        <>
          <input
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {err && <div className="text-xs text-red-600">{err}</div>}
          <button
            className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
          >
            {busy ? 'Sending…' : 'Send sign-in link'}
          </button>
        </>
      )}
    </form>
  );
}
