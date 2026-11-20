// Membuat contoh template terisi data Oktober 2026 (dari workbook) untuk uji coba aplikasi.
// Jalankan: npx tsx scripts/generate-samples.ts
import ExcelJS from 'exceljs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { SBP_SETTINGS_2026 as S } from '../src/lib/engine/defaults';
import type { PeriodInput } from '../src/lib/engine/types';
import { buildTemplate, getTemplate, type TemplateKind } from '../src/lib/templates';

const input = JSON.parse(readFileSync('tests/fixtures/okt-2026.json', 'utf8')).input as PeriodInput;
const d = (iso: string) => new Date(iso + 'T00:00:00Z');

async function fill(kind: TemplateKind, rows: Record<string, unknown>[]) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildTemplate(kind, S));
  const ws = wb.getWorksheet('Data')!;
  const cols = getTemplate(kind, S).columns;
  rows.forEach((r, i) => cols.forEach((c, j) => {
    if (r[c.key] !== undefined && r[c.key] !== null) ws.getRow(i + 2).getCell(j + 1).value = r[c.key] as ExcelJS.CellValue;
  }));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

mkdirSync('contoh-oktober-2026', { recursive: true });
const out: [string, Promise<Buffer>][] = [
  ['1_Penempatan', fill('placement', input.placements.map((p) => ({ ...p, joinDate: d(p.joinDate) })))],
  ['2_Sales', fill('sales', input.sales.map((x) => ({ ...x, date: d(x.date) })))],
  ['3_Retur', fill('returns', input.returns.map((x, i) => ({ ...x, returnNo: `RET-2610-${String(i + 1).padStart(3, '0')}`, date: d(x.date), cause: 'SALES', hasBA: 'YA' })))],
  ['4_Absensi', fill('attendance', input.attendance.map((x) => ({ nik: x.nik, name: input.placements.find((p) => p.nik === x.nik)?.name, 'count:ALPA': x.counts.ALPA })))],
];
for (const [name, buf] of out) writeFileSync(`contoh-oktober-2026/${name}_Okt2026.xlsx`, await buf);
console.log('contoh dibuat di contoh-oktober-2026/');
