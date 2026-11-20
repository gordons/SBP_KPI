-- =============================================================
-- Langkah 3: fungsi database untuk layar aplikasi.
-- Setiap proses penting (upload, simpan hasil hitung, persetujuan, override)
-- dijalankan dalam satu transaksi, dengan cek peran dan status periode.
-- Jalankan sekali di Supabase SQL Editor.
-- =============================================================

-- ---------- Penyimpanan file upload asli ----------
drop policy if exists kpi_uploads_rw on storage.objects;
create policy kpi_uploads_rw on storage.objects for all to authenticated
  using (bucket_id = 'kpi-uploads' and public.my_role() in ('hr_admin', 'hr_manager'))
  with check (bucket_id = 'kpi-uploads' and public.my_role() in ('hr_admin', 'hr_manager'));

-- ---------- Helper ----------
create or replace function public.assert_role(allowed text[]) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() is null or not (public.my_role() = any(allowed)) then
    raise exception 'Akses ditolak: peran Anda tidak diizinkan untuk tindakan ini';
  end if;
end $$;

create or replace function public.assert_period_editable(p_period text) returns void
language plpgsql stable security definer set search_path = public as $$
declare st text;
begin
  select status into st from public.periods where period = p_period;
  if st is null then raise exception 'Periode % belum dibuat', p_period; end if;
  if st not in ('draft', 'calculated') then
    raise exception 'Periode % berstatus %. Data hanya bisa diubah saat Draft atau Dihitung', p_period, st;
  end if;
end $$;

-- ---------- Upload ----------
-- p_rows: array JSON baris yang sudah lolos validasi (kunci snake_case sesuai kolom tabel)
create or replace function public.replace_upload(
  p_period text, p_kind text, p_file_name text, p_storage_path text,
  p_rows jsonb, p_rejections jsonb
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform public.assert_role(array['hr_admin', 'hr_manager']);
  perform public.assert_period_editable(p_period);

  update public.uploads set is_current = false where period = p_period and kind = p_kind and is_current;

  insert into public.uploads (period, kind, file_name, storage_path, row_count, rejected_count, uploaded_by)
  values (p_period, p_kind, p_file_name, p_storage_path,
          jsonb_array_length(p_rows), jsonb_array_length(p_rejections), auth.uid())
  returning id into v_id;

  if p_kind = 'placement' then
    insert into public.employees (nik, name, join_date)
    select x.nik, x.name, x.join_date
    from jsonb_to_recordset(p_rows) as x(nik text, name text, join_date date)
    on conflict (nik) do update set name = excluded.name, join_date = excluded.join_date, updated_at = now();

    delete from public.placements where period = p_period;
    insert into public.placements (period, nik, position, store_code, superior_nik, facility)
    select p_period, x.nik, x.position, x.store_code, x.superior_nik, x.facility
    from jsonb_to_recordset(p_rows) as x(nik text, position text, store_code text, superior_nik text, facility text);

  elsif p_kind = 'sales' then
    insert into public.sales_rows (upload_id, invoice_no, invoice_date, store_code, nik, amount, category)
    select v_id, x.invoice_no, x.invoice_date, x.store_code, x.nik, x.amount, x.category
    from jsonb_to_recordset(p_rows) as x(invoice_no text, invoice_date date, store_code text, nik text, amount numeric, category text);

  elsif p_kind = 'returns' then
    insert into public.return_rows (upload_id, return_no, original_invoice_no, return_date, nik, amount, cause, has_ba)
    select v_id, x.return_no, x.original_invoice_no, x.return_date, x.nik, x.amount, x.cause, x.has_ba
    from jsonb_to_recordset(p_rows) as x(return_no text, original_invoice_no text, return_date date, nik text, amount numeric, cause text, has_ba boolean);

  elsif p_kind = 'attendance' then
    insert into public.attendance_rows (upload_id, nik, counts)
    select v_id, x.nik, x.counts
    from jsonb_to_recordset(p_rows) as x(nik text, counts jsonb);

  elsif p_kind = 'events' then
    insert into public.event_rows (upload_id, nik, indicator_code, event_date, value)
    select v_id, x.nik, x.indicator_code, x.event_date, x.value
    from jsonb_to_recordset(p_rows) as x(nik text, indicator_code text, event_date date, value numeric);

  else
    raise exception 'Jenis upload % tidak dikenal', p_kind;
  end if;

  insert into public.upload_rejections (upload_id, row_number, reason, raw)
  select v_id, x.row_number, x.reason, x.raw
  from jsonb_to_recordset(p_rejections) as x(row_number int, reason text, raw jsonb);

  -- Data berubah: hasil hitung sebelumnya tidak berlaku lagi
  update public.calc_runs set is_current = false where period = p_period and is_current;
  update public.periods set status = 'draft' where period = p_period;

  return v_id;
end $$;

-- ---------- Simpan hasil hitung ----------
create or replace function public.save_calc_run(
  p_period text, p_settings_version_id bigint, p_warnings jsonb, p_results jsonb
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform public.assert_role(array['hr_admin', 'hr_manager']);
  perform public.assert_period_editable(p_period);

  update public.calc_runs set is_current = false where period = p_period and is_current;
  insert into public.calc_runs (period, settings_version_id, warnings, created_by)
  values (p_period, p_settings_version_id, p_warnings, auth.uid())
  returning id into v_id;

  insert into public.calc_results (run_id, nik, position, store_code, tenure_months, target, score,
    tier_label, rate, incentive_base, incentive, components, warnings)
  select v_id, x.nik, x.position, x.store_code, x.tenure_months, x.target, x.score,
    x.tier_label, x.rate, x.incentive_base, x.incentive, x.components, x.warnings
  from jsonb_to_recordset(p_results) as x(nik text, position text, store_code text, tenure_months int,
    target numeric, score numeric, tier_label text, rate numeric, incentive_base numeric, incentive numeric,
    components jsonb, warnings jsonb);

  update public.periods set status = 'calculated', settings_version_id = p_settings_version_id
  where period = p_period;
  return v_id;
end $$;

-- ---------- Alur persetujuan ----------
-- submit: HR Admin/Manager, Dihitung -> Diajukan
-- approve / reject: HR Manager, Diajukan -> Disetujui / Dihitung
-- lock: HR Manager, Disetujui -> Dikunci
-- reopen: HR Manager, Disetujui/Dikunci -> Dihitung
create or replace function public.period_transition(p_period text, p_decision text, p_note text)
returns text
language plpgsql security definer set search_path = public as $$
declare st text; v_run bigint; v_new text;
begin
  select status into st from public.periods where period = p_period for update;
  if st is null then raise exception 'Periode % belum dibuat', p_period; end if;
  select id into v_run from public.calc_runs where period = p_period and is_current;
  if v_run is null then raise exception 'Periode % belum dihitung', p_period; end if;

  if p_decision = 'submitted' then
    perform public.assert_role(array['hr_admin', 'hr_manager']);
    if st <> 'calculated' then raise exception 'Hanya periode berstatus Dihitung yang bisa diajukan'; end if;
    v_new := 'submitted';
  elsif p_decision = 'approved' then
    perform public.assert_role(array['hr_manager']);
    if st <> 'submitted' then raise exception 'Hanya periode berstatus Diajukan yang bisa disetujui'; end if;
    v_new := 'approved';
  elsif p_decision = 'rejected' then
    perform public.assert_role(array['hr_manager']);
    if st <> 'submitted' then raise exception 'Hanya periode berstatus Diajukan yang bisa dikembalikan'; end if;
    if coalesce(length(trim(p_note)), 0) < 5 then raise exception 'Tulis alasan pengembalian'; end if;
    v_new := 'calculated';
  elsif p_decision = 'locked' then
    perform public.assert_role(array['hr_manager']);
    if st <> 'approved' then raise exception 'Hanya periode berstatus Disetujui yang bisa dikunci'; end if;
    v_new := 'locked';
  elsif p_decision = 'reopened' then
    perform public.assert_role(array['hr_manager']);
    if st not in ('approved', 'locked') then raise exception 'Hanya periode Disetujui atau Dikunci yang bisa dibuka kembali'; end if;
    if coalesce(length(trim(p_note)), 0) < 5 then raise exception 'Tulis alasan membuka kembali periode'; end if;
    v_new := 'calculated';
  else
    raise exception 'Keputusan % tidak dikenal', p_decision;
  end if;

  update public.periods
  set status = v_new,
      locked_at = case when v_new = 'locked' then now() else null end,
      locked_by = case when v_new = 'locked' then auth.uid() else null end
  where period = p_period;

  insert into public.approvals (period, run_id, decision, note, decided_by)
  values (p_period, v_run, p_decision, nullif(trim(p_note), ''), auth.uid());
  return v_new;
end $$;

-- ---------- Override insentif ----------
create or replace function public.add_override(p_period text, p_nik text, p_new_value numeric, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_run bigint; v_old numeric;
begin
  perform public.assert_role(array['hr_admin', 'hr_manager']);
  perform public.assert_period_editable(p_period);
  if p_new_value < 0 then raise exception 'Nilai insentif tidak boleh minus'; end if;
  select id into v_run from public.calc_runs where period = p_period and is_current;
  if v_run is null then raise exception 'Periode % belum dihitung', p_period; end if;
  select coalesce(
    (select new_value from public.overrides where run_id = v_run and nik = p_nik order by id desc limit 1),
    (select incentive from public.calc_results where run_id = v_run and nik = p_nik))
  into v_old;
  if v_old is null then raise exception 'NIK % tidak ada di hasil hitung', p_nik; end if;
  insert into public.overrides (run_id, nik, field, old_value, new_value, reason, created_by)
  values (v_run, p_nik, 'incentive', v_old, p_new_value, trim(p_reason), auth.uid());
end $$;

-- Hasil dengan insentif akhir (setelah override terakhir)
create or replace view public.calc_results_effective with (security_invoker = true) as
select r.*,
       o.new_value as override_value,
       o.reason as override_reason,
       coalesce(o.new_value, r.incentive) as final_incentive
from public.calc_results r
left join lateral (
  select new_value, reason from public.overrides x
  where x.run_id = r.run_id and x.nik = r.nik and x.field = 'incentive'
  order by x.id desc limit 1
) o on true;

-- Hanya fungsi di atas yang boleh dipanggil pengguna login
revoke execute on function public.replace_upload(text, text, text, text, jsonb, jsonb) from public, anon;
revoke execute on function public.save_calc_run(text, bigint, jsonb, jsonb) from public, anon;
revoke execute on function public.period_transition(text, text, text) from public, anon;
revoke execute on function public.add_override(text, text, numeric, text) from public, anon;
grant execute on function public.replace_upload(text, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.save_calc_run(text, bigint, jsonb, jsonb) to authenticated;
grant execute on function public.period_transition(text, text, text) to authenticated;
grant execute on function public.add_override(text, text, numeric, text) to authenticated;
