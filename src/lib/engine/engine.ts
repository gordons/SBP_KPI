import type {
  CalcOutput,
  ComponentDef,
  ComponentResult,
  EmployeeResult,
  IndicatorDef,
  PeriodInput,
  Placement,
  PositionTemplate,
  Settings,
  StoreConfig,
} from './types';

// -------------------------------------------------------------
// Utilitas
// -------------------------------------------------------------

/** Akhir bulan periode 'YYYY-MM' sebagai [tahun, bulan(1-12), hari]. */
export function periodEnd(period: string): [number, number, number] {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [y, m, last];
}

/** Masa kerja dalam bulan penuh, setara DATEDIF(join, akhir periode, "M"). */
export function tenureMonths(joinDate: string, period: string): number {
  const [jy, jm, jd] = joinDate.slice(0, 10).split('-').map(Number);
  const [py, pm, pd] = periodEnd(period);
  let months = (py - jy) * 12 + (pm - jm);
  if (pd < jd) months -= 1;
  return Math.max(0, months);
}

/** Pembulatan seperti ROUND() Excel (half away from zero). */
export function roundTo(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.sign(x) * Math.round(Math.abs(x) * f + 1e-9) / f;
}

function stepLookup(rows: { min: number; value: number }[], n: number): number {
  const sorted = [...rows].sort((a, b) => b.min - a.min);
  for (const r of sorted) if (n >= r.min) return r.value;
  return sorted.length ? sorted[sorted.length - 1].value : 0;
}

// -------------------------------------------------------------
// Mesin hitung
// -------------------------------------------------------------

export function calculate(input: PeriodInput, settings: Settings): CalcOutput {
  return new Engine(input, settings).run();
}

class Engine {
  private byNik = new Map<string, Placement>();
  private stores = new Map<string, StoreConfig>();
  private templates = new Map<string, PositionTemplate>();
  private indicators = new Map<string, IndicatorDef>();
  private targetMemo = new Map<string, number | null>();
  private resultMemo = new Map<string, EmployeeResult>();
  private inProgress = new Set<string>();
  private globalWarnings: string[] = [];

  constructor(private input: PeriodInput, private s: Settings) {
    for (const p of input.placements) {
      if (this.byNik.has(p.nik)) this.globalWarnings.push(`NIK ${p.nik} muncul lebih dari sekali di penempatan.`);
      this.byNik.set(p.nik, p);
    }
    for (const st of s.stores) this.stores.set(st.code, st);
    for (const t of s.templates) this.templates.set(t.position, t);
    for (const i of s.indicators) this.indicators.set(i.code, i);
  }

  run(): CalcOutput {
    const results = this.input.placements
      .filter((p) => this.templates.has(p.position))
      .map((p) => this.result(p.nik));
    for (const p of this.input.placements) {
      if (!this.templates.has(p.position)) {
        this.globalWarnings.push(`Jabatan ${p.position} (NIK ${p.nik}) belum punya template KPI.`);
      }
    }
    return { period: this.input.period, results, warnings: this.globalWarnings };
  }

  // ---------- relasi ----------

  private directReports(nik: string): Placement[] {
    return this.input.placements.filter((p) => p.superiorNik === nik);
  }

  private storeMembers(store: string, position?: string): Placement[] {
    return this.input.placements.filter((p) => p.store === store && (!position || p.position === position));
  }

  private teamNiks(nik: string): Set<string> {
    // diri sendiri + semua bawahan (rekursif)
    const out = new Set<string>([nik]);
    const stack = [nik];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const r of this.directReports(cur)) {
        if (!out.has(r.nik)) {
          out.add(r.nik);
          stack.push(r.nik);
        }
      }
    }
    return out;
  }

  private store(code: string): StoreConfig {
    const st = this.stores.get(code);
    if (!st) throw new Error(`Toko ${code} belum terdaftar di Setting.`);
    return st;
  }

  // ---------- target ----------

  private storeTarget(store: string): number {
    const t = this.s.storeTargets[store]?.[this.input.period];
    if (t === undefined) throw new Error(`Target toko ${store} untuk ${this.input.period} belum diisi.`);
    return t;
  }

  /** Koefisien bulan = target toko bulan ini / rata-rata target toko 12 bulan di tahun yang sama. */
  private monthCoefficient(store: string): number {
    const year = this.input.period.slice(0, 4);
    const months = Object.entries(this.s.storeTargets[store] ?? {}).filter(([k]) => k.startsWith(year));
    if (months.length !== 12) {
      throw new Error(`Target toko ${store} tahun ${year} harus lengkap 12 bulan (baru ${months.length}).`);
    }
    const avg = months.reduce((a, [, v]) => a + v, 0) / 12;
    return this.storeTarget(store) / avg;
  }

  private spTarget(p: Placement): number {
    const st = this.store(p.store);
    if (st.spTargetMethod === 'tenure') {
      const tbl = this.s.tenureTables[st.group];
      if (!tbl) throw new Error(`Tabel masa kerja grup ${st.group} belum diisi.`);
      const months = tenureMonths(p.joinDate, this.input.period);
      const ladder = tbl.steps.filter((x) => months > x.afterMonths).reduce((a, x) => a + x.amount, 0);
      const facility = p.facility ? tbl.facilityAmounts[p.facility] ?? 0 : 0;
      return (tbl.baseTarget + ladder + facility) * this.monthCoefficient(p.store);
    }
    // split: (target toko - target pribadi TL x jumlah TL) / jumlah SP
    const nTL = this.storeMembers(p.store, 'TL').length;
    const nSP = this.storeMembers(p.store, p.position).length;
    if (nSP === 0) return 0;
    return (this.storeTarget(p.store) - st.tlPersonalTarget * nTL) / nSP;
  }

  private targetFor(p: Placement, c: ComponentDef): number | null {
    const key = `${p.nik}|${JSON.stringify(c.target)}`;
    if (this.targetMemo.has(key)) return this.targetMemo.get(key)!;
    let v: number | null = null;
    const t = c.target;
    if (t) {
      switch (t.type) {
        case 'sp_target':
          v = this.spTarget(p);
          break;
        case 'store_target':
          v = this.storeTarget(p.store);
          break;
        case 'tl_personal':
          v = this.store(p.store).tlPersonalTarget;
          break;
        case 'fixed':
          v = t.value;
          break;
        case 'team_sum': {
          let sum = 0;
          for (const r of this.directReports(p.nik)) sum += this.primaryTarget(r) ?? 0;
          if (t.includeOwn === 'tl_personal') sum += this.store(p.store).tlPersonalTarget;
          v = sum;
          break;
        }
      }
    }
    this.targetMemo.set(key, v);
    return v;
  }

  /** Target utama seorang karyawan (komponen primary di template jabatannya). */
  private primaryTarget(p: Placement): number | null {
    const tpl = this.templates.get(p.position);
    if (!tpl) return null;
    const c = tpl.components.find((x) => x.code === tpl.primaryComponent);
    return c ? this.targetFor(p, c) : null;
  }

  // ---------- indikator ----------

  private indicator(code: string, p: Placement): number | null {
    const def = this.indicators.get(code);
    if (!def) throw new Error(`Indikator ${code} belum didefinisikan.`);
    const scope = (nik: string | null, store: string) => {
      if (def.level === 'store') return store === p.store;
      if (!nik) return false;
      if (def.level === 'self') return nik === p.nik;
      return this.teamNiks(p.nik).has(nik);
    };
    const r = this.s.dataRules;
    switch (def.source) {
      case 'sales': {
        const rows = this.input.sales.filter(
          (x) => r.salesCategoriesCounted.includes(x.category) && scope(x.nik, x.store),
        );
        return def.agg === 'count' ? rows.length : rows.reduce((a, x) => a + x.amount, 0);
      }
      case 'returns': {
        const rows = this.input.returns.filter(
          (x) =>
            (r.returnCausesCounted === 'ALL' || r.returnCausesCounted.includes(x.cause)) &&
            scope(x.nik, this.byNik.get(x.nik)?.store ?? ''),
        );
        return def.agg === 'count' ? rows.length : rows.reduce((a, x) => a + x.amount, 0);
      }
      case 'attendance': {
        const rows = this.input.attendance.filter((x) => scope(x.nik, this.byNik.get(x.nik)?.store ?? ''));
        if (def.level === 'self' && rows.length === 0) return null; // tidak ada data absensi
        return rows.reduce(
          (a, x) => a + r.absenceCodesCounted.reduce((b, code) => b + (x.counts[code] ?? 0), 0),
          0,
        );
      }
      case 'events': {
        const rows = this.input.events.filter(
          (x) => x.indicatorCode === def.eventCode && scope(x.nik, this.byNik.get(x.nik)?.store ?? ''),
        );
        return def.agg === 'count' ? rows.length : rows.reduce((a, x) => a + x.value, 0);
      }
    }
  }

  // ---------- skor ----------

  private result(nik: string): EmployeeResult {
    const memo = this.resultMemo.get(nik);
    if (memo) return memo;
    if (this.inProgress.has(nik)) throw new Error(`Ketergantungan melingkar pada NIK ${nik}.`);
    this.inProgress.add(nik);

    const p = this.byNik.get(nik)!;
    const tpl = this.templates.get(p.position)!;
    const warnings: string[] = [];

    const comps: ComponentResult[] = tpl.components.map((c) => this.component(p, c, warnings));

    // Pengalihan bobot komponen yang nonaktif / tanpa data
    const activeWeight = comps.filter((c) => c.status === 'ok').reduce((a, c) => a + c.weight, 0);
    const totalWeight = comps.reduce((a, c) => a + c.weight, 0);
    const factor = this.s.redistributeInactiveWeight && activeWeight > 0 ? totalWeight / activeWeight : 1;
    for (const c of comps) {
      c.weight = c.status === 'ok' ? c.weight * factor : 0;
      c.weighted = c.status === 'ok' && c.value !== null ? c.value * c.weight : 0;
    }

    const score = roundTo(comps.reduce((a, c) => a + c.weighted, 0), 4);
    const tier = this.s.tierTables[this.store(p.store).tierTable];
    let rate = 0;
    let tierLabel = tier.belowLabel;
    const rates = tier.rates[p.position] ?? [];
    for (let i = 0; i < tier.thresholds.length; i++) {
      if (score >= tier.thresholds[i]) {
        rate = rates[i] ?? 0;
        tierLabel = `${Math.round(tier.thresholds[i] * 100)}%`;
        break;
      }
    }
    const base = this.indicator(tpl.incentiveBase, p) ?? 0;
    const raw = rate > 0 ? base * rate : 0;
    const step = this.s.incentiveRounding || 1;
    const incentive = Math.max(0, Math.round(raw / step) * step);

    const res: EmployeeResult = {
      nik: p.nik,
      name: p.name,
      position: p.position,
      store: p.store,
      tenureMonths: tenureMonths(p.joinDate, this.input.period),
      target: this.primaryTarget(p),
      components: comps,
      score,
      tierLabel,
      rate,
      incentiveBase: base,
      incentive,
      warnings,
    };
    this.inProgress.delete(nik);
    this.resultMemo.set(nik, res);
    return res;
  }

  private component(p: Placement, c: ComponentDef, warnings: string[]): ComponentResult {
    const base: ComponentResult = {
      code: c.code,
      name: c.name,
      method: c.method,
      target: null,
      achieve: null,
      pct: null,
      value: null,
      weight: c.weight,
      weighted: 0,
      status: 'ok',
    };
    if (!c.active) return { ...base, status: 'inactive', note: 'Komponen nonaktif' };

    if (c.method === 'ratio') {
      const target = this.targetFor(p, c);
      const achieve = this.indicator(c.indicator!, p);
      base.target = target;
      base.achieve = achieve;
      if (achieve === null) {
        warnings.push(`${c.name}: belum ada data.`);
        return { ...base, status: 'no_data' };
      }
      let pct: number;
      if ((c.direction ?? 'higher') === 'higher') {
        if (!target) {
          warnings.push(`${c.name}: target 0, nilai dianggap 0.`);
          pct = 0;
        } else pct = achieve / target;
      } else {
        if (!achieve) {
          warnings.push(`${c.name}: aktual 0 pada indikator "makin kecil makin baik", nilai diambil dari batas atas.`);
          pct = c.cap ?? 0;
        } else pct = (target ?? 0) / achieve;
      }
      const value = c.cap != null ? Math.min(pct, c.cap) : pct;
      return { ...base, pct, value };
    }

    if (c.method === 'step') {
      const n = this.indicator(c.indicator!, p);
      base.achieve = n;
      if (n === null) {
        warnings.push(`${c.name}: belum ada data.`);
        return { ...base, status: 'no_data' };
      }
      const table = this.s.stepTables[c.stepTable!];
      if (!table) throw new Error(`Tabel tangga ${c.stepTable} belum diisi.`);
      const value = stepLookup(table, n);
      return { ...base, pct: value, value };
    }

    // subordinate_pass: % bawahan dengan skor >= ambang
    const sub = c.subordinate!;
    const group =
      sub.scope === 'direct'
        ? this.directReports(p.nik).filter((r) => r.position === sub.position)
        : this.storeMembers(p.store, sub.position).filter((r) => r.nik !== p.nik);
    const scored = group.filter((r) => this.templates.has(r.position)).map((r) => this.result(r.nik));
    if (scored.length === 0) {
      warnings.push(`${c.name}: tidak ada ${sub.position} untuk dinilai, bobot dialihkan.`);
      return { ...base, status: 'no_data' };
    }
    const pass = scored.filter((r) => r.score >= sub.threshold).length;
    const value = pass / scored.length;
    return { ...base, target: scored.length, achieve: pass, pct: value, value };
  }
}
