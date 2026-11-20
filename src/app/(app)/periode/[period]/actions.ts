'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { calculate } from '@/lib/engine';
import { canEdit, getSession, loadPeriodInput, loadPlacements, loadSettings } from '@/lib/data';
import { parseUpload, preflight } from '@/lib/import';
import { TEMPLATE_KINDS, type TemplateKind } from '@/lib/templates';
import type { AttendanceRow, EventRow, Placement, ReturnRow, SalesRow } from '@/lib/engine';

export interface UploadState {
  kind: string;
  ok?: string;
  error?: string;
  warnings?: string[];
}

const MAX_BYTES = 15 * 1024 * 1024;

function toDbRows(kind: TemplateKind, rows: unknown[]): Record<string, unknown>[] {
  switch (kind) {
    case 'placement':
      return (rows as Placement[]).map((p) => ({
        nik: p.nik, name: p.name, join_date: p.joinDate, position: p.position,
        store_code: p.store, superior_nik: p.superiorNik, facility: p.facility,
      }));
    case 'sales':
      return (rows as SalesRow[]).map((x) => ({
        invoice_no: x.invoiceNo, invoice_date: x.date, store_code: x.store, nik: x.nik, amount: x.amount, category: x.category,
      }));
    case 'returns':
      return (rows as ReturnRow[]).map((x) => ({
        return_no: x.returnNo, original_invoice_no: x.originalInvoiceNo, return_date: x.date, nik: x.nik,
        amount: x.amount, cause: x.cause, has_ba: x.hasBA,
      }));
    case 'attendance':
      return (rows as AttendanceRow[]).map((x) => ({ nik: x.nik, counts: x.counts }));
    case 'events':
      return (rows as EventRow[]).map((x) => ({ nik: x.nik, indicator_code: x.indicatorCode, event_date: x.date, value: x.value }));
  }
}

export async function uploadFile(_prev: UploadState | null, form: FormData): Promise<UploadState> {
  const kind = String(form.get('kind')) as TemplateKind;
  const period = String(form.get('period'));
  const file = form.get('file');
  const fail = (error: string): UploadState => ({ kind, error });

  if (!TEMPLATE_KINDS.includes(kind)) return fail('Jenis template tidak dikenal.');
  if (!(file instanceof File) || file.size === 0) return fail('Pilih file .xlsx terlebih dahulu.');
  if (!file.name.toLowerCase().endsWith('.xlsx')) return fail('File harus berformat .xlsx. Simpan ulang dari Excel sebagai Excel Workbook.');
  if (file.size > MAX_BYTES) return fail('File lebih dari 15 MB. Hapus baris kosong atau kolom tambahan lalu coba lagi.');

  const s = await getSession();
  if (!canEdit(s.role)) return fail('Hanya HR Admin atau HR Manager yang bisa upload data.');

  try {
    const { settings } = await loadSettings(s.supabase, period);
    const placements = kind === 'placement' ? undefined : await loadPlacements(s.supabase, period);
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseUpload(kind, buffer, { period, settings, placements });
    if (parsed.fatal) return fail(parsed.fatal);

    const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '_');
    const path = `${period}/${kind}/${Date.now()}-${safe}`;
    const { error: upErr } = await s.supabase.storage.from('kpi-uploads').upload(path, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    if (upErr) return fail(`File gagal disimpan: ${upErr.message}`);

    const { error } = await s.supabase.rpc('replace_upload', {
      p_period: period,
      p_kind: kind,
      p_file_name: file.name,
      p_storage_path: path,
      p_rows: toDbRows(kind, parsed.rows),
      p_rejections: parsed.rejections.map((r) => ({
        row_number: r.row,
        reason: r.column ? `${r.column}: ${r.reason}` : r.reason,
        raw: null,
      })),
    });
    if (error) return fail(error.message);

    revalidatePath(`/periode/${period}`);
    revalidatePath('/');
    const rej = parsed.rejections.length ? `, ${new Set(parsed.rejections.map((r) => r.row)).size} baris ditolak` : '';
    return { kind, ok: `${parsed.rows.length} baris diterima${rej}.`, warnings: parsed.warnings };
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Upload gagal.');
  }
}

export async function runCalculation(_prev: string | null, form: FormData): Promise<string | null> {
  const period = String(form.get('period'));
  const s = await getSession();
  if (!canEdit(s.role)) return 'Hanya HR Admin atau HR Manager yang bisa menghitung.';

  try {
    const { versionId, settings } = await loadSettings(s.supabase, period);
    const { input, uploads } = await loadPeriodInput(s.supabase, period);
    const check = preflight(input, settings, new Set(uploads.map((u) => u.kind)));
    if (!check.canCalculate) return check.items.filter((i) => i.level === 'error').map((i) => i.message).join(' ');

    const out = calculate(input, settings);
    const { error } = await s.supabase.rpc('save_calc_run', {
      p_period: period,
      p_settings_version_id: versionId,
      p_warnings: out.warnings,
      p_results: out.results.map((r) => ({
        nik: r.nik, position: r.position, store_code: r.store, tenure_months: r.tenureMonths,
        target: r.target, score: r.score, tier_label: r.tierLabel, rate: r.rate,
        incentive_base: r.incentiveBase, incentive: r.incentive, components: r.components, warnings: r.warnings,
      })),
    });
    if (error) return error.message;
  } catch (e) {
    return e instanceof Error ? e.message : 'Perhitungan gagal.';
  }
  revalidatePath(`/periode/${period}`);
  revalidatePath('/');
  redirect(`/periode/${period}?tab=hasil`);
}

export async function changeStatus(_prev: string | null, form: FormData): Promise<string | null> {
  const period = String(form.get('period'));
  const decision = String(form.get('decision'));
  const note = String(form.get('note') ?? '');
  const s = await getSession();
  const { error } = await s.supabase.rpc('period_transition', { p_period: period, p_decision: decision, p_note: note });
  if (error) return error.message;
  revalidatePath(`/periode/${period}`);
  revalidatePath('/');
  return null;
}

export async function overrideIncentive(_prev: string | null, form: FormData): Promise<string | null> {
  const period = String(form.get('period'));
  const nik = String(form.get('nik'));
  const raw = String(form.get('value') ?? '').replace(/[^\d]/g, '');
  const reason = String(form.get('reason') ?? '').trim();
  if (raw === '') return 'Isi nilai insentif baru.';
  if (reason.length < 10) return 'Tulis alasan override minimal 10 karakter.';
  const s = await getSession();
  const { error } = await s.supabase.rpc('add_override', { p_period: period, p_nik: nik, p_new_value: Number(raw), p_reason: reason });
  if (error) return error.message;
  revalidatePath(`/periode/${period}`, 'layout');
  return null;
}
