import fixture from './fixtures/okt-2026.json';
import { calculate, SBP_SETTINGS_2026 as S, type PeriodInput } from '../src/lib/engine';
import type { ExportData } from '../src/lib/export';

/** ExportData dari hasil hitung data Oktober (tanpa database). */
export function octoberExport(status = 'calculated'): ExportData {
  const input = fixture.input as unknown as PeriodInput;
  const out = calculate(input, S);
  const byNik = new Map(input.placements.map((p) => [p.nik, p]));
  return {
    period: '2026-10',
    status,
    calculatedAt: '2026-11-03T03:00:00Z',
    settingsVersionId: 1,
    settings: S,
    generatedAt: '2026-11-05T02:00:00Z',
    approvals: status === 'locked' ? [{ decision: 'locked', by: 'HR Manager', at: '2026-11-04T08:00:00Z', note: null }] : [],
    rows: out.results.map((r) => {
      const p = byNik.get(r.nik)!;
      const ov = r.nik === '190107' ? 750000 : null;
      return {
        nik: r.nik,
        name: r.name,
        position: r.position,
        positionName: S.lists.positions.find((x) => x.code === r.position)?.name ?? r.position,
        store: r.store,
        superiorName: p.superiorNik ? byNik.get(p.superiorNik)?.name ?? null : null,
        joinDate: p.joinDate,
        tenureMonths: r.tenureMonths,
        target: r.target,
        achieve: r.components[0]?.achieve ?? null,
        score: r.score,
        tierLabel: r.tierLabel,
        rate: r.rate,
        incentiveBase: r.incentiveBase,
        incentive: r.incentive,
        overrideValue: ov,
        overrideReason: ov ? 'Koreksi faktur salah input' : null,
        finalIncentive: ov ?? r.incentive,
        components: r.components,
        warnings: r.warnings,
      };
    }),
  };
}
