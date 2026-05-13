import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  setDocument,
  getBatch,
  batchSet,
  batchUpdate,
  newDocId,
  serverTimestamp,
  arrayUnion,
} from '../lib/firestore';
import { toTimestamp } from '../lib/format';
import {
  DEFAULT_DEPARTMENT,
  DEFAULT_AREAS,
  DEFAULT_BUILDINGS,
  DEFAULT_COMPLEXES,
} from '../lib/structure';
import { APP_NAME } from '../config';
import Button from '../components/shared/Button';
import Input from '../components/shared/Input';

const RECONCILIATION_CYCLES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'custom', label: 'Custom' },
];

// Five years of options around "now". Adjust as needed.
function fiscalYearOptions() {
  const thisYear = new Date().getFullYear();
  const opts = [];
  for (let y = thisYear - 1; y <= thisYear + 4; y++) {
    opts.push({ value: y, label: `AY ${y}–${y + 1}` });
  }
  return opts;
}

export default function Setup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fyOptions = fiscalYearOptions();
  const defaultStartYear = new Date().getMonth() >= 6 // Aug+ → next AY starts this year
    ? new Date().getFullYear()
    : new Date().getFullYear() - 1;

  const [form, setForm] = useState({
    deptName: DEFAULT_DEPARTMENT.name,
    deptShortName: DEFAULT_DEPARTMENT.shortName,
    fyStartYear: defaultStartYear,
    fyStartDate: '',
    fyEndDate: '',
    fallStart: '',
    fallEnd: '',
    springStart: '',
    springEnd: '',
    reconciliationCycle: 'monthly',
    homeBuildingCode: DEFAULT_BUILDINGS[0]?.code ?? '',
  });

  const buildingsByArea = DEFAULT_AREAS
    .map((a) => ({ area: a, buildings: DEFAULT_BUILDINGS.filter((b) => b.areaCode === a.code) }))
    .filter((g) => g.buildings.length > 0);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // When the AY year changes, fill default dates if blank.
  function onYearChange(year) {
    const y = Number(year);
    setForm((f) => ({
      ...f,
      fyStartYear: y,
      fyStartDate: f.fyStartDate || `${y}-08-01`,
      fyEndDate: f.fyEndDate || `${y + 1}-07-31`,
    }));
  }

  async function handleSubmit(seedDefaults) {
    setError('');

    if (!form.deptName.trim()) return setError('Department name is required.');
    const startDate = form.fyStartDate || `${form.fyStartYear}-08-01`;
    const endDate = form.fyEndDate || `${form.fyStartYear + 1}-07-31`;
    if (new Date(startDate) >= new Date(endDate)) {
      return setError('Fiscal year end must be after start.');
    }

    setLoading(true);
    try {
      const deptId = newDocId('departments');
      const fyId = newDocId(`departments/${deptId}/fiscalYears`);

      // Step 1 (sequential): create the department so subsequent rule checks
      // (which do get(department)) can verify the user's admin role.
      await setDocument(`departments/${deptId}`, {
        name: form.deptName.trim(),
        shortName: form.deptShortName.trim() || form.deptName.trim(),
        roles: { [user.uid]: 'admin' },
        activeFiscalYearId: fyId,
        settings: {
          reconciliationCycle: form.reconciliationCycle,
        },
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        archivedAt: null,
      });

      // Step 2: batch the fiscal year + (optionally) seed structure + user doc.
      const batch = getBatch();

      const fyLabel = `AY ${form.fyStartYear}–${form.fyStartYear + 1}`;
      batchSet(batch, `departments/${deptId}/fiscalYears/${fyId}`, {
        label: fyLabel,
        startYear: form.fyStartYear,
        startDate: toTimestamp(startDate),
        endDate: toTimestamp(endDate),
        fallStart: form.fallStart ? toTimestamp(form.fallStart) : null,
        fallEnd: form.fallEnd ? toTimestamp(form.fallEnd) : null,
        springStart: form.springStart ? toTimestamp(form.springStart) : null,
        springEnd: form.springEnd ? toTimestamp(form.springEnd) : null,
        status: 'active',
        createdAt: serverTimestamp(),
      });

      const seededAreaIds = [];
      const seededBuildingIds = [];
      const seededComplexIds = [];
      let homeBuildingId = null;

      if (seedDefaults) {
        // Pre-allocate IDs so we can wire up references in one batch.
        const areaIdByCode = {};
        DEFAULT_AREAS.forEach((a) => {
          areaIdByCode[a.code] = newDocId('areas');
        });
        const buildingIdByCode = {};
        DEFAULT_BUILDINGS.forEach((b) => {
          buildingIdByCode[b.code] = newDocId('buildings');
        });

        DEFAULT_AREAS.forEach((a) => {
          const id = areaIdByCode[a.code];
          batchSet(batch, `areas/${id}`, {
            departmentId: deptId,
            code: a.code,
            name: a.name,
            roles: { [user.uid]: 'admin' },
            createdAt: serverTimestamp(),
            createdBy: user.uid,
            archivedAt: null,
          });
          seededAreaIds.push(id);
        });

        DEFAULT_BUILDINGS.forEach((b) => {
          const id = buildingIdByCode[b.code];
          const areaId = areaIdByCode[b.areaCode];
          batchSet(batch, `buildings/${id}`, {
            departmentId: deptId,
            areaId,
            complexId: null,
            code: b.code,
            name: b.name,
            roles: { [user.uid]: 'admin' },
            settings: {},
            createdAt: serverTimestamp(),
            createdBy: user.uid,
            archivedAt: null,
          });
          seededBuildingIds.push(id);
        });

        if (form.homeBuildingCode && buildingIdByCode[form.homeBuildingCode]) {
          homeBuildingId = buildingIdByCode[form.homeBuildingCode];
        }

        DEFAULT_COMPLEXES.forEach((c) => {
          const id = newDocId('complexes');
          const memberBuildingIds = c.buildingCodes.map((code) => buildingIdByCode[code]);
          batchSet(batch, `complexes/${id}`, {
            departmentId: deptId,
            areaId: areaIdByCode[c.areaCode],
            code: c.code,
            name: c.name,
            buildingIds: memberBuildingIds,
            createdAt: serverTimestamp(),
            createdBy: user.uid,
          });
          seededComplexIds.push(id);
        });
      }

      // Update user doc with the IDs they now have access to.
      const userUpdate = {
        departmentIds: arrayUnion(deptId),
      };
      if (seededAreaIds.length) userUpdate.areaIds = arrayUnion(...seededAreaIds);
      if (seededBuildingIds.length) userUpdate.buildingIds = arrayUnion(...seededBuildingIds);
      if (seededComplexIds.length) userUpdate.complexIds = arrayUnion(...seededComplexIds);
      if (homeBuildingId) userUpdate.homeBuildingId = homeBuildingId;
      batchUpdate(batch, `users/${user.uid}`, userUpdate);

      await batch.commit();
      navigate('/');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to create department. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{APP_NAME}</h1>
          <p className="mt-2 text-gray-500">Let's set up your department</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-gray-800 mb-3">Department</h2>
              <div className="space-y-3">
                <Input
                  label="Department Name"
                  id="deptName"
                  required
                  value={form.deptName}
                  onChange={(e) => set('deptName', e.target.value)}
                />
                <Input
                  label="Short Name (used in headers)"
                  id="deptShortName"
                  value={form.deptShortName}
                  onChange={(e) => set('deptShortName', e.target.value)}
                  placeholder="UB ResLife"
                />
              </div>
            </div>

            <div>
              <h2 className="text-base font-semibold text-gray-800 mb-3">Fiscal Year</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Academic Year
                  </label>
                  <select
                    value={form.fyStartYear}
                    onChange={(e) => onYearChange(e.target.value)}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {fyOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Start Date"
                    id="fyStart"
                    type="date"
                    value={form.fyStartDate || `${form.fyStartYear}-08-01`}
                    onChange={(e) => set('fyStartDate', e.target.value)}
                  />
                  <Input
                    label="End Date"
                    id="fyEnd"
                    type="date"
                    value={form.fyEndDate || `${form.fyStartYear + 1}-07-31`}
                    onChange={(e) => set('fyEndDate', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-base font-semibold text-gray-800 mb-3">
                Periods <span className="text-xs text-gray-400 font-normal">(optional)</span>
              </h2>
              <p className="text-xs text-gray-500 mb-3">
                Building budgets that run on a Fall/Spring split can use these dates.
                Leave blank for budgets that run year-round.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Fall Start"
                  id="fallStart"
                  type="date"
                  value={form.fallStart}
                  onChange={(e) => set('fallStart', e.target.value)}
                />
                <Input
                  label="Fall End"
                  id="fallEnd"
                  type="date"
                  value={form.fallEnd}
                  onChange={(e) => set('fallEnd', e.target.value)}
                />
                <Input
                  label="Spring Start"
                  id="springStart"
                  type="date"
                  value={form.springStart}
                  onChange={(e) => set('springStart', e.target.value)}
                />
                <Input
                  label="Spring End"
                  id="springEnd"
                  type="date"
                  value={form.springEnd}
                  onChange={(e) => set('springEnd', e.target.value)}
                />
              </div>
            </div>

            <div>
              <h2 className="text-base font-semibold text-gray-800 mb-3">Settings</h2>
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
            </div>

            <div>
              <h2 className="text-base font-semibold text-gray-800 mb-3">
                Your Home Building <span className="text-xs text-gray-400 font-normal">(when loading the UB ResLife structure)</span>
              </h2>
              <p className="text-xs text-gray-500 mb-3">
                The building you'll land on after setup. You can switch scopes anytime; this just sets the default.
              </p>
              <select
                value={form.homeBuildingCode}
                onChange={(e) => set('homeBuildingCode', e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {buildingsByArea.map((g) => (
                  <optgroup key={g.area.code} label={g.area.name}>
                    {g.buildings.map((b) => (
                      <option key={b.code} value={b.code}>{b.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <div className="space-y-2">
              <Button
                type="button"
                onClick={() => handleSubmit(true)}
                loading={loading}
                disabled={loading}
                className="w-full"
                size="lg"
              >
                Create & Load UB ResLife Structure
              </Button>
              <Button
                type="button"
                onClick={() => handleSubmit(false)}
                loading={loading}
                disabled={loading}
                variant="secondary"
                className="w-full"
              >
                Create Department Only (add areas & buildings later)
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
