-- =============================================================
-- SBP KPI & Insentif — skema awal (Fase 1)
-- Jalankan di Supabase: SQL Editor -> paste -> Run
-- =============================================================

-- ---------- Peran pengguna ----------
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('hr_admin', 'hr_manager', 'viewer')),
  created_at timestamptz not null default now()
);

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid()
$$;

-- ---------- Master ----------
create table public.stores (
  code text primary key,                 -- TBB, DRM, MSA, MLN
  name text not null,
  active boolean not null default true
);

create table public.employees (
  nik text primary key,
  name text not null,
  join_date date not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------- Setting (versi per tanggal berlaku) ----------
-- payload = objek Settings mesin hitung, kecuali storeTargets (tabel sendiri).
create table public.settings_versions (
  id bigint generated always as identity primary key,
  effective_from text not null check (effective_from ~ '^\d{4}-\d{2}$'),  -- 'YYYY-MM'
  payload jsonb not null,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.settings_versions (effective_from desc, id desc);

-- Target toko diinput sekali per tahun (12 baris per toko).
create table public.store_monthly_targets (
  store_code text not null references public.stores(code),
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  amount numeric(18,2) not null check (amount >= 0),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (store_code, period)
);

-- ---------- Periode ----------
create table public.periods (
  period text primary key check (period ~ '^\d{4}-\d{2}$'),
  status text not null default 'draft'
    check (status in ('draft', 'calculated', 'submitted', 'approved', 'locked')),
  settings_version_id bigint references public.settings_versions(id),
  locked_at timestamptz,
  locked_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Snapshot penempatan KPI per periode (template Penempatan)
create table public.placements (
  period text not null references public.periods(period) on delete cascade,
  nik text not null references public.employees(nik),
  position text not null,                -- SP, TL, ASM, SM
  store_code text not null references public.stores(code),
  superior_nik text references public.employees(nik),
  facility text,
  primary key (period, nik)
);

-- ---------- Upload ----------
create table public.uploads (
  id bigint generated always as identity primary key,
  period text not null references public.periods(period) on delete cascade,
  kind text not null check (kind in ('placement', 'sales', 'returns', 'attendance', 'events')),
  file_name text not null,
  storage_path text not null,            -- file asli di Supabase Storage
  row_count int not null default 0,
  rejected_count int not null default 0,
  is_current boolean not null default true,  -- upload ulang menggantikan versi lama
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now()
);
create unique index uploads_one_current on public.uploads (period, kind) where is_current;

create table public.sales_rows (
  upload_id bigint not null references public.uploads(id) on delete cascade,
  invoice_no text not null,
  invoice_date date not null,
  store_code text not null references public.stores(code),
  nik text references public.employees(nik),   -- null = non-individu
  amount numeric(18,2) not null,
  category text not null,
  primary key (upload_id, invoice_no)
);

create table public.return_rows (
  upload_id bigint not null references public.uploads(id) on delete cascade,
  return_no text not null,
  original_invoice_no text,
  return_date date not null,
  nik text not null references public.employees(nik),
  amount numeric(18,2) not null,
  cause text not null,
  has_ba boolean not null default false,
  primary key (upload_id, return_no)
);

create table public.attendance_rows (
  upload_id bigint not null references public.uploads(id) on delete cascade,
  nik text not null references public.employees(nik),
  counts jsonb not null,                 -- {"TELAT":1,"STSD":0,"ALPA":2,...}
  primary key (upload_id, nik)
);

create table public.event_rows (
  id bigint generated always as identity primary key,
  upload_id bigint not null references public.uploads(id) on delete cascade,
  nik text not null references public.employees(nik),
  indicator_code text not null,
  event_date date not null,
  value numeric(18,4) not null default 1
);

create table public.upload_rejections (
  id bigint generated always as identity primary key,
  upload_id bigint not null references public.uploads(id) on delete cascade,
  row_number int not null,
  reason text not null,
  raw jsonb
);

-- ---------- Hasil hitung ----------
create table public.calc_runs (
  id bigint generated always as identity primary key,
  period text not null references public.periods(period) on delete cascade,
  settings_version_id bigint not null references public.settings_versions(id),
  is_current boolean not null default true,
  warnings jsonb not null default '[]',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index calc_runs_one_current on public.calc_runs (period) where is_current;

create table public.calc_results (
  run_id bigint not null references public.calc_runs(id) on delete cascade,
  nik text not null references public.employees(nik),
  position text not null,
  store_code text not null,
  tenure_months int not null,
  target numeric(18,2),
  score numeric(10,4) not null,
  tier_label text not null,
  rate numeric(10,6) not null,
  incentive_base numeric(18,2) not null,
  incentive numeric(18,2) not null,
  components jsonb not null,             -- rincian per komponen
  warnings jsonb not null default '[]',
  primary key (run_id, nik)
);

-- ---------- Kontrol ----------
create table public.overrides (
  id bigint generated always as identity primary key,
  run_id bigint not null references public.calc_runs(id) on delete cascade,
  nik text not null references public.employees(nik),
  field text not null check (field in ('incentive', 'score')),
  old_value numeric(18,4) not null,
  new_value numeric(18,4) not null,
  reason text not null check (length(trim(reason)) >= 10),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.approvals (
  id bigint generated always as identity primary key,
  period text not null references public.periods(period) on delete cascade,
  run_id bigint not null references public.calc_runs(id),
  decision text not null check (decision in ('submitted', 'approved', 'rejected', 'locked', 'reopened')),
  note text,
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_key text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  actor uuid,
  at timestamptz not null default now()
);

create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (table_name, record_key, action, old_data, new_data, actor)
  values (tg_table_name, null, tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
          auth.uid());
  return coalesce(new, old);
end $$;

create trigger audit_settings after insert or update or delete on public.settings_versions
  for each row execute function public.audit_trigger();
create trigger audit_targets after insert or update or delete on public.store_monthly_targets
  for each row execute function public.audit_trigger();
create trigger audit_periods after update on public.periods
  for each row execute function public.audit_trigger();
create trigger audit_overrides after insert on public.overrides
  for each row execute function public.audit_trigger();

-- Periode terkunci tidak boleh diubah datanya
create or replace function public.block_locked_period() returns trigger
language plpgsql as $$
declare p text;
begin
  if tg_op = 'DELETE' then p := old.period; else p := new.period; end if;
  if exists (select 1 from public.periods where period = p and status = 'locked') then
    raise exception 'Periode % sudah dikunci', p;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger lock_placements before insert or update or delete on public.placements
  for each row execute function public.block_locked_period();
create trigger lock_uploads before insert or update or delete on public.uploads
  for each row execute function public.block_locked_period();
create trigger lock_runs before insert or update or delete on public.calc_runs
  for each row execute function public.block_locked_period();

-- ---------- Row Level Security ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','stores','employees','settings_versions','store_monthly_targets',
    'periods','placements','uploads','sales_rows','return_rows','attendance_rows','event_rows',
    'upload_rejections','calc_runs','calc_results','overrides','approvals','audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    -- semua pengguna terdaftar boleh membaca
    execute format('create policy read_%1$s on public.%1$I for select to authenticated using (public.my_role() is not null)', t);
  end loop;

  -- HR Admin & HR Manager boleh mengolah data periode
  foreach t in array array['employees','periods','placements','uploads','sales_rows','return_rows',
    'attendance_rows','event_rows','upload_rejections','calc_runs','calc_results','overrides']
  loop
    execute format('create policy write_%1$s on public.%1$I for all to authenticated using (public.my_role() in (''hr_admin'',''hr_manager'')) with check (public.my_role() in (''hr_admin'',''hr_manager''))', t);
  end loop;

  -- Hanya HR Manager: setting, target toko, master toko, approval, pengguna
  foreach t in array array['stores','settings_versions','store_monthly_targets','approvals','profiles']
  loop
    execute format('create policy manage_%1$s on public.%1$I for all to authenticated using (public.my_role() = ''hr_manager'') with check (public.my_role() = ''hr_manager'')', t);
  end loop;
end $$;

-- Viewer hanya melihat hasil periode yang sudah dikunci
drop policy read_calc_results on public.calc_results;
create policy read_calc_results on public.calc_results for select to authenticated using (
  public.my_role() in ('hr_admin','hr_manager')
  or (public.my_role() = 'viewer' and exists (
    select 1 from public.calc_runs r join public.periods p on p.period = r.period
    where r.id = calc_results.run_id and p.status = 'locked'))
);

-- Bucket penyimpanan file upload asli
insert into storage.buckets (id, name, public) values ('kpi-uploads', 'kpi-uploads', false)
  on conflict (id) do nothing;
