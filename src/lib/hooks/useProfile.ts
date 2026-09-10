import { useEffect, useState } from 'react';
import { supabase, type Profile } from '../supabase';

let cached: Profile | null = null;

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(cached);
  const [loading, setLoading] = useState(cached === null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        cached = null;
        if (!cancelled) { setProfile(null); setLoading(false); }
        return;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('id,user_id,email,full_name,phone,role,branch_id,driver_status,is_active')
        .eq('user_id', session.session.user.id)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) { setProfile(null); cached = null; }
      else { cached = data as Profile; setProfile(cached); }
      setLoading(false);
    }
// src/components/Loading.tsx
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-slate-500">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      {label}
    </div>
  );
}
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  return { profile, loading };
}

export function clearProfileCache() { cached = null; }
