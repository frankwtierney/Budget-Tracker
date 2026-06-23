import { useState, useEffect } from 'react';
import { useBuilding } from '../../contexts/BuildingContext';
import { useSystem } from '../../contexts/SystemContext';
import { updateDocument } from '../../lib/firestore';
import { formatDate } from '../../lib/format';
import Button from '../shared/Button';
import Input from '../shared/Input';

const RECON_CYCLES = [
  { value: '', label: '— None —' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'custom', label: 'Custom' },
];

const EVENT_INTEGRATION = [
  { value: 'none', label: 'None — no event tagging' },
  { value: 'free_text', label: 'Free text — title only' },
  { value: 'ub_linked', label: 'UB Linked — title + event ID' },
];

export default function BuildingSettings({ building }) {
  const { fiscalYear } = useBuilding();
  const { systemDoc } = useSystem();
  const periodNames = systemDoc?.periods?.fixed ?? ['Fall', 'Spring'];
  const [form, setForm] = useState(formFromBuilding(building));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState('');

  // Reset form whenever the active building changes
  useEffect(() => {
    setForm(formFromBuilding(building));
    setSavedAt(null);
    setError('');
  }, [building?.id]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await updateDocument(`buildings/${building.id}`, {
        name: form.name.trim() || building.name,
        type: form.type.trim() || null,
        settings: {
          trackPersonalBudgets: !!form.trackPersonalBudgets,
          reconciliationCycle: form.reconciliationCycle || null,
          subGroupingLabel: form.subGroupingLabel.trim() || null,
          eventIntegration: form.eventIntegration || 'none',
        },
      });
      setSavedAt(new Date());
    } catch (err) {
      console.error(err);
      setError(`Failed to save: ${err.message ?? 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Building Settings</h2>
          <p className="text-sm text-gray-500">{building.name}</p>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && !saving && (
            <span className="text-xs text-gray-400">
              Saved {savedAt.toLocaleTimeString()}
            </span>
          )}
          <Button onClick={handleSave} loading={saving} disabled={saving}>Save</Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        <Section title="Identity">
          <Input
            label="Name"
            id="name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
          <Input
            label="Type"
            id="type"
            value={form.type}
            placeholder="Residence Hall, Success Center, etc."
            onChange={(e) => set('type', e.target.value)}
          />
          <ReadOnlyRow label="Active Fiscal Year" value={fiscalYear?.label ?? '—'} />
        </Section>

        <Section title="Personal Budgets">
          <Toggle
            label="Track personal budgets for CAs / staff"
            help="When on, the Staff page and Admin → Staff Roster become available. Each CA gets a personal budget; transactions can be split across CAs."
            checked={form.trackPersonalBudgets}
            onChange={(v) => set('trackPersonalBudgets', v)}
          />
        </Section>

        <Section title="Periods">
          {fiscalYear?.splitDate ? (
            <ReadOnlyRow
              label="Period split"
              value={`${periodNames[0]} / ${periodNames[1]} at ${formatDate(fiscalYear.splitDate)}`}
            />
          ) : (
            <ReadOnlyRow label="Period split" value="Year-round (no split)" />
          )}
          <p className="text-xs text-gray-500">
            Periods are set for the whole department, so every building's reports
            match. Names: System → Periods. Split date: Admin → Fiscal Years.
          </p>
        </Section>

        <Section title="Reconciliation">
          <SelectRow
            label="Reconciliation cycle"
            value={form.reconciliationCycle}
            options={RECON_CYCLES}
            onChange={(v) => set('reconciliationCycle', v)}
          />
        </Section>

        <Section title="Events">
          <SelectRow
            label="Event integration"
            help="Controls the Event field on the expense modal."
            value={form.eventIntegration}
            options={EVENT_INTEGRATION}
            onChange={(v) => set('eventIntegration', v)}
          />
        </Section>

        <Section title="Sub-grouping">
          <Input
            label="Label"
            id="subGroupingLabel"
            value={form.subGroupingLabel}
            placeholder="e.g. Hall, Floor, Team — leave blank to disable"
            helpText="Adds an optional tag field on the expense modal. Useful when you want to attribute spend to a sub-area beyond the building."
            onChange={(e) => set('subGroupingLabel', e.target.value)}
          />
        </Section>
      </div>
    </div>
  );
}

function formFromBuilding(b) {
  const s = b?.settings ?? {};
  return {
    name: b?.name ?? '',
    type: b?.type ?? '',
    trackPersonalBudgets: !!s.trackPersonalBudgets,
    reconciliationCycle: s.reconciliationCycle ?? '',
    subGroupingLabel: s.subGroupingLabel ?? '',
    eventIntegration: s.eventIntegration ?? 'none',
  };
}

function Section({ title, children }) {
  return (
    <div className="px-4 py-4 space-y-3">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{title}</p>
      {children}
    </div>
  );
}

function Toggle({ label, help, checked, onChange }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span className="text-sm text-gray-700">
        {label}
        {help && <span className="block text-xs text-gray-500 mt-0.5">{help}</span>}
      </span>
    </label>
  );
}

function SelectRow({ label, value, options, onChange, help }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {help && <p className="text-xs text-gray-500 mt-1">{help}</p>}
    </div>
  );
}

function ReadOnlyRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-gray-600">{label}</span>
      <span className="text-sm text-gray-800">{value}</span>
    </div>
  );
}
