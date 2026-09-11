import { useEffect, useState } from 'react';
import {
  Play, Square, CheckCircle2, Wifi, WifiOff, Truck,
  PackageCheck, Navigation, Loader2,
} from 'lucide-react';
import { supabase, type OrderRow } from '../../lib/supabase';
import { useProfile } from '../../lib/hooks/useProfile';
import { useDriverTracking } from './useDriverTracking';

const ACTIVE_STATUSES = ['confirmed', 'dispatched', 'picked', 'in_transit'] as const;

interface NextAction {
  next: string;
  label: string;
  Icon: typeof PackageCheck;
  className: string;
}

function nextActionFor(status: string): NextAction | null {
  switch (status) {
    case 'confirmed':
    case 'dispatched':
      return {
        next: 'picked',
        label: 'Picked up',
        Icon: PackageCheck,
        className: 'bg-blue-600 hover:bg-blue-700',
      };
    case 'picked':
      return {
        next: 'in_transit',
        label: 'In transit',
        Icon: Navigation,
        className: 'bg-indigo-600 hover:bg-indigo-700',
      };
    case 'in_transit':
      return {
        next: 'delivered',
        label: 'Delivered',
        Icon: CheckCircle2,
        className: 'bg-green-600 hover:bg-green-700',
      };
    default:
      return null;
  }
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Confirmed',
  dispatched: 'Dispatched',
  picked: 'Picked up',
  in_transit: 'In transit',
  delivered: 'Delivered',
};

const MILESTONES = ['picked', 'in_transit', 'delivered'] as const;
const MILESTONE_LABEL: Record<string, string> = {
  picked: 'Picked up',
  in_transit: 'Transit',
  delivered: 'Delivered',
};

function milestoneIndex(status: string): number {
  switch (status) {
    case 'confirmed':
    case 'dispatched':
      return -1; // nothing reached yet
    case 'picked':
      return 0;
    case 'in_transit':
      return 1;
    case 'delivered':
      return 2;
    default:
      return -1;
  }
}

export function DriverShift() {
  const { profile } = useProfile();
  const [onShift, setOnShift] = useState(false);
  const [activeOrders, setActiveOrders] = useState<OrderRow[]>([]);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [shiftBusy, setShiftBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { isTracking, queueSize, lastSentAt, lastError, flush } = useDriverTracking({ enabled: onShift });

  // Fetch the driver's active orders.
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('assigned_driver_id', profile.id)
        .in('status', [...ACTIVE_STATUSES])
        .order('created_at');
      if (error) setErr(error.message);
      if (!cancelled) setActiveOrders((data as OrderRow[]) ?? []);
    };

    void load();
    const ch = supabase
      .channel(`driver-orders-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `assigned_driver_id=eq.${profile.id}` },
        () => { void load(); },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [profile]);

  async function toggleShift() {
    if (!profile) return;
    setShiftBusy(true);
    setErr(null);
    // 'on_delivery' is managed by the DB trigger on order assignment;
    // here we only toggle available/offline.
    const next = onShift ? 'offline' : 'available';
    const { error } = await supabase.rpc('set_my_driver_status', { p_status: next });
    if (error) setErr(error.message);
    else setOnShift(!onShift);
    setShiftBusy(false);
  }

  async function advance(orderId: string, nextStatus: string) {
    setBusyOrderId(orderId);
    setErr(null);
    const { error } = await supabase
      .from('orders')
      .update({ status: nextStatus })
      .eq('id', orderId);
    if (error) {
      console.error('Failed to update order status', error);
      setErr(error.message);
    }
    // The realtime subscription above will refresh the list.
    setBusyOrderId(null);
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
          disabled={shiftBusy}
          className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
            onShift ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {onShift
            ? <><Square className="h-4 w-4" /> End shift</>
            : <><Play className="h-4 w-4" /> Start shift</>}
        </button>
      </header>

      <div className="flex items-center gap-3 rounded border border-slate-200 bg-white px-3 py-2 text-xs">
        {queueSize === 0
          ? <><Wifi className="h-3.5 w-3.5 text-green-600" /> In sync</>
          : <><WifiOff className="h-3.5 w-3.5 text-amber-600" /> {queueSize} fixes buffered
              <button className="underline" onClick={() => void flush()}>retry</button></>}
        {lastError && <span className="ml-auto text-red-600">{lastError}</span>}
      </div>

      {err && (
        <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-slate-600">
          Active deliveries
          {activeOrders.length > 0 && <span className="ml-1 text-slate-400">({activeOrders.length})</span>}
        </h2>

        {activeOrders.length === 0 && (
          <p className="text-sm text-slate-400">No active deliveries.</p>
        )}

        {activeOrders.map((o) => {
          const action = nextActionFor(o.status);
          const isBusy = busyOrderId === o.id;
          const step = milestoneIndex(o.status);

          return (
            <div key={o.id} className="rounded border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{o.delivery_address}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <Truck className="h-3.5 w-3.5" />
                    <span className="uppercase">{STATUS_LABEL[o.status] ?? o.status}</span>
                    <span>·</span>
                    <code className="rounded bg-slate-100 px-1">{o.tracking_code}</code>
                  </div>

                  {/* Milestone progress */}
                  <div className="mt-3 flex items-center gap-1">
                    {MILESTONES.map((_, i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded ${
                          i <= step ? 'bg-blue-600' : 'bg-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-slate-400">
                    {MILESTONES.map((m) => (
                      <span key={m}>{MILESTONE_LABEL[m]}</span>
                    ))}
                  </div>
                </div>

                {action && (
                  <button
                    onClick={() => advance(o.id, action.next)}
                    disabled={isBusy}
                    className={`flex shrink-0 items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${action.className}`}
                  >
                    {isBusy
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <action.Icon className="h-3.5 w-3.5" />}
                    {action.label}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
