# SBP KPI & Insentif — Fase 1

Sudah selesai: **Langkah 1** (mesin hitung, database, uji ulang Oktober 2026), **Langkah 2** (template upload + validasi),
**Langkah 3** (aplikasi web: login, periode, upload, cek & hitung, hasil, override, persetujuan),
dan **Langkah 4** (export rekap payroll Excel + form Penilaian Kinerja PDF).

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
| `src/app/` | Layar aplikasi Next.js |
| `src/lib/export/` | Pembuat rekap payroll (.xlsx) dan form Penilaian Kinerja (.pdf) |
| `supabase/migrations/0003_app_functions.sql` | Fungsi upload, simpan hasil, persetujuan, override |
| `contoh-oktober-2026/` | 4 file upload berisi data Oktober 2026 untuk uji coba |
| `tests/` | Uji otomatis + data uji dari workbook Oktober 2026 |

## Hasil uji ulang Oktober 2026

Semua cocok dengan Excel:
- Target 16 SP di 4 toko
- Skor, tier, dan insentif Rp 8 SP yang sudah ada achieve (MLN dan MSA)
- Target tim 6 TL

Jalankan sendiri:
```
npm install
npm test             # 19 uji otomatis
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

## Deploy aplikasi (Langkah 3)

**1. Supabase**
- SQL Editor: jalankan `supabase/migrations/0003_app_functions.sql`.
- Authentication > Sign In / Providers > Email: matikan **Allow new users to sign up** (akun dibuat oleh HR Manager saja).
- Authentication > Users > **Add user**: isi email dan kata sandi, centang *Auto Confirm User*.
- Beri peran lewat SQL Editor (ulangi per orang):
  ```sql
  insert into public.profiles (user_id, full_name, role)
  select id, 'Nama Lengkap', 'hr_manager' from auth.users where email = 'nama@perusahaan.com';
  ```
  Peran: `hr_manager` (semua, termasuk setujui & kunci), `hr_admin` (upload, hitung, override, ajukan), `viewer` (lihat hasil periode terkunci).

**2. Vercel**
- Add New > Project > import repo GitHub ini. Framework terdeteksi otomatis (Next.js).
- Environment Variables (ambil dari Supabase > Project Settings > API):
  `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Deploy. Disarankan: Settings > Functions > Region = Singapore (sin1), dekat dengan database.

**3. Uji coba dengan data Oktober 2026**
1. Login, buat periode Oktober 2026.
2. Upload 4 file di folder `contoh-oktober-2026/` sesuai urutan nomornya.
3. Cek & hitung > Hitung KPI. Total insentif harus **Rp 5.143.956** (4 SP MLN), sama dengan Excel.
4. Coba alur: Ajukan > Setujui > Kunci (pakai akun HR Manager).

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

## Export (Langkah 4)

Di tab **Hasil & persetujuan** dan halaman rincian karyawan:

| File | Isi |
|---|---|
| Rekap payroll (.xlsx) | Sheet Rekap Insentif (1 baris per karyawan, insentif hitung, override, insentif akhir, total), Ringkasan per toko & jabatan, Rincian Komponen, Info (status, versi setting, riwayat persetujuan) |
| Form penilaian (.pdf) | 1 halaman A4 per karyawan: data karyawan, tabel kinerja, tier & insentif, parameter tier, kekuatan/kekurangan, 5 kolom tanda tangan. Bisa semua karyawan, per jabatan, atau per orang |

Selama periode belum dikunci, kedua file diberi tanda **DRAF**. Viewer baru bisa mengunduh setelah periode dikunci.

## Langkah berikutnya

5. Layar pengubahan Setting (target toko, bobot, tangga, tier, aturan data) dengan versi per periode
