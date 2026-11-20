# SBP KPI & Insentif — Fase 1

Sudah selesai: **Langkah 1** (mesin hitung, database, uji ulang Oktober 2026) dan **Langkah 2** (template upload + validasi).
Layar aplikasi (Next.js) dibangun di Langkah 3 di atas fondasi ini.

## Isi folder

| Path | Isi |
|---|---|
| `src/lib/engine/` | Mesin hitung KPI. Tidak ada rumus jabatan yang di-hardcode; semua dari Setting |
| `src/lib/engine/defaults.ts` | Setting awal SBP 2026 (target toko, tangga, tier, template jabatan) |
| `supabase/migrations/0001_init.sql` | Skema database, RLS per peran, kunci periode, audit log |
| `supabase/seed.sql` | Setting awal, dibuat otomatis dari `defaults.ts` |
| `src/lib/templates/` | Definisi dan pembuat 5 template upload (.xlsx dengan dropdown) |
| `src/lib/import/` | Pembaca upload: validasi per baris + rekonsiliasi sebelum hitung |
| `templates/` | Contoh 5 file template untuk dicek (di aplikasi dibuat otomatis dari Setting) |
| `supabase/migrations/0002_template_lists.sql` | Menambah daftar pilihan dropdown ke setting yang sudah ada |
| `tests/` | Uji otomatis + data uji dari workbook Oktober 2026 |

## Hasil uji ulang Oktober 2026

Semua cocok dengan Excel:
- Target 16 SP di 4 toko
- Skor, tier, dan insentif Rp 8 SP yang sudah ada achieve (MLN dan MSA)
- Target tim 6 TL

Jalankan sendiri:
```
npm install
npm test             # 16 uji otomatis
npm run uji-oktober  # laporan aplikasi vs Excel per karyawan
```

## Pasang database di Supabase

1. Buat project Supabase baru.
2. SQL Editor → jalankan isi `supabase/migrations/0001_init.sql`.
3. SQL Editor → jalankan isi `supabase/seed.sql`.
4. Authentication → buat user, lalu tambahkan baris di tabel `profiles` dengan peran `hr_manager`, `hr_admin`, atau `viewer`.

## Default sementara (bisa diubah di Setting, menunggu keputusan PRD)

| Hal | Default |
|---|---|
| Kategori omzet yang dihitung | NORMAL, AFILIASI (IMPORT dan ONGKIR tidak) |
| Penyebab retur yang dihitung ke SP | Semua |
| Kode absensi yang dihitung | ALPA |
| Team Performance TL | % SP di tim dengan skor ≥ 100% |
| SSR (ASM 20%, SM 30%) | Nonaktif, bobot dialihkan proporsional |
| Target toko MSA | Blok "MSA bagi 2" di sheet Target × 2 (Okt = 950 jt) |
| Pembulatan insentif | Rp 1 |

## Template upload (Langkah 2)

| Template | 1 baris = |
|---|---|
| Penempatan | 1 karyawan yang dinilai (diupload pertama) |
| Sales | 1 faktur; retur ditulis minus; NIK kosong = non-individu |
| Retur | 1 faktur retur beserta penyebab dan BA (untuk jumlah retur di KPI) |
| Absensi | 1 karyawan, rekap per kode absensi |
| Data KPI Lain | 1 kejadian (mis. komplain) |

Validasi otomatis: kolom wajib, NIK harus ada di Penempatan, nomor faktur dobel, tanggal di luar periode,
toko/kategori/penyebab di luar daftar, NIK Atasan harus ada di file. Baris bermasalah ditolak beserta alasan;
baris benar tetap diterima. Angka teks "1.234.567" dan tanggal "15/10/2026" tetap terbaca.

## Langkah berikutnya

3. Layar Setting, Periode/Upload, Hasil, Approval
4. Export rekap payroll + form PA
