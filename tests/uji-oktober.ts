// Laporan uji ulang: hasil aplikasi vs workbook Excel Oktober 2026.
// Jalankan: npm run uji-oktober
import fixture from './fixtures/okt-2026.json' with { type: 'json' };
import { calculate, SBP_SETTINGS_2026, type PeriodInput } from '../src/lib/engine';

const out = calculate(fixture.input as unknown as PeriodInput, SBP_SETTINGS_2026);
const rp = (n: number | null | undefined) => (n == null ? '-' : Math.round(n).toLocaleString('id-ID'));
const pct = (n: number | null | undefined) => (n == null ? '-' : (n * 100).toFixed(2) + '%');

console.log('\nSP: aplikasi vs Excel');
for (const e of fixture.expected.sp) {
  const r = out.results.find((x) => x.nik === e.nik)!;
  const ok = Math.abs((r.target ?? 0) - (e.target as number)) < 1 && (!e.achieve || Math.abs(r.score - (e.score as number)) < 1e-4);
  console.log(
    [ok ? 'COCOK ' : 'BEDA  ', e.name.padEnd(22), r.store, 'target', rp(r.target).padStart(15), 'skor', pct(e.achieve ? r.score : null).padStart(8), r.tierLabel.padStart(5), 'insentif', rp(r.incentive).padStart(11), '| Excel', rp(e.incentive as number)].join(' '),
  );
}
console.log('\nTL: target tim');
for (const e of fixture.expected.tl) {
  const r = out.results.find((x) => x.nik === e.nik)!;
  console.log(Math.abs((r.target ?? 0) - (e.target as number)) < 1 ? 'COCOK ' : 'BEDA  ', e.name.padEnd(22), rp(r.target), '| Excel', rp(e.target as number));
}
console.log('\nPeringatan:', out.warnings.length ? out.warnings : 'tidak ada');
