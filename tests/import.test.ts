import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/okt-2026.json';
import { calculate, SBP_SETTINGS_2026 as S, type PeriodInput, type Placement } from '../src/lib/engine';
import { parseUpload, preflight } from '../src/lib/import';
import { buildTemplate, getTemplate, TEMPLATE_KINDS, type TemplateKind } from '../src/lib/templates';

const input = fixture.input as unknown as PeriodInput;
const ctx = (placements?: Placement[]) => ({ period: '2026-10', settings: S, placements });

/** Simulasi HR mengisi template: tulis baris ke sheet Data template asli. */
async function fill(kind: TemplateKind, rows: Record<string, unknown>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildTemplate(kind, S));
  const ws = wb.getWorksheet('Data')!;
  const cols = getTemplate(kind, S).columns;
  rows.forEach((r, i) => cols.forEach((c, j) => {
    if (r[c.key] !== undefined) ws.getRow(i + 2).getCell(j + 1).value = r[c.key] as ExcelJS.CellValue;
  }));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const d = (iso: string) => new Date(iso + 'T00:00:00Z');

describe('Template', () => {
  it('kelima template bisa dibuat dan judul kolomnya sesuai definisi', async () => {
    for (const kind of TEMPLATE_KINDS) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await buildTemplate(kind, S));
      const ws = wb.getWorksheet('Data')!;
      const headers = (ws.getRow(1).values as unknown[]).slice(1);
      expect(headers).toEqual(getTemplate(kind, S).columns.map((c) => c.header));
      expect(wb.getWorksheet('Petunjuk')).toBeTruthy();
    }
  });
});

describe('Uji ujung ke ujung: isi template -> upload -> hitung', () => {
  it('hasilnya sama persis dengan hitung langsung dari data Oktober', async () => {
    const pl = await parseUpload('placement', await fill('placement', input.placements.map((p) => ({ ...p, joinDate: d(p.joinDate) }))), ctx());
    expect(pl.fatal).toBeNull();
    expect(pl.rejections).toEqual([]);
    const placements = pl.rows;

    const sales = await parseUpload('sales', await fill('sales', input.sales.map((x) => ({ ...x, date: d(x.date) }))), ctx(placements));
    const rets = await parseUpload('returns', await fill('returns', input.returns.map((x) => ({ ...x, date: d(x.date), cause: 'SALES', hasBA: 'YA' }))), ctx(placements));
    const att = await parseUpload('attendance', await fill('attendance', input.attendance.map((x) => ({ nik: x.nik, 'count:ALPA': x.counts.ALPA }))), ctx(placements));
    for (const r of [sales, rets, att]) expect(r.rejections).toEqual([]);

    const viaUpload = calculate({ period: '2026-10', placements, sales: sales.rows, returns: rets.rows, attendance: att.rows, events: [] }, S);
    const direct = calculate(input, S);
    expect(viaUpload.results.map((r) => [r.nik, r.target, r.score, r.incentive])).toEqual(direct.results.map((r) => [r.nik, r.target, r.score, r.incentive]));
  });
});

describe('Validasi baris', () => {
  const placements = input.placements;

  it('menolak baris bermasalah, tetap menerima baris yang benar', async () => {
    const res = await parseUpload('sales', await fill('sales', [
      { invoiceNo: 'A1', date: d('2026-10-01'), store: 'MLN', nik: '190107', amount: 1000, category: 'NORMAL' }, // ok
      { invoiceNo: 'A1', date: d('2026-10-02'), store: 'MLN', nik: '190107', amount: 1000, category: 'NORMAL' }, // dobel
      { invoiceNo: 'A3', date: d('2026-09-30'), store: 'MLN', nik: '190107', amount: 1000, category: 'NORMAL' }, // luar periode
      { invoiceNo: 'A4', date: d('2026-10-03'), store: 'MLN', nik: '999999', amount: 1000, category: 'NORMAL' }, // NIK asing
      { invoiceNo: 'A5', date: d('2026-10-03'), store: 'XYZ', nik: '190107', amount: 1000, category: 'NORMAL' }, // toko asing
      { invoiceNo: 'A6', date: d('2026-10-03'), store: 'MLN', nik: '190107', amount: 1000, category: 'GROSIR' }, // kategori asing
      { invoiceNo: 'A7', date: '15/10/2026', store: 'mln', nik: 190107, amount: '1.234.567', category: 'normal' }, // ok: format teks
      { invoiceNo: 'A8', date: d('2026-10-03'), store: 'MLN', amount: -500, category: 'NORMAL' }, // ok: non-individu, retur
    ]), ctx(placements));
    expect(res.rows.map((r) => r.invoiceNo)).toEqual(['A1', 'A7', 'A8']);
    expect(res.rows[1]).toMatchObject({ date: '2026-10-15', store: 'MLN', nik: '190107', amount: 1234567, category: 'NORMAL' });
    expect(res.rows[2].nik).toBeNull();
    expect(res.rejections.map((x) => x.row)).toEqual([3, 4, 5, 6, 7]);
    expect(res.rejections.find((x) => x.row === 3)!.reason).toContain('dobel');
  });

  it('Penempatan: NIK Atasan harus ada di file yang sama', async () => {
    const res = await parseUpload('placement', await fill('placement', [
      { nik: '1', name: 'TL A', position: 'TL', store: 'MLN', joinDate: d('2020-01-01') },
      { nik: '2', name: 'SP B', position: 'SP', store: 'MLN', superiorNik: '1', joinDate: d('2021-01-01'), facility: 'HP' },
      { nik: '3', name: 'SP C', position: 'SP', store: 'MLN', superiorNik: '77', joinDate: d('2021-01-01') },
      { nik: '4', name: 'SP D', position: 'XX', store: 'MLN', joinDate: d('2027-01-01') },
    ]), ctx());
    expect(res.rows.map((r) => r.nik)).toEqual(['1', '2']);
    expect(res.rejections.map((x) => x.reason).join(' | ')).toMatch(/Atasan 77.*\|.*XX.*\|.*setelah akhir periode|XX.*Atasan 77/s);
  });

  it('menolak seluruh file jika kolom wajib hilang', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Data').addRow(['No Faktur', 'Tanggal']);
    const res = await parseUpload('sales', Buffer.from(await wb.xlsx.writeBuffer()), ctx(placements));
    expect(res.fatal).toContain('Toko');
  });

  it('template selain Penempatan butuh Penempatan lebih dulu', async () => {
    const res = await parseUpload('sales', await fill('sales', []), ctx([]));
    expect(res.fatal).toContain('Penempatan');
  });
});

describe('Rekonsiliasi sebelum hitung', () => {
  it('memblokir hitung jika Sales belum diupload, memberi peringatan SP tanpa penjualan', () => {
    const r1 = preflight(input, S, new Set(['placement']));
    expect(r1.canCalculate).toBe(false);
    const r2 = preflight(input, S, new Set(['placement', 'sales', 'returns', 'attendance']));
    expect(r2.canCalculate).toBe(true);
    expect(r2.items.some((i) => i.message.includes('SP tanpa penjualan'))).toBe(true);
    expect(r2.storeTotals.find((t) => t.store === 'MLN')!.invoices).toBeGreaterThan(0);
  });
});
