import { useBuilding } from '../../contexts/BuildingContext';

export default function BuildingSettings({ building }) {
  const { fiscalYear } = useBuilding();
  const s = building.settings ?? {};

  return (
    <div className="space-y-4 max-w-lg">
      <h2 className="text-xl font-semibold text-gray-900">Building Settings</h2>

      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        <Row label="Name" value={building.name} />
        <Row label="Type" value={building.type || '—'} />
        <Row label="Active Fiscal Year" value={fiscalYear?.label ?? '—'} />
        <Row label="Split Periods" value={s.splitPeriods ? `Yes (${s.splitPeriodNames?.join(' / ')})` : 'No'} />
        <Row label="Reconciliation Cycle" value={s.reconciliationCycle ?? '—'} />
        <Row label="Track Personal Budgets" value={s.trackPersonalBudgets ? 'Yes' : 'No'} />
        <Row label="Sub-grouping Label" value={s.subGroupingLabel || '—'} />
        <Row label="Event Integration" value={s.eventIntegration ?? '—'} />
      </div>

      <p className="text-sm text-gray-400">
        Building settings editing coming in Phase 2.
      </p>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm font-medium text-gray-600">{label}</span>
      <span className="text-sm text-gray-800">{value}</span>
    </div>
  );
}
