import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildPaPdf, buildRekapXlsx } from '../src/lib/export';
import { octoberExport } from './export-helpers';

describe('Export rekap payroll', () => {
  it('berisi semua karyawan, total insentif akhir benar (termasuk override), dan tanda DRAF bila belum dikunci', async () => {
    const d = octoberExport();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildRekapXlsx(d));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Rekap Insentif', 'Ringkasan', 'Rincian Komponen', 'Info']);
    const ws = wb.getWorksheet('Rekap Insentif')!;
    expect(String(ws.getCell('A2').value)).toContain('DRAF');
    const totalRow = ws.getRow(5 + d.rows.length);
    const expected = d.rows.reduce((a, r) => a + r.finalIncentive, 0);
    expect((totalRow.getCell(14).value as { result: number }).result).toBe(expected);
    expect(expected).toBe(5143956 - 713828 + 750000);
  });

  it('periode terkunci tidak ditandai DRAF', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildRekapXlsx(octoberExport('locked')));
    expect(String(wb.getWorksheet('Rekap Insentif')!.getCell('A2').value)).toContain('Dikunci');
  });
});

describe('Export form PA', () => {
  it('1 halaman per karyawan, bisa difilter per NIK', async () => {
    const d = octoberExport();
    const all = await PDFDocument.load(await buildPaPdf(d));
    expect(all.getPageCount()).toBe(d.rows.length);
    const one = await PDFDocument.load(await buildPaPdf(d, ['190107']));
    expect(one.getPageCount()).toBe(1);
  });
});
