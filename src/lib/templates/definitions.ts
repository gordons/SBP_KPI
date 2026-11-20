import type { Settings } from '../engine/types';

// =============================================================
// Definisi 5 template upload baku.
// Dipakai bersama oleh pembuat template (generate.ts) dan pembaca upload (import/parse.ts),
// jadi kolom template dan aturan validasi selalu sama.
// =============================================================

export type TemplateKind = 'placement' | 'sales' | 'returns' | 'attendance' | 'events';

export type ColumnType = 'text' | 'nik' | 'date' | 'number' | 'count' | 'list' | 'yesno';

export interface ColumnDef {
  key: string;
  header: string;
  type: ColumnType;
  required: boolean;
  /** Pilihan dropdown (untuk type 'list'). */
  options?: string[];
  note: string;
  width: number;
}

export interface TemplateDef {
  kind: TemplateKind;
  title: string;
  fileName: string;
  rowMeaning: string;
  columns: ColumnDef[];
  instructions: string[];
}

export const TEMPLATE_KINDS: TemplateKind[] = ['placement', 'sales', 'returns', 'attendance', 'events'];

export function getTemplate(kind: TemplateKind, s: Settings): TemplateDef {
  const stores = s.stores.map((x) => x.code);
  const L = s.lists;
  switch (kind) {
    case 'placement':
      return {
        kind,
        title: 'Penempatan KPI',
        fileName: 'Template_Penempatan.xlsx',
        rowMeaning: '1 baris = 1 karyawan yang dinilai pada periode ini',
        columns: [
          { key: 'nik', header: 'NIK', type: 'nik', required: true, note: 'NIK karyawan (sama dengan Employee ID Talenta)', width: 14 },
          { key: 'name', header: 'Nama', type: 'text', required: true, note: 'Nama lengkap', width: 30 },
          { key: 'position', header: 'Jabatan KPI', type: 'list', options: L.positions.map((p) => p.code), required: true, note: 'Jabatan untuk perhitungan KPI: ' + L.positions.map((p) => `${p.code} = ${p.name}`).join(', '), width: 14 },
          { key: 'store', header: 'Toko KPI', type: 'list', options: stores, required: true, note: 'Toko penempatan untuk KPI (boleh beda dengan Talenta)', width: 12 },
          { key: 'superiorNik', header: 'NIK Atasan', type: 'nik', required: false, note: 'SP: NIK Team Leader-nya. Jabatan lain boleh kosong', width: 14 },
          { key: 'joinDate', header: 'Tanggal Masuk', type: 'date', required: true, note: 'Untuk menghitung masa kerja', width: 15 },
          { key: 'facility', header: 'Fasilitas', type: 'list', options: L.facilities, required: false, note: 'Kosongkan jika tidak ada fasilitas', width: 12 },
        ],
        instructions: [
          'Upload template ini PERTAMA setiap periode. Template lain dicek terhadap daftar NIK di sini.',
          'NIK Atasan harus ada di file yang sama.',
        ],
      };
    case 'sales':
      return {
        kind,
        title: 'Sales',
        fileName: 'Template_Sales.xlsx',
        rowMeaning: '1 baris = 1 faktur penjualan',
        columns: [
          { key: 'invoiceNo', header: 'No Faktur', type: 'text', required: true, note: 'Nomor faktur, tidak boleh dobel', width: 22 },
          { key: 'date', header: 'Tanggal', type: 'date', required: true, note: 'Tanggal faktur, harus di dalam periode', width: 13 },
          { key: 'store', header: 'Toko', type: 'list', options: stores, required: true, note: 'Toko / entitas yang menerbitkan faktur', width: 10 },
          { key: 'nik', header: 'NIK Sales', type: 'nik', required: false, note: 'Kosongkan jika bukan penjualan perorangan (mis. Sales Team, online). Nilainya tetap masuk omzet toko', width: 14 },
          { key: 'amount', header: 'Nilai', type: 'number', required: true, note: 'Nilai faktur. Faktur retur ditulis MINUS', width: 18 },
          { key: 'category', header: 'Kategori', type: 'list', options: L.salesCategories, required: true, note: 'Kategori transaksi', width: 14 },
        ],
        instructions: [
          'Faktur retur dimasukkan ke template ini dengan nilai minus, supaya omzet otomatis net.',
          'Jangan masukkan baris subtotal atau total.',
        ],
      };
    case 'returns':
      return {
        kind,
        title: 'Retur',
        fileName: 'Template_Retur.xlsx',
        rowMeaning: '1 baris = 1 faktur retur',
        columns: [
          { key: 'returnNo', header: 'No Retur', type: 'text', required: true, note: 'Nomor faktur retur, tidak boleh dobel', width: 22 },
          { key: 'originalInvoiceNo', header: 'No Faktur Asal', type: 'text', required: false, note: 'Faktur yang diretur (boleh dari bulan sebelumnya)', width: 22 },
          { key: 'date', header: 'Tanggal Retur', type: 'date', required: true, note: 'Harus di dalam periode', width: 14 },
          { key: 'nik', header: 'NIK Sales', type: 'nik', required: true, note: 'Sales pada faktur asal', width: 14 },
          { key: 'amount', header: 'Nilai', type: 'number', required: true, note: 'Nilai retur (boleh plus atau minus)', width: 18 },
          { key: 'cause', header: 'Penyebab', type: 'list', options: L.returnCauses.map((c) => c.code), required: true, note: 'Penyebab retur: ' + L.returnCauses.map((c) => `${c.code} = ${c.name}`).join(', '), width: 20 },
          { key: 'hasBA', header: 'Ada BA', type: 'yesno', options: ['YA', 'TIDAK'], required: true, note: 'Ada Berita Acara retur?', width: 9 },
        ],
        instructions: [
          'Template ini hanya untuk MENGHITUNG jumlah retur di KPI. Nilai retur di omzet sudah ikut lewat template Sales (nilai minus).',
          'Penyebab mana yang dihitung ke KPI SP diatur di Setting.',
        ],
      };
    case 'attendance':
      return {
        kind,
        title: 'Absensi',
        fileName: 'Template_Absensi.xlsx',
        rowMeaning: '1 baris = 1 karyawan, rekap 1 periode',
        columns: [
          { key: 'nik', header: 'NIK', type: 'nik', required: true, note: 'NIK karyawan', width: 14 },
          { key: 'name', header: 'Nama', type: 'text', required: false, note: 'Hanya untuk memudahkan pengecekan', width: 30 },
          ...L.absenceCodes.map<ColumnDef>((c) => ({
            key: `count:${c.code}`,
            header: c.code,
            type: 'count',
            required: false,
            note: `${c.name} (jumlah hari/kali). Kosong = 0`,
            width: 8,
          })),
        ],
        instructions: ['Kode yang dihitung sebagai "absen" di KPI diatur di Setting.'],
      };
    case 'events':
      return {
        kind,
        title: 'Data KPI Lain',
        fileName: 'Template_Data_KPI_Lain.xlsx',
        rowMeaning: '1 baris = 1 kejadian atau transaksi',
        columns: [
          { key: 'nik', header: 'NIK', type: 'nik', required: true, note: 'NIK karyawan', width: 14 },
          { key: 'indicatorCode', header: 'Kode Indikator', type: 'list', options: L.eventCodes.map((c) => c.code), required: true, note: 'Jenis data: ' + L.eventCodes.map((c) => `${c.code} = ${c.name}`).join(', '), width: 18 },
          { key: 'date', header: 'Tanggal', type: 'date', required: true, note: 'Harus di dalam periode', width: 13 },
          { key: 'value', header: 'Nilai', type: 'number', required: false, note: 'Kosong = 1 kejadian', width: 12 },
          { key: 'remark', header: 'Keterangan', type: 'text', required: false, note: 'Opsional', width: 40 },
        ],
        instructions: ['Untuk KPI jabatan lain atau indikator tambahan, mis. komplain pelanggan.'],
      };
  }
}
