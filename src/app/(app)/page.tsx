import Link from 'next/link';
import { canEdit, getSession } from '@/lib/data';
import { periodLabel, rupiah, statusLabel, tanggalWaktu } from '@/lib/labels';
import { CreatePeriodForm } from './create-period-form';

export default async function PeriodsPage() {
  const s = await getSession();
  const { data: periods } = await s.supabase.from('periods').select('period, status, created_at, locked_at').order('period', { ascending: false });
  const { data: runs } = await s.supabase.from('calc_runs').select('id, period, created_at').eq('is_current', true);
  const runIds = (runs ?? []).map((r) => r.id);
  const { data: results } = runIds.length
    ? await s.supabase.from('calc_results_effective').select('run_id, final_incentive').in('run_id', runIds)
    : { data: [] as { run_id: number; final_incentive: number }[] };

  const totals = new Map<number, { n: number; sum: number }>();
  for (const r of results ?? []) {
    const t = totals.get(r.run_id) ?? { n: 0, sum: 0 };
    t.n += 1;
    t.sum += Number(r.final_incentive);
    totals.set(r.run_id, t);
  }

  const now = new Date();
  const suggestion = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return (
    <div className="stack-lg">
      <div className="spread">
        <div>
          <h1>Periode</h1>
          <p className="muted">Satu periode = satu bulan perhitungan KPI dan insentif.</p>
        </div>
        {canEdit(s.role) && <CreatePeriodForm suggestion={suggestion} />}
      </div>

      {(periods ?? []).length === 0 ? (
        <div className="panel stack">
          <h2>Belum ada periode</h2>
          <p className="muted">Buat periode bulan ini, lalu upload template Penempatan sebagai langkah pertama.</p>
        </div>
      ) : (
        <div className="panel-flush">
          <table className="data">
            <thead>
              <tr>
                <th>Periode</th>
                <th>Status</th>
                <th className="num">Karyawan dihitung</th>
                <th className="num">Total insentif</th>
                <th>Terakhir dihitung</th>
              </tr>
            </thead>
            <tbody>
              {(periods ?? []).map((p) => {
                const run = (runs ?? []).find((r) => r.period === p.period);
                const t = run ? totals.get(run.id) : undefined;
                return (
                  <tr key={p.period}>
                    <td>
                      <Link href={`/periode/${p.period}`}>{periodLabel(p.period)}</Link>
                    </td>
                    <td>
                      <span className={`chip ${p.status === 'locked' ? 'chip-good' : p.status === 'draft' ? '' : 'chip-pink'}`}>{statusLabel(p.status)}</span>
                    </td>
                    <td className="num">{t?.n ?? '–'}</td>
                    <td className="num">{t ? rupiah(t.sum) : '–'}</td>
                    <td className="muted small">{run ? tanggalWaktu(run.created_at) : 'Belum'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
