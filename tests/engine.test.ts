import { describe, expect, it } from 'vitest';
import fixture from './fixtures/okt-2026.json';
import { calculate, SBP_SETTINGS_2026, tenureMonths, type PeriodInput, type Settings } from '../src/lib/engine';

const input = fixture.input as unknown as PeriodInput;
const out = calculate(input, SBP_SETTINGS_2026);
const byNik = new Map(out.results.map((r) => [r.nik, r]));

describe('Uji ulang workbook Oktober 2026', () => {
  it('target SP sama dengan Excel (semua toko)', () => {
    for (const e of fixture.expected.sp) {
      expect(byNik.get(e.nik)!.target, e.name).toBeCloseTo(e.target as number, 0);
    }
  });

  it('skor, tarif, dan insentif SP sama dengan Excel (SP yang sudah ada achieve)', () => {
    for (const e of fixture.expected.sp.filter((x) => x.achieve)) {
      const r = byNik.get(e.nik)!;
      expect(r.score, e.name).toBeCloseTo(e.score as number, 4);
      expect(r.rate, e.name).toBe(e.rate === 'SP1' ? 0 : e.rate);
      expect(Math.abs(r.incentive - (e.incentive as number)), e.name).toBeLessThanOrEqual(1);
    }
  });

  it('target TL = jumlah target SP + target pribadi TL', () => {
    for (const e of fixture.expected.tl) {
      expect(byNik.get(e.nik)!.target, e.name).toBeCloseTo(e.target as number, 0);
    }
  });
});

describe('Aturan yang diperbaiki', () => {
  it('masa kerja dihitung dari akhir periode', () => {
    expect(tenureMonths('2018-01-01', '2026-10')).toBe(105);
    expect(tenureMonths('2025-10-10', '2026-10')).toBe(12);
    expect(tenureMonths('2026-06-08', '2026-10')).toBe(4);
  });

  it('tangga absensi memakai >= (2,5 hari -> 0,75)', () => {
    const inp: PeriodInput = { ...input, attendance: input.attendance.map((a) => (a.nik === '190107' ? { nik: a.nik, counts: { ALPA: 2.5 } } : a)) };
    const r = calculate(inp, SBP_SETTINGS_2026).results.find((x) => x.nik === '190107')!;
    expect(r.components.find((c) => c.code === 'ABSENSI')!.value).toBe(0.75);
  });

  it('SSR nonaktif: bobot dialihkan proporsional, total bobot tetap 100%', () => {
    const asm = out.results.find((r) => r.position === 'ASM')!;
    const total = asm.components.reduce((a, c) => a + c.weight, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(asm.components.find((c) => c.code === 'SSR')!.weight).toBe(0);
  });

  it('pembulatan insentif mengikuti setting', () => {
    const s: Settings = { ...SBP_SETTINGS_2026, incentiveRounding: 1000 };
    const r = calculate(input, s).results.find((x) => x.nik === '190023')!;
    expect(r.incentive % 1000).toBe(0);
  });

  it('non-individu masuk omzet toko, tidak ke omzet pribadi', () => {
    const inp: PeriodInput = { ...input, sales: [...input.sales, { invoiceNo: 'X1', date: '2026-10-05', store: 'MLN', nik: null, amount: 1_000_000_000, category: 'NORMAL' }] };
    const res = calculate(inp, SBP_SETTINGS_2026).results;
    const sm = res.find((r) => r.position === 'SM' && r.store === 'MLN')!;
    const before = out.results.find((r) => r.nik === sm.nik)!;
    expect(sm.incentiveBase - before.incentiveBase).toBe(1_000_000_000);
    expect(res.find((r) => r.nik === '190107')!.incentiveBase).toBe(byNik.get('190107')!.incentiveBase);
  });

  it('kategori IMPORT dan ONGKIR tidak dihitung', () => {
    const inp: PeriodInput = { ...input, sales: [...input.sales, { invoiceNo: 'X2', date: '2026-10-05', store: 'MLN', nik: '190107', amount: 500_000_000, category: 'IMPORT' }] };
    const r = calculate(inp, SBP_SETTINGS_2026).results.find((x) => x.nik === '190107')!;
    expect(r.incentiveBase).toBe(byNik.get('190107')!.incentiveBase);
  });
});
