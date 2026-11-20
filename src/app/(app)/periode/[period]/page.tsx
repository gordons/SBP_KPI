import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canEdit, getSession, loadPeriodInput, loadSettings, type Role, type Session } from '@/lib/data';
import { preflight } from '@/lib/import';
import { getTemplate, TEMPLATE_KINDS } from '@/lib/templates';
import { angka, KIND_LABEL, juta, pct, periodLabel, rupiah, STATUS_STEPS, statusLabel, tanggalWaktu } from '@/lib/labels';
import type { ComponentResult } from '@/lib/engine';
import { CalculateForm, TransitionForm, UploadForm } from './forms';

type Tab = 'upload' | 'cek' | 'hasil';

export default async function PeriodPage({
  params,
  searchParams,
}: {
  params: Promise<{ period: string }>;
  searchParams: Promise<{ tab?: string; jabatan?: string }>;
}) {
  const { period } = await params;
  const sp = await searchParams;
  if (!/^\d{4}-\d{2}$/.test(period)) notFound();
  const s = await getSession();
  const { data: p } = await s.supabase.from('periods').select('period, status').eq('period', period).maybeSingle();
  if (!p) notFound();

  const tab: Tab = sp.tab === 'cek' || sp.tab === 'hasil' ? sp.tab : p.status === 'draft' ? 'upload' : 'hasil';
  const stepIndex = STATUS_STEPS.findIndex((x) => x.code === p.status);
  const editable = canEdit(s.role) && (p.status === 'draft' || p.status === 'calculated');

  return (
    <div>
      <p className="small muted">
        <Link href="/">Periode</Link>
      </p>
      <h1>{periodLabel(period)}</h1>

      <ol className="ladder" aria-label="Status periode" style={{ listStyle: 'none', padding: 0 }}>
        {STATUS_STEPS.map((st, i) => (
          <li key={st.code} className={`rung ${i < stepIndex ? 'done' : i === stepIndex ? 'now' : ''}`} aria-current={i === stepIndex ? 'step' : undefined}>
            <strong>{st.label}</strong>
            <span>{st.hint}</span>
          </li>
        ))}
      </ol>

      <nav className="tabs" aria-label="Bagian periode">
        <Link href={`?tab=upload`} aria-current={tab === 'upload' ? 'page' : undefined}>Upload data</Link>
        <Link href={`?tab=cek`} aria-current={tab === 'cek' ? 'page' : undefined}>Cek &amp; hitung</Link>
        <Link href={`?tab=hasil`} aria-current={tab === 'hasil' ? 'page' : undefined}>Hasil &amp; persetujuan</Link>
      </nav>

      {tab === 'upload' && <UploadTab s={s} period={period} editable={editable} status={p.status} />}
      {tab === 'cek' && <CheckTab s={s} period={period} editable={editable} status={p.status} />}
      {tab === 'hasil' && <ResultTab s={s} period={period} status={p.status} role={s.role} jabatan={sp.jabatan} />}
    </div>
  );
}

// ---------------- Upload ----------------

async function UploadTab({ s, period, editable, status }: { s: Session; period: string; editable: boolean; status: string }) {
  const { settings } = await loadSettings(s.supabase, period);
  const { data: uploads } = await s.supabase
    .from('uploads')
    .select('id, kind, file_name, row_count, rejected_count, uploaded_at')
    .eq('period', period)
    .eq('is_current', true);
  const ids = (uploads ?? []).map((u) => u.id);
  const { data: rejections } = ids.length
    ? await s.supabase.from('upload_rejections').select('upload_id, row_number, reason').in('upload_id', ids).order('row_number').limit(2000)
    : { data: [] as { upload_id: number; row_number: number; reason: string }[] };
  const hasPlacement = (uploads ?? []).some((u) => u.kind === 'placement');

  return (
    <div className="stack">
      {!editable && (
        <p className="note note-info">
          Periode berstatus {statusLabel(status)}. Data hanya bisa diubah saat Draft atau Dihitung.
        </p>
      )}
      <div className="panel-flush upload-list">
        {TEMPLATE_KINDS.map((kind) => {
          const def = getTemplate(kind, settings);
          const u = (uploads ?? []).find((x) => x.kind === kind);
          const rej = (rejections ?? []).filter((r) => r.upload_id === u?.id);
          const blocked = kind !== 'placement' && !hasPlacement;
          return (
            <section key={kind} className="upload-item">
              <div>
                <h3>{def.title}</h3>
                <p className="small muted">{def.rowMeaning}</p>
                <a className="small" href={`/api/template/${kind}?period=${period}`}>Unduh template</a>
              </div>
              <div className="small">
                {u ? (
                  <>
                    <div><strong>{u.file_name}</strong></div>
                    <div className="muted">
                      {angka(u.row_count)} baris diterima, {tanggalWaktu(u.uploaded_at)}
                    </div>
                    {u.rejected_count > 0 && (
                      <details className="rejections">
                        <summary>{angka(new Set(rej.map((r) => r.row_number)).size)} baris ditolak, lihat alasannya</summary>
                        <ul>
                          {rej.map((r, i) => (
                            <li key={i}>Baris {r.row_number}: {r.reason}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                ) : (
                  <span className="muted">{kind === 'placement' ? 'Belum diupload. Upload ini lebih dulu.' : 'Belum diupload.'}</span>
                )}
              </div>
              <div>
                {editable &&
                  (blocked ? (
                    <span className="small muted">Upload Penempatan dulu</span>
                  ) : (
                    <UploadForm period={period} kind={kind} hasFile={!!u} />
                  ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- Cek & hitung ----------------

async function CheckTab({ s, period, editable, status }: { s: Session; period: string; editable: boolean; status: string }) {
  const { settings } = await loadSettings(s.supabase, period);
  const { input, uploads } = await loadPeriodInput(s.supabase, period);
  const check = preflight(input, settings, new Set(uploads.map((u) => u.kind)));
  const counts = input.placements.reduce<Record<string, number>>((a, p) => ((a[p.position] = (a[p.position] ?? 0) + 1), a), {});

  return (
    <div className="stack-lg">
      <section className="stack">
        <h2>Pemeriksaan data</h2>
        <p className="muted small">
          {Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'Belum ada karyawan di Penempatan'}
          {'. '}
          {angka(input.sales.length)} faktur, {angka(input.returns.length)} retur, {angka(input.attendance.length)} data absensi
        </p>
        {check.items.length === 0 ? (
          <p className="note note-ok">Semua data lengkap. Siap dihitung.</p>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {check.items.map((i, k) => (
              <p key={k} className={`note note-${i.level}`}>
                {i.message}
              </p>
            ))}
          </div>
        )}
      </section>

      {check.storeTotals.length > 0 && (
        <section className="stack">
          <div>
            <h2>Omzet per toko</h2>
            <p className="muted small">Cocokkan dengan total di sistem penjualan sebelum menghitung.</p>
          </div>
          <div className="panel-flush">
            <table className="data">
              <thead>
                <tr>
                  <th>Toko</th>
                  <th className="num">Faktur</th>
                  <th className="num">Total semua kategori</th>
                  <th className="num">Dihitung untuk KPI</th>
                  <th className="num">Tanpa NIK sales</th>
                  <th className="num">Target toko</th>
                  <th className="num">Pencapaian</th>
                </tr>
              </thead>
              <tbody>
                {check.storeTotals.map((t) => {
                  const target = settings.storeTargets[t.store]?.[period];
                  return (
                    <tr key={t.store}>
                      <td>{t.store}</td>
                      <td className="num">{angka(t.invoices)}</td>
                      <td className="num">{rupiah(t.total)}</td>
                      <td className="num">{rupiah(t.counted)}</td>
                      <td className="num">{rupiah(t.nonIndividual)}</td>
                      <td className="num">{juta(target)}</td>
                      <td className="num">{target ? pct(t.counted / target) : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel stack">
        <h2>Hitung KPI</h2>
        {editable ? (
          <>
            <p className="muted small">
              Perhitungan memakai setting yang berlaku untuk {periodLabel(period)}. Hitung ulang boleh dilakukan berkali-kali selama periode belum diajukan.
            </p>
            <CalculateForm period={period} disabled={!check.canCalculate} recalc={status === 'calculated'} />
          </>
        ) : (
          <p className="muted">Periode berstatus {statusLabel(status)}, tidak bisa dihitung ulang.</p>
        )}
      </section>
    </div>
  );
}

// ---------------- Hasil & persetujuan ----------------

interface ResultRow {
  nik: string;
  position: string;
  store_code: string;
  target: number | null;
  score: number;
  tier_label: string;
  incentive: number;
  final_incentive: number;
  override_value: number | null;
  components: ComponentResult[];
  warnings: string[];
}

const POS_ORDER = ['SM', 'ASM', 'TL', 'SP'];

async function ResultTab({ s, period, status, role, jabatan }: { s: Session; period: string; status: string; role: Role | null; jabatan?: string }) {
  const { data: run } = await s.supabase.from('calc_runs').select('id, created_at, warnings').eq('period', period).eq('is_current', true).maybeSingle();

  if (!run) {
    return (
      <div className="panel stack">
        <h2>Belum ada hasil</h2>
        <p className="muted">
          {role === 'viewer' ? 'Hasil tampil setelah periode dikunci.' : 'Upload data lalu klik Hitung KPI di bagian Cek & hitung.'}
        </p>
        {role !== 'viewer' && <Link className="btn" href="?tab=cek">Ke Cek &amp; hitung</Link>}
      </div>
    );
  }

  const [{ data: results }, { data: people }, { data: history }, { data: profiles }] = await Promise.all([
    s.supabase.from('calc_results_effective').select('nik, position, store_code, target, score, tier_label, incentive, final_incentive, override_value, components, warnings').eq('run_id', run.id),
    s.supabase.from('placements').select('nik, employees!placements_nik_fkey(name)').eq('period', period),
    s.supabase.from('approvals').select('decision, note, decided_by, decided_at').eq('period', period).order('decided_at', { ascending: false }),
    s.supabase.from('profiles').select('user_id, full_name'),
  ]);
  const name = new Map((people ?? []).map((x) => [x.nik, (x.employees as unknown as { name: string } | null)?.name ?? x.nik]));
  const who = new Map((profiles ?? []).map((x) => [x.user_id, x.full_name]));
  const all = ((results ?? []) as ResultRow[]).sort(
    (a, b) => POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position) || a.store_code.localeCompare(b.store_code) || (name.get(a.nik) ?? '').localeCompare(name.get(b.nik) ?? ''),
  );
  const positions = [...new Set(all.map((r) => r.position))].sort((a, b) => POS_ORDER.indexOf(a) - POS_ORDER.indexOf(b));
  const rows = jabatan ? all.filter((r) => r.position === jabatan) : all;
  const total = rows.reduce((a, r) => a + Number(r.final_incentive), 0);
  const earners = rows.filter((r) => Number(r.final_incentive) > 0).length;

  const decisions: string[] = [];
  if (status === 'calculated' && (role === 'hr_admin' || role === 'hr_manager')) decisions.push('submitted');
  if (status === 'submitted' && role === 'hr_manager') decisions.push('approved', 'rejected');
  if (status === 'approved' && role === 'hr_manager') decisions.push('locked', 'reopened');
  if (status === 'locked' && role === 'hr_manager') decisions.push('reopened');

  const DEC: Record<string, string> = { submitted: 'Diajukan', approved: 'Disetujui', rejected: 'Dikembalikan', locked: 'Dikunci', reopened: 'Dibuka kembali' };

  return (
    <div className="stack-lg">
      <div className="spread">
        <div>
          <h2>{rupiah(total)}</h2>
          <p className="muted small">
            Total insentif {jabatan ? `jabatan ${jabatan}` : 'semua jabatan'}. {earners} dari {rows.length} karyawan menerima insentif. Dihitung {tanggalWaktu(run.created_at)}.
          </p>
        </div>
        <div className="row small" role="group" aria-label="Saring jabatan">
          <Link className={`chip ${!jabatan ? 'chip-pink' : ''}`} href="?tab=hasil">Semua</Link>
          {positions.map((pos) => (
            <Link key={pos} className={`chip ${jabatan === pos ? 'chip-pink' : ''}`} href={`?tab=hasil&jabatan=${pos}`}>
              {pos}
            </Link>
          ))}
        </div>
      </div>

      <section className="panel stack">
        <div className="spread">
          <div>
            <h2>Unduh</h2>
            <p className="muted small">
              {status === 'locked'
                ? 'Periode sudah dikunci. File ini final untuk payroll.'
                : 'Periode belum dikunci. File diberi tanda DRAF dan angkanya masih bisa berubah.'}
            </p>
          </div>
          <div className="row">
            <a className="btn btn-primary" href={`/api/export/rekap?period=${period}`}>Rekap payroll (Excel)</a>
            <a className="btn" href={`/api/export/pa?period=${period}${jabatan ? `&jabatan=${jabatan}` : ''}`}>
              Form penilaian {jabatan ? jabatan : 'semua karyawan'} (PDF)
            </a>
          </div>
        </div>
      </section>

      {(run.warnings as string[]).length > 0 && (
        <div className="note note-warning small">
          {(run.warnings as string[]).map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
      )}

      <div className="panel-flush">
        <table className="data">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Jabatan</th>
              <th>Toko</th>
              <th className="num">Target</th>
              <th className="num">Pencapaian</th>
              <th className="num">Skor</th>
              <th>Tier</th>
              <th className="num">Insentif</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const main = r.components[0];
              return (
                <tr key={r.nik}>
                  <td>
                    <Link href={`/periode/${period}/karyawan/${r.nik}`}>{name.get(r.nik)}</Link>
                    <div className="small muted">{r.nik}{r.warnings.length ? `, ${r.warnings.length} catatan` : ''}</div>
                  </td>
                  <td>{r.position}</td>
                  <td>{r.store_code}</td>
                  <td className="num">{juta(r.target)}</td>
                  <td className="num">{main?.achieve != null ? juta(main.achieve) : '–'}</td>
                  <td className="num">{pct(Number(r.score), 2)}</td>
                  <td>
                    <span className={`chip ${r.tier_label === 'SP1' ? 'chip-bad' : 'chip-good'}`}>{r.tier_label}</span>
                  </td>
                  <td className="num">
                    {rupiah(Number(r.final_incentive))}
                    {r.override_value != null && <div className="small" style={{ color: 'var(--gold)' }}>override</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7}>Total</td>
              <td className="num">{rupiah(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <section className="panel stack">
        <h2>Persetujuan</h2>
        <p className="muted small">
          Status sekarang: <strong>{statusLabel(status)}</strong>.{' '}
          {status === 'calculated' && 'Periksa hasil, lalu ajukan ke HR Manager.'}
          {status === 'submitted' && (role === 'hr_manager' ? 'Periksa lalu setujui atau kembalikan.' : 'Menunggu keputusan HR Manager.')}
          {status === 'approved' && (role === 'hr_manager' ? 'Kunci periode agar hasil final untuk payroll.' : 'Menunggu HR Manager mengunci periode.')}
          {status === 'locked' && 'Hasil sudah final.'}
        </p>
        <TransitionForm period={period} decisions={decisions} />
        {(history ?? []).length > 0 && (
          <table className="data">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Keputusan</th>
                <th>Oleh</th>
                <th>Catatan</th>
              </tr>
            </thead>
            <tbody>
              {(history ?? []).map((h, i) => (
                <tr key={i}>
                  <td className="small">{tanggalWaktu(h.decided_at)}</td>
                  <td>{DEC[h.decision] ?? h.decision}</td>
                  <td>{who.get(h.decided_by) ?? '–'}</td>
                  <td className="small">{h.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
