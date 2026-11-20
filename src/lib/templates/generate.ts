import ExcelJS from 'exceljs';
import type { Settings } from '../engine/types';
import { getTemplate, type TemplateKind } from './definitions';

const MAX_ROWS = 5000;
const HEADER_FILL = 'FF1F3864';
const REQUIRED_FILL = 'FFC00000';

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Membuat file template .xlsx: sheet Data (dengan dropdown), Petunjuk, dan _list (tersembunyi). */
export async function buildTemplate(kind: TemplateKind, settings: Settings): Promise<Buffer> {
  const def = getTemplate(kind, settings);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SBP KPI';
  wb.created = new Date();

  const ws = wb.addWorksheet('Data', { views: [{ state: 'frozen', ySplit: 1 }] });
  const lists = wb.addWorksheet('_list', { state: 'veryHidden' });
  const help = wb.addWorksheet('Petunjuk');

  // ---- Data ----
  ws.columns = def.columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const header = ws.getRow(1);
  header.height = 22;
  def.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.required ? REQUIRED_FILL : HEADER_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.note = (c.required ? 'WAJIB. ' : 'Opsional. ') + c.note;
  });

  // exceljs mendukung validasi per range saat runtime, tapi belum ada di tipe TypeScript-nya
  const validations = (ws as unknown as { dataValidations: { add(range: string, v: ExcelJS.DataValidation): void } }).dataValidations;

  let listCol = 0;
  def.columns.forEach((c, i) => {
    const L = colLetter(i + 1);
    const range = `${L}2:${L}${MAX_ROWS}`;
    const col = ws.getColumn(i + 1);

    if (c.type === 'nik' || c.type === 'text') col.numFmt = '@';
    if (c.type === 'date') col.numFmt = 'dd/mm/yyyy';
    if (c.type === 'number') col.numFmt = '#,##0;-#,##0';
    if (c.type === 'count') col.numFmt = '0.##';

    if ((c.type === 'list' || c.type === 'yesno') && c.options?.length) {
      listCol += 1;
      const LL = colLetter(listCol);
      lists.getCell(`${LL}1`).value = c.header;
      c.options.forEach((o, j) => (lists.getCell(`${LL}${j + 2}`).value = o));
      const ref = `'_list'!$${LL}$2:$${LL}$${c.options.length + 1}`;
      validations.add(range, {
        type: 'list',
        allowBlank: !c.required,
        formulae: [ref],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: c.header,
        error: `Pilih dari daftar: ${c.options.join(', ')}`,
      });
    }
    if (c.type === 'date') {
      validations.add(range, {
        type: 'date',
        operator: 'greaterThan',
        allowBlank: !c.required,
        formulae: [new Date(Date.UTC(1990, 0, 1))],
        showErrorMessage: true,
        errorTitle: c.header,
        error: 'Isi dengan tanggal yang valid (dd/mm/yyyy)',
      });
    }
    if (c.type === 'count') {
      validations.add(range, {
        type: 'decimal',
        operator: 'greaterThanOrEqual',
        allowBlank: true,
        formulae: [0],
        showErrorMessage: true,
        errorTitle: c.header,
        error: 'Isi angka 0 atau lebih',
      });
    }
    if (c.type === 'number') {
      validations.add(range, {
        type: 'decimal',
        operator: 'between',
        allowBlank: !c.required,
        formulae: [-1e15, 1e15],
        showErrorMessage: true,
        errorTitle: c.header,
        error: 'Isi dengan angka tanpa titik/koma ribuan',
      });
    }
  });

  // ---- Petunjuk ----
  help.columns = [
    { header: 'Kolom', key: 'col', width: 20 },
    { header: 'Wajib', key: 'req', width: 8 },
    { header: 'Keterangan', key: 'note', width: 90 },
  ];
  help.getRow(1).font = { bold: true };
  help.insertRow(1, [`Template ${def.title}: ${def.rowMeaning}`]);
  help.getRow(1).font = { bold: true, size: 13 };
  help.spliceRows(2, 0, []);
  def.columns.forEach((c) =>
    help.addRow({ col: c.header, req: c.required ? 'Ya' : '-', note: c.note + (c.options ? `. Pilihan: ${c.options.join(', ')}` : '') }),
  );
  help.addRow([]);
  help.addRow(['Catatan']).font = { bold: true };
  [
    'Isi di sheet "Data" mulai baris 2. Jangan ubah, hapus, atau pindahkan judul kolom di baris 1.',
    'Kolom berjudul merah wajib diisi.',
    'Upload ulang untuk periode yang sama akan MENGGANTIKAN data sebelumnya.',
    ...def.instructions,
  ].forEach((t) => help.addRow(['', '', t]));
  help.getColumn(3).alignment = { wrapText: true, vertical: 'top' };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
