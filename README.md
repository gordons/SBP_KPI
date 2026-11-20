# SBP KPI & Insentif — Fase 1, Langkah 1

Isi paket ini: **mesin hitung KPI + skema database + uji ulang Oktober 2026**.
Layar aplikasi (Next.js) dibangun di langkah berikutnya di atas fondasi ini.

## Isi folder

| Path | Isi |
|---|---|
| `src/lib/engine/` | Mesin hitung KPI. Tidak ada rumus jabatan yang di-hardcode; semua dari Setting |
| `src/lib/engine/defaults.ts` | Setting awal SBP 2026 (target toko, tangga, tier, template jabatan) |
| `supabase/migrations/0001_init.sql` | Skema database, RLS per peran, kunci periode, audit log |
| `supabase/seed.sql` | Setting awal, dibuat otomatis dari `defaults.ts` |
| `tests/` | Uji otomatis + data uji dari workbook Oktober 2026 |

## Hasil uji ulang Oktober 2026

Semua cocok dengan Excel:
- Target 16 SP di 4 toko
- Skor, tier, dan insentif Rp 8 SP yang sudah ada achieve (MLN dan MSA)
- Target tim 6 TL

Jalankan sendiri:
```
npm install
npm test             # 9 uji otomatis
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

## Langkah berikutnya

2. Template upload Excel (dropdown) + validasi
3. Layar Setting, Periode/Upload, Hasil, Approval
4. Export rekap payroll + form PA
