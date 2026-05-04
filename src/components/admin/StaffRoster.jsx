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
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Building</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Budget</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenure</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {visible.map((s) => (
                <tr key={s.id} className={`hover:bg-gray-50 ${s.active === false ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {s.firstName} {s.lastName}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.role}</td>
                  <td className="px-4 py-3 text-gray-600">{s.buildingCode ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {formatCurrency(s.personalBudget?.annual ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.tenureFlag ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${
                        s.active !== false
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {s.active !== false ? 'Active' : 'Archived'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setModal(s)}
                      className="text-gray-400 hover:text-gray-600 text-sm"
                    >
                      Edit
                    </button>
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

function StaffModal({ isOpen, onClose, existing, building, fiscalYear }) {
  const [form, setForm] = useState(defaultForm());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function defaultForm() {
    return {
      firstName: '', lastName: '', role: '', buildingCode: '',
      annualBudget: '', tenureFlag: '', active: true,
    };
  }

  useEffect(() => {
    if (isOpen) {
      setForm(
        existing
          ? {
              firstName: existing.firstName ?? '',
              lastName: existing.lastName ?? '',
              role: existing.role ?? '',
              buildingCode: existing.buildingCode ?? '',
              annualBudget: existing.personalBudget?.annual ?? '',
              tenureFlag: existing.tenureFlag ?? '',
              active: existing.active !== false,
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
        role: form.role.trim(),
        buildingCode: form.buildingCode.trim() || null,
        personalBudget: { annual: Number(form.annualBudget) || 0, splits: null },
        tenureFlag: form.tenureFlag || null,
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
          <Input label="Role" id="role" value={form.role} placeholder="LLCA, RA, GA..."
            onChange={(e) => set('role', e.target.value)} />
          <Input label="Building Code" id="buildingCode" value={form.buildingCode}
            placeholder="LEH, GOO, FLEEK..." onChange={(e) => set('buildingCode', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Annual Budget ($)" id="annualBudget" type="number" min={0} step="0.01"
            value={form.annualBudget} onChange={(e) => set('annualBudget', e.target.value)} />
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
