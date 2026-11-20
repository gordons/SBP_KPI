-- Seed setting awal SBP 2026 (dibuat otomatis oleh scripts/generate-seed.ts)

insert into public.stores (code, name) values
  ('TBB', 'Bintang Baru'),
  ('MLN', 'Meilyn'),
  ('DRM', 'Norami'),
  ('MSA', 'Mitra Sukses Abadi')
on conflict (code) do nothing;

insert into public.settings_versions (effective_from, payload, note) values
  ('2026-01', '{"stores":[{"code":"TBB","group":"TENURE","spTargetMethod":"tenure","tlPersonalTarget":300000000,"tierTable":"STANDAR"},{"code":"MLN","group":"TENURE","spTargetMethod":"tenure","tlPersonalTarget":300000000,"tierTable":"STANDAR"},{"code":"DRM","group":"SPLIT","spTargetMethod":"split","tlPersonalTarget":300000000,"tierTable":"STANDAR"},{"code":"MSA","group":"SPLIT","spTargetMethod":"split","tlPersonalTarget":300000000,"tierTable":"STANDAR"}],"tenureTables":{"TENURE":{"baseTarget":100000000,"facilityAmounts":{"HP":100000000},"steps":[{"afterMonths":3,"amount":100000000},{"afterMonths":6,"amount":125000000},{"afterMonths":9,"amount":125000000},{"afterMonths":12,"amount":125000000},{"afterMonths":15,"amount":125000000},{"afterMonths":18,"amount":125000000},{"afterMonths":21,"amount":125000000},{"afterMonths":24,"amount":125000000},{"afterMonths":30,"amount":125000000},{"afterMonths":36,"amount":125000000}]},"SPLIT":{"baseTarget":100000000,"facilityAmounts":{"HP":100000000},"steps":[{"afterMonths":3,"amount":100000000},{"afterMonths":6,"amount":125000000},{"afterMonths":9,"amount":125000000},{"afterMonths":12,"amount":125000000},{"afterMonths":15,"amount":125000000},{"afterMonths":18,"amount":125000000},{"afterMonths":21,"amount":125000000},{"afterMonths":24,"amount":125000000},{"afterMonths":30,"amount":125000000},{"afterMonths":36,"amount":125000000}]}},"stepTables":{"RETUR":[{"min":0,"value":1},{"min":2,"value":0.75},{"min":3,"value":0.5},{"min":5,"value":0}],"ABSENSI":[{"min":0,"value":1},{"min":2,"value":0.75},{"min":3,"value":0.5},{"min":4,"value":0.25},{"min":5,"value":0}],"KOMPLAIN":[{"min":0,"value":1},{"min":2,"value":0.75},{"min":3,"value":0.5},{"min":5,"value":0}]},"tierTables":{"STANDAR":{"thresholds":[1.2,1.1,1,0.9,0.8],"rates":{"SP":[0.00125,0.001,0.00075,0.0005,0.00025],"TL":[0.000625,0.0005,0.000375,0.00025,0.000125],"ASM":[0.00032,0.00025,0.0002,0.00015,0.0001],"SM":[0.0007,0.0006,0.0005,0.0004,0.0003]},"belowLabel":"SP1"}},"indicators":[{"code":"OMZET_PRIBADI","name":"Omzet pribadi","source":"sales","agg":"sum","level":"self"},{"code":"OMZET_TIM","name":"Omzet tim","source":"sales","agg":"sum","level":"team"},{"code":"OMZET_TOKO","name":"Omzet toko","source":"sales","agg":"sum","level":"store"},{"code":"JUMLAH_RETUR","name":"Jumlah retur","source":"returns","agg":"count","level":"self"},{"code":"JUMLAH_ABSEN","name":"Jumlah absen","source":"attendance","agg":"sum","level":"self"},{"code":"JUMLAH_KOMPLAIN","name":"Jumlah komplain","source":"events","agg":"count","level":"self","eventCode":"KOMPLAIN"}],"templates":[{"position":"SP","name":"Sales Promotion","incentiveBase":"OMZET_PRIBADI","primaryComponent":"PENJUALAN","components":[{"code":"PENJUALAN","name":"Penjualan","weight":0.7,"active":true,"method":"ratio","indicator":"OMZET_PRIBADI","target":{"type":"sp_target"},"cap":null},{"code":"RETUR","name":"Retur","weight":0.1,"active":true,"method":"step","indicator":"JUMLAH_RETUR","stepTable":"RETUR"},{"code":"ABSENSI","name":"Absensi","weight":0.2,"active":true,"method":"step","indicator":"JUMLAH_ABSEN","stepTable":"ABSENSI"}]},{"position":"TL","name":"Team Leader","incentiveBase":"OMZET_TIM","primaryComponent":"TOTAL_SALES_TIM","components":[{"code":"TOTAL_SALES_TIM","name":"Total sales tim","weight":0.6,"active":true,"method":"ratio","indicator":"OMZET_TIM","target":{"type":"team_sum","includeOwn":"tl_personal"},"cap":null},{"code":"TEAM_PERFORMANCE","name":"Team performance","weight":0.3,"active":true,"method":"subordinate_pass","subordinate":{"position":"SP","scope":"direct","threshold":1}},{"code":"PENJUALAN_PRIBADI","name":"Penjualan pribadi","weight":0.1,"active":true,"method":"ratio","indicator":"OMZET_PRIBADI","target":{"type":"tl_personal"},"cap":1},{"code":"KOMPLAIN","name":"Komplain","weight":0,"active":false,"method":"step","indicator":"JUMLAH_KOMPLAIN","stepTable":"KOMPLAIN"}]},{"position":"ASM","name":"Assistant Store Manager","incentiveBase":"OMZET_TOKO","primaryComponent":"PENJUALAN_TOKO","components":[{"code":"PENJUALAN_TOKO","name":"Penjualan toko","weight":0.5,"active":true,"method":"ratio","indicator":"OMZET_TOKO","target":{"type":"store_target"},"cap":null},{"code":"KINERJA_TL","name":"Kinerja TL","weight":0.2,"active":true,"method":"subordinate_pass","subordinate":{"position":"TL","scope":"store","threshold":1}},{"code":"PENJUALAN","name":"Penjualan","weight":0.1,"active":true,"method":"ratio","indicator":"OMZET_PRIBADI","target":{"type":"fixed","value":500000000},"cap":1},{"code":"SSR","name":"SSR","weight":0.2,"active":false,"method":"ratio","direction":"lower","cap":1.2}]},{"position":"SM","name":"Store Manager","incentiveBase":"OMZET_TOKO","primaryComponent":"PENJUALAN_TOKO","components":[{"code":"PENJUALAN_TOKO","name":"Penjualan toko","weight":0.5,"active":true,"method":"ratio","indicator":"OMZET_TOKO","target":{"type":"store_target"},"cap":null},{"code":"KPI_ASM","name":"KPI ASM","weight":0.2,"active":true,"method":"subordinate_pass","subordinate":{"position":"ASM","scope":"store","threshold":1}},{"code":"SSR","name":"SSR","weight":0.3,"active":false,"method":"ratio","direction":"lower","cap":1.2}]}],"lists":{"positions":[{"code":"SP","name":"Sales Promotion"},{"code":"TL","name":"Team Leader"},{"code":"ASM","name":"Assistant Store Manager"},{"code":"SM","name":"Store Manager"}],"facilities":["HP"],"salesCategories":["NORMAL","AFILIASI","IMPORT","ONGKIR"],"returnCauses":[{"code":"SALES","name":"Kesalahan sales"},{"code":"BARANG_TIDAK_LAKU","name":"Barang tidak laku"},{"code":"BARANG_RUSAK","name":"Barang rusak"},{"code":"SYSTEM_ERROR","name":"System error"},{"code":"CUSTOMER","name":"Permintaan customer"},{"code":"CHECKER","name":"Kesalahan checker"},{"code":"MD","name":"Kesalahan MD"},{"code":"ADMIN","name":"Kesalahan admin"},{"code":"LAINNYA","name":"Lainnya"}],"absenceCodes":[{"code":"ALPA","name":"Tidak hadir tanpa keterangan"},{"code":"TELAT","name":"Terlambat"},{"code":"CT","name":"Cuti tahunan"},{"code":"SD","name":"Sakit dengan surat dokter"},{"code":"STSD","name":"Sakit tanpa surat dokter"},{"code":"CL","name":"Cuti lainnya"},{"code":"CM","name":"Cuti melahirkan"},{"code":"IPG","name":"Izin potong gaji"},{"code":"LSLK","name":"LSLK"},{"code":"TLN","name":"TLN"},{"code":"CIM","name":"CIM"}],"eventCodes":[{"code":"KOMPLAIN","name":"Komplain pelanggan"}]},"dataRules":{"salesCategoriesCounted":["NORMAL","AFILIASI"],"returnCausesCounted":"ALL","absenceCodesCounted":["ALPA"]},"redistributeInactiveWeight":true,"incentiveRounding":1}'::jsonb, 'Setting awal dari workbook Rumus Insentif Okt 2026 + perbaikan');

insert into public.store_monthly_targets (store_code, period, amount) values
  ('TBB', '2026-01', 12900000000),
  ('TBB', '2026-02', 12800000000),
  ('TBB', '2026-03', 8500000000),
  ('TBB', '2026-04', 13000000000),
  ('TBB', '2026-05', 12900000000),
  ('TBB', '2026-06', 12900000000),
  ('TBB', '2026-07', 12200000000),
  ('TBB', '2026-08', 11200000000),
  ('TBB', '2026-09', 11700000000),
  ('TBB', '2026-10', 11700000000),
  ('TBB', '2026-11', 10200000000),
  ('TBB', '2026-12', 12200000000),
  ('MLN', '2026-01', 12500000000),
  ('MLN', '2026-02', 13500000000),
  ('MLN', '2026-03', 10500000000),
  ('MLN', '2026-04', 11500000000),
  ('MLN', '2026-05', 12000000000),
  ('MLN', '2026-06', 13500000000),
  ('MLN', '2026-07', 11500000000),
  ('MLN', '2026-08', 10500000000),
  ('MLN', '2026-09', 10500000000),
  ('MLN', '2026-10', 11500000000),
  ('MLN', '2026-11', 12000000000),
  ('MLN', '2026-12', 13000000000),
  ('DRM', '2026-01', 2000000000),
  ('DRM', '2026-02', 1900000000),
  ('DRM', '2026-03', 1600000000),
  ('DRM', '2026-04', 2200000000),
  ('DRM', '2026-05', 1850000000),
  ('DRM', '2026-06', 1850000000),
  ('DRM', '2026-07', 1850000000),
  ('DRM', '2026-08', 1750000000),
  ('DRM', '2026-09', 1550000000),
  ('DRM', '2026-10', 1750000000),
  ('DRM', '2026-11', 1550000000),
  ('DRM', '2026-12', 1850000000),
  ('MSA', '2026-01', 850000000),
  ('MSA', '2026-02', 1000000000),
  ('MSA', '2026-03', 850000000),
  ('MSA', '2026-04', 900000000),
  ('MSA', '2026-05', 950000000),
  ('MSA', '2026-06', 1000000000),
  ('MSA', '2026-07', 1000000000),
  ('MSA', '2026-08', 900000000),
  ('MSA', '2026-09', 900000000),
  ('MSA', '2026-10', 950000000),
  ('MSA', '2026-11', 1000000000),
  ('MSA', '2026-12', 1200000000)
on conflict (store_code, period) do update set amount = excluded.amount;
