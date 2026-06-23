import { useState, useEffect } from 'react';
import { useOrg } from '../../contexts/BuildingContext';
import { useSystem } from '../../contexts/SystemContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  subscribeToCollection,
  addDocument,
  updateDocument,
  serverTimestamp,
} from '../../lib/firestore';
import { toTimestamp, formatDate } from '../../lib/format';
import { isAdminOf } from '../../lib/structure';
import Button from '../shared/Button';
import Input from '../shared/Input';
import Modal from '../shared/Modal';

// Department-scoped fiscal year editor. FYs live at
// departments/{deptId}/fiscalYears and the department's activeFiscalYearId
// points at the one the rest of the app reads.
//
// Each FY owns a single `splitDate` — the one seam that divides the year into
// its two primary periods (on/before → period 1, after → period 2). The period
// *names* are org-wide (System → Periods); the split *date* is per-year here,
// because the calendar boundary shifts year to year. A single split point (vs.
// per-period ranges) makes gaps/overlaps impossible.

const byStartYearDesc = (a, b) => (b.startYear ?? 0) - (a.startYear ?? 0);

// yyyy-MM-dd string for a date input, or '' when unset.
const toDateInput = (ts) => (ts ? formatDate(ts, 'yyyy-MM-dd') : '');

// Sensible defaults for an academic year starting in year y (Aug → Jul, split
// at the new calendar year).
const defaultStart = (y) => `${y}-08-01`;
const defaultEnd = (y) => `${y + 1}-07-31`;
const defaultSplit = (y) => `${y + 1}-01-01`;

export default function FiscalYearEditor() {
  const { activeDepartment } = useOrg();
  const { systemDoc, isSuperAdmin } = useSystem();
  const { user } = useAuth();
  const deptId = activeDepartment?.id;
  const activeFyId = activeDepartment?.activeFiscalYearId;

  // Fiscal years are a department-wide setting. Only a department admin (or a
  // Super Admin) may change them — this mirrors the Firestore rule
  // (isDeptAdmin). Everyone else gets a read-only view so RHD/CD users can see
  // the department's year + split date without being able to alter it.
  const canEdit = isSuperAdmin || isAdminOf(activeDepartment, user?.uid);

  // Org-wide period names, for labelling the two sides of the split.
  const periodNames = systemDoc?.periods?.fixed ?? ['Fall', 'Spring'];

  const [fiscalYears, setFiscalYears] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [editModal, setEditModal] = useState(null); // null | 'new' | fy
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!deptId) return;
    setLoaded(false);
    const unsub = subscribeToCollection(
      `departments/${deptId}/fiscalYears`,
      (docs) => {
        setFiscalYears(docs.slice().sort(byStartYearDesc));
        setLoaded(true);
      }
    );
    return unsub;
  }, [deptId]);

  async function makeActive(fyId) {
    setBusyId(fyId);
    try {
      await updateDocument(`departments/${deptId}`, { activeFiscalYearId: fyId });
    } catch (err) {
      console.error(err);
    } finally {
      setBusyId(null);
    }
  }

  if (!deptId) {
    return (
      <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-4 max-w-md">
        Select a department to manage its fiscal years.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Fiscal Years</h2>
          <p className="text-sm text-gray-500">
            The budget years for {activeDepartment.shortName || activeDepartment.name}.
            Each year's split date divides it into {periodNames[0]} and{' '}
            {periodNames[1]}. The active year is what the rest of the app reads —
            it applies to every building in this department.
          </p>
        </div>
        {canEdit && <Button onClick={() => setEditModal('new')}>+ Add Fiscal Year</Button>}
      </div>

      {!canEdit && (
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
          View only — fiscal years are managed by a department admin and shared by
          all buildings in {activeDepartment.shortName || activeDepartment.name}.
        </div>
      )}

      {!loaded ? (
        <div className="text-sm text-gray-400">Loading fiscal years…</div>
      ) : fiscalYears.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <p className="text-gray-400">No fiscal years yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Year</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Range</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Split</th>
                {canEdit && <th className="px-4 py-2 w-40" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fiscalYears.map((fy) => {
                const isActive = fy.id === activeFyId;
                return (
                  <tr key={fy.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <span className="text-gray-800 font-medium">{fy.label}</span>
                      {isActive && (
                        <span className="ml-2 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {formatDate(fy.startDate)} – {formatDate(fy.endDate)}
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {fy.splitDate ? (
                        formatDate(fy.splitDate)
                      ) : (
                        <span className="text-amber-600" title="No split date — the Summary can't separate periods until this is set">
                          not set
                        </span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-3">
                          {!isActive && (
                            <button
                              onClick={() => makeActive(fy.id)}
                              disabled={busyId === fy.id}
                              className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
                            >
                              Make active
                            </button>
                          )}
                          <button
                            onClick={() => setEditModal(fy)}
                            title="Edit"
                            aria-label="Edit fiscal year"
                            className="text-gray-400 hover:text-gray-700 p-1 rounded"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <EditModal
        isOpen={editModal !== null}
        onClose={() => setEditModal(null)}
        existing={editModal !== 'new' ? editModal : null}
        deptId={deptId}
        periodNames={periodNames}
      />
    </div>
  );
}

function EditModal({ isOpen, onClose, existing, deptId, periodNames }) {
  const thisYear = new Date().getFullYear();
  const [startYear, setStartYear] = useState(thisYear);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [splitDate, setSplitDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (existing) {
      const y = existing.startYear ?? thisYear;
      setStartYear(y);
      setStartDate(toDateInput(existing.startDate) || defaultStart(y));
      setEndDate(toDateInput(existing.endDate) || defaultEnd(y));
      // Backfill the split from a legacy fallEnd / springStart if this FY
      // predates the single-splitDate model, so saving lights up the Summary.
      setSplitDate(
        toDateInput(existing.splitDate) ||
          toDateInput(existing.fallEnd) ||
          toDateInput(existing.springStart) ||
          defaultSplit(y)
      );
    } else {
      setStartYear(thisYear);
      setStartDate(defaultStart(thisYear));
      setEndDate(defaultEnd(thisYear));
      setSplitDate(defaultSplit(thisYear));
    }
    setError('');
  }, [isOpen, existing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Changing the academic year re-defaults any date the user hasn't customized.
  function onYearChange(value) {
    const y = Number(value);
    setStartYear(y);
    setStartDate((d) => (!d || d === defaultStart(startYear) ? defaultStart(y) : d));
    setEndDate((d) => (!d || d === defaultEnd(startYear) ? defaultEnd(y) : d));
    setSplitDate((d) => (!d || d === defaultSplit(startYear) ? defaultSplit(y) : d));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!startYear) return setError('Academic year is required.');
    if (new Date(startDate) >= new Date(endDate)) {
      return setError('End date must be after start date.');
    }
    if (!splitDate) return setError('Split date is required.');
    const s = new Date(splitDate);
    if (s < new Date(startDate) || s > new Date(endDate)) {
      return setError('Split date must fall within the fiscal year.');
    }

    setLoading(true);
    try {
      const data = {
        label: `AY ${startYear}–${Number(startYear) + 1}`,
        startYear: Number(startYear),
        startDate: toTimestamp(startDate),
        endDate: toTimestamp(endDate),
        splitDate: toTimestamp(splitDate),
      };
      if (existing) {
        await updateDocument(`departments/${deptId}/fiscalYears/${existing.id}`, data);
      } else {
        await addDocument(`departments/${deptId}/fiscalYears`, {
          ...data,
          status: 'active',
          createdAt: serverTimestamp(),
        });
      }
      onClose();
    } catch (err) {
      console.error(err);
      setError(`Failed to save: ${err.message ?? 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={existing ? 'Edit Fiscal Year' : 'Add Fiscal Year'}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="fyYear" className="block text-sm font-medium text-gray-700 mb-1">
            Academic year (start)
          </label>
          <select
            id="fyYear"
            value={startYear}
            onChange={(e) => onYearChange(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Array.from({ length: 6 }, (_, i) => thisYear - 1 + i).map((y) => (
              <option key={y} value={y}>AY {y}–{y + 1}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Start date"
            id="fyStartDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Input
            label="End date"
            id="fyEndDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <Input
          label="Split date"
          id="fySplitDate"
          type="date"
          value={splitDate}
          onChange={(e) => setSplitDate(e.target.value)}
          helpText={`On or before → ${periodNames[0]}; after → ${periodNames[1]}.`}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{existing ? 'Save' : 'Add'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function PencilIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}
