import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  setDocument,
  addDocument,
  getBatch,
  batchSet,
  newDocId,
  serverTimestamp,
} from '../lib/firestore';
import { toTimestamp } from '../lib/format';
import { APP_NAME } from '../config';
import Button from '../components/shared/Button';
import Input from '../components/shared/Input';

const RECONCILIATION_CYCLES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'custom', label: 'Custom' },
];

export default function Setup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    buildingName: '',
    buildingType: '',
    fyLabel: '',
    fyStart: '',
    fyEnd: '',
    splitPeriods: false,
    splitPeriodNames: ['Fall', 'Spring'],
    splitDate: '',
    reconciliationCycle: 'monthly',
    trackPersonalBudgets: false,
    subGroupingLabel: '',
  });

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.buildingName.trim()) return setError('Building name is required.');
    if (!form.fyStart || !form.fyEnd) return setError('Fiscal year start and end dates are required.');
    if (new Date(form.fyStart) >= new Date(form.fyEnd))
      return setError('Fiscal year end must be after start.');
    if (form.splitPeriods && !form.splitDate)
      return setError('Split date is required when split periods are enabled.');

    setLoading(true);
    try {
      const buildingId = newDocId('buildings');
      const fyId = newDocId(`buildings/${buildingId}/fiscalYears`);

      const fyLabel =
        form.fyLabel.trim() ||
        `AY ${new Date(form.fyStart).getFullYear()}–${new Date(form.fyEnd).getFullYear()}`;

      const batch = getBatch();

      batchSet(batch, `buildings/${buildingId}`, {
        name: form.buildingName.trim(),
        type: form.buildingType.trim(),
        organizationId: null,
        roles: { [user.uid]: 'admin' },
        activeFiscalYearId: fyId,
        settings: {
          splitPeriods: form.splitPeriods,
          splitPeriodNames: form.splitPeriods ? form.splitPeriodNames : null,
          reconciliationCycle: form.reconciliationCycle,
          eventIntegration: 'free_text',
          trackPersonalBudgets: form.trackPersonalBudgets,
          subGroupingLabel: form.subGroupingLabel.trim() || null,
        },
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        archivedAt: null,
      });

      batchSet(batch, `buildings/${buildingId}/fiscalYears/${fyId}`, {
        label: fyLabel,
        startDate: toTimestamp(form.fyStart),
        endDate: toTimestamp(form.fyEnd),
        splitDate: form.splitPeriods && form.splitDate ? toTimestamp(form.splitDate) : null,
        status: 'active',
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      navigate('/admin/categories');
    } catch (err) {
      console.error(err);
      setError('Failed to create building. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{APP_NAME}</h1>
          <p className="mt-2 text-gray-500">Let's set up your building</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-gray-800 mb-3">Building Info</h2>
              <div className="space-y-3">
                <Input
                  label="Building / Area Name"
                  id="buildingName"
                  required
                  value={form.buildingName}
                  onChange={(e) => set('buildingName', e.target.value)}
                  placeholder="ResEd Area"
                />
                <Input
                  label="Type (optional descriptor)"
                  id="buildingType"
                  value={form.buildingType}
                  onChange={(e) => set('buildingType', e.target.value)}
                  placeholder="Residential Education"
                />
              </div>
            </div>

            <div>
              <h2 className="text-base font-semibold text-gray-800 mb-3">Fiscal Year</h2>
              <div className="space-y-3">
                <Input
                  label="Label (optional)"
                  id="fyLabel"
                  value={form.fyLabel}
                  onChange={(e) => set('fyLabel', e.target.value)}
                  placeholder="AY 2025–2026"
                  helpText="Leave blank to auto-generate from dates."
                />
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
              </div>
            </div>

            <div>
              <h2 className="text-base font-semibold text-gray-800 mb-3">Period Split</h2>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.splitPeriods}
                  onChange={(e) => set('splitPeriods', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Split into two periods (e.g. Fall / Spring)</span>
              </label>

              {form.splitPeriods && (
                <div className="mt-3 space-y-3 pl-7">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Period 1 Name"
                      id="period1"
                      value={form.splitPeriodNames[0]}
                      onChange={(e) =>
                        set('splitPeriodNames', [e.target.value, form.splitPeriodNames[1]])
                      }
                    />
                    <Input
                      label="Period 2 Name"
                      id="period2"
                      value={form.splitPeriodNames[1]}
                      onChange={(e) =>
                        set('splitPeriodNames', [form.splitPeriodNames[0], e.target.value])
                      }
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

            <div>
              <h2 className="text-base font-semibold text-gray-800 mb-3">Settings</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reconciliation Cycle
                  </label>
                  <select
                    value={form.reconciliationCycle}
                    onChange={(e) => set('reconciliationCycle', e.target.value)}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {RECONCILIATION_CYCLES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.trackPersonalBudgets}
                    onChange={(e) => set('trackPersonalBudgets', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Track personal budgets per staff member</span>
                </label>

                <Input
                  label="Sub-grouping Label (optional)"
                  id="subGroupingLabel"
                  value={form.subGroupingLabel}
                  onChange={(e) => set('subGroupingLabel', e.target.value)}
                  placeholder="Center"
                  helpText="E.g. 'Center' — lets you tag expenses to a sub-location. Leave blank to disable."
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} disabled={loading} className="w-full" size="lg">
              Create Building & Continue
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
