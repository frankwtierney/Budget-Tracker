import { useState } from 'react';
import { useBuilding } from '../../contexts/BuildingContext';
import { addDocument, serverTimestamp } from '../../lib/firestore';
import { toTimestamp, formatDate } from '../../lib/format';
import Button from '../shared/Button';
import Input from '../shared/Input';
import Modal from '../shared/Modal';

export default function FiscalYearsAdmin({ building }) {
  const { fiscalYears, activateFiscalYear, fiscalYear: viewingYear } = useBuilding();
  const [showNew, setShowNew] = useState(false);
  const [activating, setActivating] = useState(null);

  async function handleActivate(fy) {
    setActivating(fy.id);
    try {
      await activateFiscalYear(fy.id);
    } finally {
      setActivating(null);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Fiscal Years</h2>
          <p className="text-sm text-gray-500">{fiscalYears.length} year{fiscalYears.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setShowNew(true)}>+ New Fiscal Year</Button>
      </div>

      {fiscalYears.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg text-gray-400">
          No fiscal years found.
        </div>
      ) : (
        <div className="space-y-2">
          {fiscalYears.map((fy) => {
            const isActive = fy.id === building.activeFiscalYearId;
            const isViewing = fy.id === viewingYear?.id;
            return (
              <div
                key={fy.id}
                className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
                  isActive
                    ? 'border-green-200 bg-green-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">{fy.label}</span>
                      {isActive && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                          Active
                        </span>
                      )}
                      {isViewing && !isActive && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                          Viewing
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDate(fy.startDate)} – {formatDate(fy.endDate)}
                      {fy.splitDate && (
                        <span className="ml-2">· split {formatDate(fy.splitDate)}</span>
                      )}
                    </p>
                  </div>
                </div>

                {!isActive && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={activating === fy.id}
                    onClick={() => handleActivate(fy)}
                  >
                    Activate
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
        <strong>Activating</strong> a fiscal year sets it as the target for new expense entries.
        You can still browse any year's data using the year picker in the sidebar — activating
        doesn't delete or hide historical records.
      </div>

      <NewFiscalYearModal
        isOpen={showNew}
        onClose={() => setShowNew(false)}
        building={building}
        existingYears={fiscalYears}
      />
    </div>
  );
}

function NewFiscalYearModal({ isOpen, onClose, building, existingYears }) {
  const { activateFiscalYear } = useBuilding();
  const [form, setForm] = useState(defaultForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function defaultForm() {
    return {
      label: '',
      fyStart: '',
      fyEnd: '',
      splitPeriods: false,
      splitPeriodName0: 'Fall',
      splitPeriodName1: 'Spring',
      splitDate: '',
      activateNow: true,
    };
  }

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Auto-suggest label from dates
  function suggestedLabel() {
    if (!form.fyStart || !form.fyEnd) return '';
    const startYear = new Date(form.fyStart).getFullYear();
    const endYear = new Date(form.fyEnd).getFullYear();
    return startYear === endYear ? `FY ${startYear}` : `AY ${startYear}–${endYear}`;
  }

  function validate() {
    if (!form.fyStart || !form.fyEnd) return 'Start and end dates are required.';
    if (new Date(form.fyStart) >= new Date(form.fyEnd))
      return 'End date must be after start date.';
    if (form.splitPeriods && !form.splitDate)
      return 'Split date is required when using split periods.';
    const start = new Date(form.fyStart);
    const end = new Date(form.fyEnd);
    for (const fy of existingYears) {
      const fyStart = fy.startDate?.toDate?.() ?? new Date(0);
      const fyEnd = fy.endDate?.toDate?.() ?? new Date(0);
      if (start < fyEnd && end > fyStart) {
        return `Date range overlaps with existing fiscal year "${fy.label}".`;
      }
    }
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const err = validate();
    if (err) return setError(err);

    setSaving(true);
    setError('');
    try {
      const label = form.label.trim() || suggestedLabel();
      const fyId = await addDocument(`buildings/${building.id}/fiscalYears`, {
        label,
        startDate: toTimestamp(form.fyStart),
        endDate: toTimestamp(form.fyEnd),
        splitDate:
          form.splitPeriods && form.splitDate ? toTimestamp(form.splitDate) : null,
        splitPeriodNames: form.splitPeriods
          ? [form.splitPeriodName0 || 'Fall', form.splitPeriodName1 || 'Spring']
          : null,
        status: 'active',
        createdAt: serverTimestamp(),
      });

      if (form.activateNow) {
        await activateFiscalYear(fyId);
      }

      setForm(defaultForm());
      onClose();
    } catch (err) {
      console.error(err);
      setError('Failed to create fiscal year. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Fiscal Year" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Start Date"
            id="fyStart"
            type="date"
            required
            value={form.fyStart}
            onChange={(e) => set('fyStart', e.target.value)}
          />
          <Input
            label="End Date"
            id="fyEnd"
            type="date"
            required
            value={form.fyEnd}
            onChange={(e) => set('fyEnd', e.target.value)}
          />
        </div>

        <Input
          label="Label"
          id="fyLabel"
          value={form.label}
          onChange={(e) => set('label', e.target.value)}
          placeholder={suggestedLabel() || 'AY 2026–2027'}
          helpText="Leave blank to auto-generate."
        />

        {/* Split periods */}
        <div className="border border-gray-200 rounded-lg p-3 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.splitPeriods}
              onChange={(e) => set('splitPeriods', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-700">Split into two periods</span>
          </label>

          {form.splitPeriods && (
            <div className="pl-7 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Period 1 Name"
                  id="p1name"
                  value={form.splitPeriodName0}
                  onChange={(e) => set('splitPeriodName0', e.target.value)}
                  placeholder="Fall"
                />
                <Input
                  label="Period 2 Name"
                  id="p2name"
                  value={form.splitPeriodName1}
                  onChange={(e) => set('splitPeriodName1', e.target.value)}
                  placeholder="Spring"
                />
              </div>
              <Input
                label="Split Date (end of Period 1)"
                id="splitDate"
                type="date"
                required
                value={form.splitDate}
                onChange={(e) => set('splitDate', e.target.value)}
                helpText="Transactions on or before this date are Period 1."
              />
            </div>
          )}
        </div>

        {/* Activate now */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.activateNow}
            onChange={(e) => set('activateNow', e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm text-gray-700">
            Make this the active year immediately
          </span>
        </label>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Create Fiscal Year</Button>
        </div>
      </form>
    </Modal>
  );
}
