import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SBP_SETTINGS_2026 } from '../engine/defaults';
import type { ComponentResult, Settings } from '../engine/types';
import { fetchAll } from '../data';
import type { ExportData } from './types';

/** Mengambil semua data export untuk periode dari database (mengikuti hak akses pengguna). */
export async function loadExportData(supabase: SupabaseClient, period: string): Promise<ExportData> {
  const { data: p } = await supabase.from('periods').select('status').eq('period', period).maybeSingle();
  if (!p) throw new Error(`Periode ${period} tidak ditemukan.`);
  const { data: run } = await supabase
    .from('calc_runs')
    .select('id, created_at, settings_version_id')
    .eq('period', period)
    .eq('is_current', true)
    .maybeSingle();
  if (!run) throw new Error('Periode ini belum dihitung.');

  const [{ data: version }, results, placements, { data: approvals }, { data: profiles }] = await Promise.all([
    supabase.from('settings_versions').select('payload').eq('id', run.settings_version_id).maybeSingle(),
    fetchAll<{
      nik: string; position: string; store_code: string; tenure_months: number; target: number | null; score: number;
      tier_label: string; rate: number; incentive_base: number; incentive: number; override_value: number | null;
      override_reason: string | null; final_incentive: number; components: ComponentResult[]; warnings: string[];
    }>((a, b) => supabase.from('calc_results_effective').select('*').eq('run_id', run.id).order('nik').range(a, b)),
    fetchAll<{ nik: string; superior_nik: string | null; employees: { name: string; join_date: string } | null }>((a, b) =>
      supabase.from('placements').select('nik, superior_nik, employees!placements_nik_fkey(name, join_date)').eq('period', period).order('nik').range(a, b),
    ),
    supabase.from('approvals').select('decision, note, decided_by, decided_at').eq('period', period).order('decided_at'),
    supabase.from('profiles').select('user_id, full_name'),
  ]);
  if (!results.length) throw new Error('Hasil belum tersedia untuk akun Anda. Viewer hanya bisa mengunduh setelah periode dikunci.');

  const payload = (version?.payload ?? SBP_SETTINGS_2026) as Omit<Settings, 'storeTargets'>;
  const settings: Settings = { ...payload, lists: payload.lists ?? SBP_SETTINGS_2026.lists, storeTargets: {} };
  const pl = new Map(placements.map((x) => [x.nik, x]));
  const nameOf = (nik: string | null) => (nik ? pl.get(nik)?.employees?.name ?? nik : null);
  const who = new Map((profiles ?? []).map((x) => [x.user_id, x.full_name]));

  return {
    period,
    status: p.status,
    calculatedAt: run.created_at,
    settingsVersionId: run.settings_version_id,
    settings,
    generatedAt: new Date().toISOString(),
    approvals: (approvals ?? []).map((a) => ({ decision: a.decision, note: a.note, at: a.decided_at, by: who.get(a.decided_by) ?? '-' })),
    rows: results.map((r) => ({
      nik: r.nik,
      name: nameOf(r.nik) ?? r.nik,
      position: r.position,
      positionName: settings.lists.positions.find((x) => x.code === r.position)?.name ?? r.position,
      store: r.store_code,
      superiorName: nameOf(pl.get(r.nik)?.superior_nik ?? null),
      joinDate: pl.get(r.nik)?.employees?.join_date ?? null,
      tenureMonths: r.tenure_months,
      target: r.target == null ? null : Number(r.target),
      achieve: r.components[0]?.achieve ?? null,
      score: Number(r.score),
      tierLabel: r.tier_label,
      rate: Number(r.rate),
      incentiveBase: Number(r.incentive_base),
      incentive: Number(r.incentive),
      overrideValue: r.override_value == null ? null : Number(r.override_value),
      overrideReason: r.override_reason,
      finalIncentive: Number(r.final_incentive),
      components: r.components,
      warnings: r.warnings ?? [],
    })),
  };
}
