import 'server-only';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SBP_SETTINGS_2026 } from './engine/defaults';
import type { PeriodInput, Placement, Settings } from './engine/types';
import { supabaseServer } from './supabase/server';

export type Role = 'hr_admin' | 'hr_manager' | 'viewer';

export interface Session {
  supabase: SupabaseClient;
  userId: string;
  email: string;
  name: string;
  role: Role | null;
}

/** Pengguna yang sedang login beserta perannya. Belum login -> /login. */
export async function getSession(): Promise<Session> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('full_name, role').eq('user_id', user.id).maybeSingle();
  return {
    supabase,
    userId: user.id,
    email: user.email ?? '',
    name: profile?.full_name ?? user.email ?? '',
    role: (profile?.role as Role) ?? null,
  };
}

export const canEdit = (role: Role | null) => role === 'hr_admin' || role === 'hr_manager';

/** Supabase membatasi 1.000 baris per permintaan; ambil semua halaman. */
export async function fetchAll<T>(
  make: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await make(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < size) break;
  }
  return out;
}

/** Setting yang berlaku untuk periode: versi terbaru dengan tanggal berlaku <= periode, ditambah target toko. */
export async function loadSettings(supabase: SupabaseClient, period: string): Promise<{ versionId: number; settings: Settings }> {
  const { data: v, error } = await supabase
    .from('settings_versions')
    .select('id, payload')
    .lte('effective_from', period)
    .order('effective_from', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!v) throw new Error(`Belum ada setting yang berlaku untuk ${period}.`);

  const targets = await fetchAll<{ store_code: string; period: string; amount: number }>((a, b) =>
    supabase.from('store_monthly_targets').select('store_code, period, amount').order('period').range(a, b),
  );
  const storeTargets: Settings['storeTargets'] = {};
  for (const t of targets) (storeTargets[t.store_code] ??= {})[t.period] = Number(t.amount);

  const payload = v.payload as Omit<Settings, 'storeTargets'>;
  const settings: Settings = { ...payload, lists: payload.lists ?? SBP_SETTINGS_2026.lists, storeTargets };
  return { versionId: v.id, settings };
}

export interface CurrentUpload {
  id: number;
  kind: string;
  file_name: string;
  row_count: number;
  rejected_count: number;
  uploaded_at: string;
}

export async function currentUploads(supabase: SupabaseClient, period: string): Promise<CurrentUpload[]> {
  const { data, error } = await supabase
    .from('uploads')
    .select('id, kind, file_name, row_count, rejected_count, uploaded_at')
    .eq('period', period)
    .eq('is_current', true);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loadPlacements(supabase: SupabaseClient, period: string): Promise<Placement[]> {
  const rows = await fetchAll<{
    nik: string;
    position: string;
    store_code: string;
    superior_nik: string | null;
    facility: string | null;
    employees: { name: string; join_date: string } | null;
  }>((a, b) =>
    supabase
      .from('placements')
      .select('nik, position, store_code, superior_nik, facility, employees!placements_nik_fkey(name, join_date)')
      .eq('period', period)
      .order('nik')
      .range(a, b),
  );
  return rows.map((r) => ({
    nik: r.nik,
    name: r.employees?.name ?? r.nik,
    position: r.position,
    store: r.store_code,
    superiorNik: r.superior_nik,
    joinDate: r.employees?.join_date ?? '1900-01-01',
    facility: r.facility,
  }));
}

/** Semua data periode dalam format mesin hitung. */
export async function loadPeriodInput(supabase: SupabaseClient, period: string) {
  const uploads = await currentUploads(supabase, period);
  const id = (kind: string) => uploads.find((u) => u.kind === kind)?.id ?? -1;
  const placements = await loadPlacements(supabase, period);

  const [sales, returns, attendance, events] = await Promise.all([
    fetchAll<{ invoice_no: string; invoice_date: string; store_code: string; nik: string | null; amount: number; category: string }>((a, b) =>
      supabase.from('sales_rows').select('invoice_no, invoice_date, store_code, nik, amount, category').eq('upload_id', id('sales')).order('invoice_no').range(a, b),
    ),
    fetchAll<{ return_no: string; original_invoice_no: string | null; return_date: string; nik: string; amount: number; cause: string; has_ba: boolean }>((a, b) =>
      supabase.from('return_rows').select('return_no, original_invoice_no, return_date, nik, amount, cause, has_ba').eq('upload_id', id('returns')).order('return_no').range(a, b),
    ),
    fetchAll<{ nik: string; counts: Record<string, number> }>((a, b) =>
      supabase.from('attendance_rows').select('nik, counts').eq('upload_id', id('attendance')).order('nik').range(a, b),
    ),
    fetchAll<{ nik: string; indicator_code: string; event_date: string; value: number }>((a, b) =>
      supabase.from('event_rows').select('nik, indicator_code, event_date, value').eq('upload_id', id('events')).order('id').range(a, b),
    ),
  ]);

  const input: PeriodInput = {
    period,
    placements,
    sales: sales.map((x) => ({ invoiceNo: x.invoice_no, date: x.invoice_date, store: x.store_code, nik: x.nik, amount: Number(x.amount), category: x.category })),
    returns: returns.map((x) => ({ returnNo: x.return_no, originalInvoiceNo: x.original_invoice_no, date: x.return_date, nik: x.nik, amount: Number(x.amount), cause: x.cause, hasBA: x.has_ba })),
    attendance: attendance.map((x) => ({ nik: x.nik, counts: x.counts })),
    events: events.map((x) => ({ nik: x.nik, indicatorCode: x.indicator_code, date: x.event_date, value: Number(x.value) })),
  };
  return { input, uploads };
}
