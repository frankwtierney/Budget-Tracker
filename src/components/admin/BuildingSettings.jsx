import { useState, useEffect } from 'react';
import { useBuilding } from '../../contexts/BuildingContext';
import { updateDocument } from '../../lib/firestore';
import Button from '../shared/Button';
import Input from '../shared/Input';

export default function BuildingSettings({ building }) {
  const { fiscalYear } = useBuilding();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function openEditor() {
    const s = building.settings ?? {};
    setForm({
      name: building.name ?? '',
      type: building.type ?? '',
      splitPeriods: s.splitPeriods ?? false,
      splitPeriodName0: s.splitPeriodNames?.[0] ?? 'Fall',
      splitPeriodName1: s.splitPeriodNames?.[1] ?? 'Spring',
      reconciliationCycle: s.reconciliationCycle ?? 'monthly',
      trackPersonalBudgets: s.trackPersonalBudgets ?? false,
      subGroupingLabel: s.subGroupingLabel ?? '',
      eventIntegration: s.eventIntegration ?? 'none',
    });
    setError('');
    setEditing(true);
  }

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) return setError('Building name is required.');
    setSaving(true);
    setError('');
    try {
      await updateDocument(`buildings/${building.id}`, {
        name: form.name.trim(),
        type: form.type.trim(),
        settings: {
          ...(building.settings ?? {}),
          splitPeriods: form.splitPeriods,
          splitPeriodNames: [form.splitPeriodName0.trim() || 'Fall', form.splitPeriodName1.trim() || 'Spring'],
          reconciliationCycle: form.reconciliationCycle,
          trackPersonalBudgets: form.trackPersonalBudgets,
          subGroupingLabel: form.subGroupingLabel.trim() || null,
          eventIntegration: form.eventIntegration,
        },
      });
      setEditing(false);
      setSuccess('Settings saved.');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      console.error(err);
      setError('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const s = building.settings ?? {};

  if (editing && form) {
    return (
      <div className="max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Building Settings</h2>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          {/* Identity */}
          <Section title="Identity">
            <Input
              label="Building Name"
              id="buildingName"
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
            <Input
              label="Type"
              id="buildingType"
              value={form.type}
              onChange={(e) => set('type', e.target.value)}
              placeholder="e.g. Elementary, Middle, High School"
            />
          </Section>

          {/* Periods */}
          <Section title="Budget Periods">
            <Toggle
              label="Split fiscal year into two periods"
              checked={form.splitPeriods}
              onChange={(v) => set('splitPeriods', v)}
            />
            {form.splitPeriods && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <Input
                  label="Period 1 Name"
                  id="period1Name"
                  value={form.splitPeriodName0}
                  onChange={(e) => set('splitPeriodName0', e.target.value)}
                  placeholder="Fall"
                />
                <Input
                  label="Period 2 Name"
                  id="period2Name"
                  value={form.splitPeriodName1}
                  onChange={(e) => set('splitPeriodName1', e.target.value)}
                  placeholder="Spring"
                />
              </div>
            )}
          </Section>

          {/* Reconciliation */}
          <Section title="Reconciliation">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reconciliation Cycle
              </label>
              <select
                value={form.reconciliationCycle}
                onChange={(e) => set('reconciliationCycle', e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="none">None</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          </Section>

          {/* Staff */}
          <Section title="Staff Budgets">
            <Toggle
              label="Track personal staff budgets"
              checked={form.trackPersonalBudgets}
              onChange={(v) => set('trackPersonalBudgets', v)}
            />
          </Section>

          {/* Sub-grouping */}
          <Section title="Custom Fields">
            <Input
              label="Sub-grouping Label (optional)"
              id="subGroupingLabel"
              value={form.subGroupingLabel}
              onChange={(e) => set('subGroupingLabel', e.target.value)}
              placeholder='e.g. "Grant Code", "Program Tag"'
              helpText="Adds a custom text field to each expense entry."
            />
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Event Integration
              </label>
              <select
                value={form.eventIntegration}
                onChange={(e) => set('eventIntegration', e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="none">None</option>
                <option value="free_text">Free Text</option>
              </select>
            </div>
          </Section>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Save Settings</Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Building Settings</h2>
        <Button variant="secondary" size="sm" onClick={openEditor}>Edit</Button>
      </div>

      {success && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{success}</p>
      )}

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

function Section({ title, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
          checked ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-1'
          }`}
        />
      </button>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}
