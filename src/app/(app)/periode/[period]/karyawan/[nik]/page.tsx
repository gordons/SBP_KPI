import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canEdit, getSession } from '@/lib/data';
import { juta, pct, periodLabel, rupiah, tanggalWaktu } from '@/lib/labels';
import type { ComponentResult } from '@/lib/engine';
import { OverrideForm } from '../../forms';

const METHOD: Record<string, string> = { ratio: 'Rasio', step: 'Tangga', subordinate_pass: 'Kelulusan bawahan' };

function fmtValue(c: ComponentResult, v: number | null) {
  if (v == null) return '–';
  if (c.method === 'ratio') return juta(v);
  return v.toLocaleString('id-ID');
}

export default async function EmployeePage({ params }: { params: Promise<{ period: string; nik: string }> }) {
  const { period, nik } = await params;
  const s = await getSession();
  const [{ data: p }, { data: run }] = await Promise.all([
    s.supabase.from('periods').select('status').eq('period', period).maybeSingle(),
    s.supabase.from('calc_runs').select('id').eq('period', period).eq('is_current', true).maybeSingle(),
  ]);
  if (!p || !run) notFound();

  const [{ data: r }, { data: emp }, { data: overrides }, { data: profiles }] = await Promise.all([
    s.supabase.from('calc_results_effective').select('*').eq('run_id', run.id).eq('nik', nik).maybeSingle(),
    s.supabase.from('employees').select('name, join_date').eq('nik', nik).maybeSingle(),
    s.supabase.from('overrides').select('old_value, new_value, reason, created_by, created_at').eq('run_id', run.id).eq('nik', nik).order('id', { ascending: false }),
    s.supabase.from('profiles').select('user_id, full_name'),
  ]);
  if (!r) notFound();
  const who = new Map((profiles ?? []).map((x) => [x.user_id, x.full_name]));
  const comps = r.components as ComponentResult[];
  const editable = canEdit(s.role) && (p.status === 'draft' || p.status === 'calculated');

  return (
    <div className="stack-lg">
      <div>
        <p className="small muted">
          <Link href={`/periode/${period}?tab=hasil`}>{periodLabel(period)}</Link>
        </p>
        <h1>{emp?.name ?? nik}</h1>
        <div className="spread">
          <p className="muted">
            NIK {nik}, {r.position} di {r.store_code}, masa kerja {r.tenure_months} bulan
          </p>
          <a className="btn" href={`/api/export/pa?period=${period}&nik=${nik}`} target="_blank" rel="noopener">
            Form penilaian (PDF)
          </a>
        </div>
      </div>

      <div className="row" style={{ gap: 32, alignItems: 'flex-start' }}>
        <div>
          <div className="small muted">Skor</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{pct(Number(r.score), 2)}</div>
        </div>
        <div>
          <div className="small muted">Tier</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{r.tier_label}</div>
        </div>
        <div>
          <div className="small muted">Insentif</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--pink)' }}>{rupiah(Number(r.final_incentive))}</div>
          <div className="small muted">
            {Number(r.rate) > 0
              ? `${juta(Number(r.incentive_base))} × ${(Number(r.rate) * 100).toLocaleString('id-ID', { maximumFractionDigits: 4 })}%`
              : 'Skor di bawah ambang tier terendah'}
          </div>
        </div>
      </div>

      <section className="stack">
        <h2>Rincian komponen</h2>
        <div className="panel-flush">
          <table className="data">
            <thead>
              <tr>
                <th>Komponen</th>
                <th>Cara nilai</th>
                <th className="num">Target</th>
                <th className="num">Pencapaian</th>
                <th className="num">Nilai</th>
                <th className="num">Bobot</th>
                <th className="num">Nilai × bobot</th>
              </tr>
            </thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c.code}>
                  <td>
                    {c.name}
                    {c.status !== 'ok' && <div className="small muted">{c.status === 'inactive' ? 'Nonaktif, bobot dialihkan' : 'Tanpa data, bobot dialihkan'}</div>}
                  </td>
                  <td className="small">{METHOD[c.method]}</td>
                  <td className="num">{c.method === 'subordinate_pass' ? (c.target ?? '–') + ' orang' : fmtValue(c, c.target)}</td>
                  <td className="num">{c.method === 'subordinate_pass' ? (c.achieve ?? '–') + ' lulus' : fmtValue(c, c.achieve)}</td>
                  <td className="num">{c.value == null ? '–' : c.method === 'step' ? c.value.toLocaleString('id-ID') : pct(c.value, 2)}</td>
                  <td className="num">{pct(c.weight, 1)}</td>
                  <td className="num">{pct(c.weighted, 2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6}>Skor</td>
                <td className="num">{pct(Number(r.score), 2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {(r.warnings as string[]).length > 0 && (
          <div className="note note-warning small">
            {(r.warnings as string[]).map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
        )}
      </section>

      <section className="panel stack">
        <h2>Override insentif</h2>
        <p className="muted small">
          Insentif hasil hitung {rupiah(Number(r.incentive))}. Override dipakai untuk koreksi yang tidak bisa diselesaikan lewat upload ulang, dan selalu tercatat beserta alasannya.
        </p>
        {editable ? <OverrideForm period={period} nik={nik} /> : <p className="small muted">Override hanya bisa dilakukan saat periode berstatus Draft atau Dihitung.</p>}
        {(overrides ?? []).length > 0 && (
          <table className="data">
            <thead>
              <tr>
                <th>Waktu</th>
                <th className="num">Dari</th>
                <th className="num">Menjadi</th>
                <th>Alasan</th>
                <th>Oleh</th>
              </tr>
            </thead>
            <tbody>
              {(overrides ?? []).map((o, i) => (
                <tr key={i}>
                  <td className="small">{tanggalWaktu(o.created_at)}</td>
                  <td className="num">{rupiah(Number(o.old_value))}</td>
                  <td className="num">{rupiah(Number(o.new_value))}</td>
                  <td className="small">{o.reason}</td>
                  <td className="small">{who.get(o.created_by) ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
