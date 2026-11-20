// Membuat supabase/seed.sql dari SBP_SETTINGS_2026 supaya kode dan database selalu sama.
// Jalankan: npx tsx scripts/generate-seed.ts
import { writeFileSync } from 'node:fs';
import { SBP_SETTINGS_2026 } from '../src/lib/engine/defaults';

const names: Record<string, string> = { TBB: 'Bintang Baru', DRM: 'Norami', MSA: 'Mitra Sukses Abadi', MLN: 'Meilyn' };
const { storeTargets, ...payload } = SBP_SETTINGS_2026;
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

let sql = '-- Seed setting awal SBP 2026 (dibuat otomatis oleh scripts/generate-seed.ts)\n\n';
sql += 'insert into public.stores (code, name) values\n' +
  SBP_SETTINGS_2026.stores.map((s) => `  (${q(s.code)}, ${q(names[s.code] ?? s.code)})`).join(',\n') + '\non conflict (code) do nothing;\n\n';
sql += `insert into public.settings_versions (effective_from, payload, note) values\n  ('2026-01', ${q(JSON.stringify(payload))}::jsonb, 'Setting awal dari workbook Rumus Insentif Okt 2026 + perbaikan');\n\n`;
sql += 'insert into public.store_monthly_targets (store_code, period, amount) values\n' +
  Object.entries(storeTargets).flatMap(([store, m]) => Object.entries(m).map(([p, v]) => `  (${q(store)}, ${q(p)}, ${v})`)).join(',\n') +
  '\non conflict (store_code, period) do update set amount = excluded.amount;\n';
writeFileSync('supabase/seed.sql', sql);
console.log('supabase/seed.sql dibuat');
