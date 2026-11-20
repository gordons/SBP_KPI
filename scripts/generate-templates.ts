// Membuat 5 file template ke folder templates/ untuk dicek.
// Di aplikasi, template dibuat langsung saat HR klik "Unduh template" (selalu sesuai Setting terbaru).
// Jalankan: npx tsx scripts/generate-templates.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { SBP_SETTINGS_2026 } from '../src/lib/engine/defaults';
import { buildTemplate, getTemplate, TEMPLATE_KINDS } from '../src/lib/templates';

mkdirSync('templates', { recursive: true });
for (const kind of TEMPLATE_KINDS) {
  const def = getTemplate(kind, SBP_SETTINGS_2026);
  writeFileSync(`templates/${def.fileName}`, await buildTemplate(kind, SBP_SETTINGS_2026));
  console.log('dibuat templates/' + def.fileName);
}
