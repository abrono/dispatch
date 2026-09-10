import { useEffect, useState } from 'react';
import { Play, Square, CheckCircle2, Wifi, WifiOff, Truck } from 'lucide-react';
import { supabase, type OrderRow } from '../../lib/supabase';
import { useProfile } from '../../lib/hooks/useProfile';
import { useDriverTracking } from './useDriverTracking';

export function DriverShift() {
  const { profile } = useProfile();
  const [onShift, setOnShift] = useState(false);
  const [activeOrders, setActiveOrders] = useState<OrderRow[]>([]);
  const [busy, setBusy] = useState(false);

  const { isTracking, queueSize, lastSentAt, lastError, flush } = useDriverTracking({ enabled: onShift });

  // Fetch the driver's active orders.
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('assigned_driver_id', profile.id)
        .in('status', ['confirmed', 'picked', 'dispatched', 'in_transit'])
        .order('created_at');
      if (!cancelled) setActiveOrders((data as OrderRow[]) ?? []);
    };

    load();
    const ch = supabase
      .channel(`driver-orders-${profile.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `assigned_driver_id=eq.${profile.id}` },
        () => { void load(); },
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [profile]);

  async function toggleShift() {
    if (!profile) return;
    setBusy(true);
    // Reflect the shift in driver_status. 'on_delivery' is managed by the DB
    // trigger on order assignment; here we only toggle available/offline.
    const next = onShift ? 'offline' : 'available';
    const { error } = await supabase.rpc('set_my_driver_status', { p_status: next });
    if (!error) setOnShift(!onShift);
    setBusy(false);
  }

  async function markDelivered(orderId: string) {
    setBusy(true);
    // The DB trigger flips profiles.driver_status back to 'available'
    // automatically once no other active order remains.
    await supabase.from('orders').update({ status: 'delivered' }).eq('id', orderId);
    setBusy(false);
  }

  if (!profile) return <div className="p-4">Loading…</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Driver shift</h1>
          <p className="text-xs text-slate-500">
            {isTracking ? 'Tracking active' : 'Tracking off'}
            {lastSentAt && ` · last sent ${new Date(lastSentAt).toLocaleTimeString()}`}
            {queueSize > 0 && ` · ${queueSize} queued`}
          </p>
        </div>
        <button
          onClick={toggleShift}
          disabled={busy}
          className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
            onShift ? 'bg-red-600' : 'bg-green-600'
          }`}
        >
          {onShift ? <><Square className="h-4 w-4" /> End shift</> : <><Play className="h-4 w-4" /> Start shift</>}
        </button>
      </header>

      <div className="flex items-center gap-3 rounded border border-slate-200 bg-white px-3 py-2 text-xs">
        {queueSize === 0
          ? <><Wifi className="h-3.5 w-3.5 text-green-600" /> In sync</>
          : <><WifiOff className="h-3.5 w-3.5 text-amber-600" /> {queueSize} fixes buffered
             <button className="underline" onClick={() => void flush()}>retry</button></>}
        {lastError && <span className="ml-auto text-red-600">{lastError}</span>}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-slate-600">Active deliveries</h2>
        {activeOrders.length === 0 && <p className="text-sm text-slate-400">No active deliveries.</p>}
        {activeOrders.map((o) => (
          <div key={o.id} className="rounded border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium">{o.delivery_address}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <Truck className="h-3.5 w-3.5" />
                  <span className="uppercase">{o.status.replace('_', ' ')}</span>
                  <span>·</span>
                  <code className="rounded bg-slate-100 px-1">{o.tracking_code}</code>
                </div>
              </div>
              <button
                onClick={() => markDelivered(o.id)}
                disabled={busy}
                className="flex items-center gap-1 rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Delivered
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
