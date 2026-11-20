import type { ComponentResult, Settings } from '../engine/types';

// Data siap-export (tidak bergantung pada Supabase, supaya bisa diuji langsung)

export interface ExportRow {
  nik: string;
  name: string;
  position: string;
  positionName: string;
  store: string;
  superiorName: string | null;
  joinDate: string | null;
  tenureMonths: number;
  target: number | null;
  achieve: number | null;
  score: number;
  tierLabel: string;
  rate: number;
  incentiveBase: number;
  incentive: number;
  overrideValue: number | null;
  overrideReason: string | null;
  finalIncentive: number;
  components: ComponentResult[];
  warnings: string[];
}

export interface ExportApproval {
  decision: string;
  by: string;
  at: string;
  note: string | null;
}

export interface ExportData {
  period: string; // 'YYYY-MM'
  status: string;
  calculatedAt: string;
  settingsVersionId: number | null;
  settings: Settings;
  rows: ExportRow[];
  approvals: ExportApproval[];
  generatedAt: string;
}

export const POSITION_ORDER = ['SM', 'ASM', 'TL', 'SP'];

export function sortRows(rows: ExportRow[]): ExportRow[] {
  const pos = (p: string) => {
    const i = POSITION_ORDER.indexOf(p);
    return i === -1 ? 99 : i;
  };
  return [...rows].sort(
    (a, b) => a.store.localeCompare(b.store) || pos(a.position) - pos(b.position) || a.name.localeCompare(b.name),
  );
}

export const DECISION_LABEL: Record<string, string> = {
  submitted: 'Diajukan',
  approved: 'Disetujui',
  rejected: 'Dikembalikan',
  locked: 'Dikunci',
  reopened: 'Dibuka kembali',
};
