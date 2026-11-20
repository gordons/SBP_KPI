import { getSession, loadSettings } from '@/lib/data';
import { juta, pct, periodLabel } from '@/lib/labels';

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export default async function SettingPage({ searchParams }: { searchParams: Promise<{ tahun?: string }> }) {
  const sp = await searchParams;
  const year = /^\d{4}$/.test(sp.tahun ?? '') ? sp.tahun! : String(new Date().getFullYear());
  const s = await getSession();
  const period = `${year}-12`;
  let loaded: Awaited<ReturnType<typeof loadSettings>> | null = null;
  try {
    loaded = await loadSettings(s.supabase, period);
  } catch {
    loaded = null;
  }
  if (!loaded) {
    return (
      <div className="panel stack">
        <h1>Setting</h1>
        <p className="muted">Belum ada setting yang berlaku untuk tahun {year}.</p>
      </div>
    );
  }
  const { settings: st } = loaded;

  return (
    <div className="stack-lg">
      <div>
        <h1>Setting</h1>
        <p className="muted">
          Setting yang berlaku sampai {periodLabel(period)}. Halaman ini masih hanya-baca; pengubahan setting dibuat di langkah berikutnya.
        </p>
      </div>

      <section className="stack">
        <h2>Target toko {year}</h2>
        <div className="panel-flush">
          <table className="data">
            <thead>
              <tr>
                <th>Toko</th>
                {BULAN.map((b) => <th key={b} className="num">{b}</th>)}
              </tr>
            </thead>
            <tbody>
              {st.stores.map((store) => (
                <tr key={store.code}>
                  <td>{store.code}</td>
                  {BULAN.map((_, i) => {
                    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
                    return <td key={key} className="num">{juta(st.storeTargets[store.code]?.[key])}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack">
        <h2>Bobot KPI per jabatan</h2>
        <div className="panel-flush">
          <table className="data">
            <thead>
              <tr>
                <th>Jabatan</th>
                <th>Komponen</th>
                <th className="num">Bobot</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {st.templates.flatMap((t) =>
                t.components.map((c, i) => (
                  <tr key={t.position + c.code}>
                    <td>{i === 0 ? `${t.position}, ${t.name}` : ''}</td>
                    <td>{c.name}{c.cap != null && c.method === 'ratio' ? ` (maks. ${pct(c.cap, 0)})` : ''}</td>
                    <td className="num">{pct(c.weight, 0)}</td>
                    <td>{c.active ? <span className="chip chip-good">Aktif</span> : <span className="chip">Nonaktif</span>}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack">
        <h2>Tier insentif</h2>
        {Object.entries(st.tierTables).map(([code, t]) => (
          <div key={code} className="panel-flush">
            <table className="data">
              <thead>
                <tr>
                  <th>Skor minimal</th>
                  {Object.keys(t.rates).map((pos) => <th key={pos} className="num">{pos}</th>)}
                </tr>
              </thead>
              <tbody>
                {t.thresholds.map((th, i) => (
                  <tr key={th}>
                    <td>{pct(th, 0)}</td>
                    {Object.entries(t.rates).map(([pos, r]) => (
                      <td key={pos} className="num">{(r[i] * 100).toLocaleString('id-ID', { maximumFractionDigits: 4 })}%</td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td>Di bawah {pct(t.thresholds.at(-1) ?? 0, 0)}</td>
                  <td colSpan={Object.keys(t.rates).length} className="muted">{t.belowLabel}, tanpa insentif</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section className="stack">
        <h2>Aturan data</h2>
        <div className="panel stack small">
          <p><strong>Kategori omzet yang dihitung:</strong> {st.dataRules.salesCategoriesCounted.join(', ')}</p>
          <p><strong>Penyebab retur yang dihitung ke SP:</strong> {st.dataRules.returnCausesCounted === 'ALL' ? 'Semua penyebab' : st.dataRules.returnCausesCounted.join(', ')}</p>
          <p><strong>Kode absensi yang dihitung:</strong> {st.dataRules.absenceCodesCounted.join(', ')}</p>
          <p><strong>Bobot komponen nonaktif:</strong> {st.redistributeInactiveWeight ? 'Dialihkan proporsional ke komponen aktif' : 'Tidak dialihkan'}</p>
          <p><strong>Pembulatan insentif:</strong> Rp {st.incentiveRounding.toLocaleString('id-ID')}</p>
        </div>
      </section>
    </div>
  );
}
