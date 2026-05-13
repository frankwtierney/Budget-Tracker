import { useState, useEffect } from 'react';
import { useBuilding } from '../../contexts/BuildingContext';
import {
  subscribeToCollection,
  addDocument,
  updateDocument,
  serverTimestamp,
  where,
  orderBy,
} from '../../lib/firestore';
import { formatCurrency } from '../../lib/format';
import Button from '../shared/Button';
import Input from '../shared/Input';
import Modal from '../shared/Modal';

const TENURE_FLAGS = ['', 'Returner', 'NEW'];
const ROLE_OPTIONS = ['CA', 'LLCA'];
const SEMESTERS = ['fall', 'spring', 'summer'];
const SEMESTER_LABEL = { fall: 'Fall', spring: 'Spring', summer: 'Summer' };

// "Active" period within the fiscal year, expressed as start/end semester.
// Inclusive on both ends. Defaults to fall→spring (typical full CA year).
function semesterSpanLabel(start, end) {
  const s = start || 'fall';
  const e = end || 'spring';
  if (s === e) return `${SEMESTER_LABEL[s]} only`;
  return `${SEMESTER_LABEL[s]} – ${SEMESTER_LABEL[e]}`;
}

export default function StaffRoster({ building }) {
  const { fiscalYear } = useBuilding();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'new' | staffMember
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (!building?.id || !fiscalYear?.id) return;
    const unsub = subscribeToCollection(
      `buildings/${building.id}/staffMembers`,
      (docs) => { setStaff(docs); setLoading(false); },
      where('fiscalYearId', '==', fiscalYear.id),
      orderBy('lastName', 'asc')
    );
    return unsub;
  }, [building?.id, fiscalYear?.id]);

  if (!building?.settings?.trackPersonalBudgets) {
    return (
      <div className="text-center py-8 text-gray-400">
        Personal budget tracking is not enabled for this building.
      </div>
    );
  }

  async function toggleActive(s) {
    await updateDocument(
      `buildings/${building.id}/staffMembers/${s.id}`,
      { active: s.active === false }
    );
  }

  const visible = staff.filter((s) => showArchived || s.active !== false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Staff Roster</h2>
          <p className="text-sm text-gray-500">{fiscalYear?.label}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show archived
          </label>
          <Button onClick={() => setModal('new')}>+ Add Staff</Button>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <p className="text-gray-400">No staff members yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table
            className="min-w-full divide-y divide-gray-200 text-sm"
            style={{ tableLayout: 'fixed' }}
          >
            <colgroup>
              <col style={{ width: '28%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '19%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenure</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Active</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Budget</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {visible.map((s) => (
                <tr key={s.id} className={`hover:bg-gray-50 ${s.active === false ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-800 truncate">
                    {s.firstName} {s.lastName}
                  </td>
                  <td className="px-4 py-3 text-gray-600 truncate">{s.role}</td>
                  <td className="px-4 py-3 truncate">
                    {s.tenureFlag ? (
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${
                          s.tenureFlag === 'Returner'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {s.tenureFlag}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 truncate">
                    {semesterSpanLabel(s.startSemester, s.endSemester)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">
                    {formatCurrency(s.personalBudget?.annual ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setModal(s)}
                        title="Edit"
                        aria-label="Edit staff member"
                        className="text-gray-400 hover:text-gray-700 p-1 rounded"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      {s.active !== false ? (
                        <button
                          onClick={() => toggleActive(s)}
                          title="Archive"
                          aria-label="Archive staff member"
                          className="text-gray-400 hover:text-amber-600 p-1 rounded"
                        >
                          <ArchiveIcon className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleActive(s)}
                          title="Restore"
                          aria-label="Restore staff member"
                          className="text-gray-400 hover:text-blue-600 p-1 rounded"
                        >
                          <RestoreIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <StaffModal
        isOpen={modal !== null}
        onClose={() => setModal(null)}
        existing={modal !== 'new' ? modal : null}
        building={building}
        fiscalYear={fiscalYear}
      />
    </div>
  );
}

function PencilIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function ArchiveIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 010-4h14a2 2 0 010 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8M10 12h4" />
    </svg>
  );
}

function RestoreIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6M4 10a8 8 0 1 1 2.083 6.083" />
    </svg>
  );
}

function StaffModal({ isOpen, onClose, existing, building, fiscalYear }) {
  const [form, setForm] = useState(defaultForm());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function defaultForm() {
    return {
      firstName: '', lastName: '', role: ROLE_OPTIONS[0],
      annualBudget: '', tenureFlag: '', active: true,
      startSemester: 'fall', endSemester: 'spring',
    };
  }

  useEffect(() => {
    if (isOpen) {
      setForm(
        existing
          ? {
              firstName: existing.firstName ?? '',
              lastName: existing.lastName ?? '',
              role: existing.role || ROLE_OPTIONS[0],
              annualBudget: existing.personalBudget?.annual ?? '',
              tenureFlag: existing.tenureFlag ?? '',
              active: existing.active !== false,
              startSemester: existing.startSemester || 'fall',
              endSemester: existing.endSemester || 'spring',
            }
          : defaultForm()
      );
      setError('');
    }
  }, [isOpen, existing]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return setError('First and last name are required.');

    setLoading(true);
    try {
      const data = {
        fiscalYearId: fiscalYear.id,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        role: form.role,
        // buildingCode kept on the staff doc for cross-building views even
        // though it's redundant with the parent building. Auto-filled from
        // the active building so users don't have to type it.
        buildingCode: building.code ?? null,
        personalBudget: { annual: Number(form.annualBudget) || 0, splits: null },
        tenureFlag: form.tenureFlag || null,
        startSemester: form.startSemester,
        endSemester: form.endSemester,
        active: form.active,
        createdAt: existing ? existing.createdAt : serverTimestamp(),
      };

      if (existing) {
        await updateDocument(`buildings/${building.id}/staffMembers/${existing.id}`, data);
      } else {
        await addDocument(`buildings/${building.id}/staffMembers`, data);
      }
      onClose();
    } catch (err) {
      setError('Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={existing ? 'Edit Staff Member' : 'Add Staff Member'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="First Name" id="firstName" required value={form.firstName}
            onChange={(e) => set('firstName', e.target.value)} autoFocus />
          <Input label="Last Name" id="lastName" required value={form.lastName}
            onChange={(e) => set('lastName', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) => set('role', e.target.value)}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <Input label="Annual Budget ($)" id="annualBudget" type="number" min={0} step="0.01"
            value={form.annualBudget} onChange={(e) => set('annualBudget', e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tenure</label>
          <select
            value={form.tenureFlag}
            onChange={(e) => set('tenureFlag', e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {TENURE_FLAGS.map((f) => (
              <option key={f} value={f}>{f || '— None —'}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Semester</label>
            <select
              value={form.startSemester}
              onChange={(e) => set('startSemester', e.target.value)}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>{SEMESTER_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Semester</label>
            <select
              value={form.endSemester}
              onChange={(e) => set('endSemester', e.target.value)}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>{SEMESTER_LABEL[s]}</option>
              ))}
            </select>
          </div>
        </div>

        {existing && (
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.active}
              onChange={(e) => set('active', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600" />
            <span className="text-sm text-gray-700">Active</span>
          </label>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{existing ? 'Save' : 'Add'}</Button>
        </div>
      </form>
    </Modal>
  );
}
