import { useState, useEffect } from 'react';
import { useSystem } from '../../../contexts/SystemContext';
import { updateDocument } from '../../../lib/firestore';
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_VALUES,
  accessLevelLabel,
  normalizeRoleConfig,
} from '../../../lib/roleConfig';
import Button from '../../shared/Button';
import Input from '../../shared/Input';
import Modal from '../../shared/Modal';

// System → Positions tab (Super Admin only). Manages positionDefs on
// system/config: job titles that each map directly to an access level. See
// lib/roleConfig.js for the model (no separate "role" layer; scope comes from
// the assignment node, not the position).

const SYSTEM_DOC_PATH = 'system/config';
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

export default function PositionsEditor() {
  const { systemDoc } = useSystem();
  const { positionDefs } = normalizeRoleConfig(systemDoc);
  const buildingTypes = (systemDoc?.buildingTypes ?? []).slice().sort(byOrder);

  const [editModal, setEditModal] = useState(null); // null | 'new' | position
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const typeName = (id) => buildingTypes.find((t) => t.id === id)?.name ?? null;

  async function persist(next) {
    await updateDocument(SYSTEM_DOC_PATH, { positionDefs: next });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Positions</h2>
          <p className="text-sm text-gray-500">
            The job titles people can hold. Each grants an{' '}
            <span className="font-medium">access level</span> — what they can do.
            Where they can do it is set when you assign them to a building, area,
            or department.
          </p>
        </div>
        <Button onClick={() => setEditModal('new')}>+ Add Position</Button>
      </div>

      {positionDefs.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <p className="text-gray-400">No positions yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            Add titles like RHD, CD, or CA and the access each one grants.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Position</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase w-24">Abbr.</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Access level</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Building types</th>
                <th className="px-4 py-2 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {positionDefs.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-700">{p.label}</td>
                  <td className="px-4 py-2 text-gray-500">{p.abbr || '—'}</td>
                  <td className="px-4 py-2 text-gray-500">
                    {p.accessLevel ? (
                      accessLevelLabel(p.accessLevel)
                    ) : (
                      <span className="text-amber-600">— unset —</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {p.buildingTypeIds?.length
                      ? p.buildingTypeIds.map((id) => typeName(id) ?? '—').join(', ')
                      : 'Any'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditModal(p)}
                        title="Edit"
                        aria-label="Edit position"
                        className="text-gray-400 hover:text-gray-700 p-1 rounded"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(p)}
                        title="Delete"
                        aria-label="Delete position"
                        className="text-gray-400 hover:text-red-500 p-1 rounded"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PositionModal
        isOpen={editModal !== null}
        onClose={() => setEditModal(null)}
        existing={editModal !== 'new' ? editModal : null}
        positions={positionDefs}
        buildingTypes={buildingTypes}
        persist={persist}
      />

      <DeleteConfirmModal
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        item={deleteConfirm}
        positions={positionDefs}
        persist={persist}
      />
    </div>
  );
}

function PositionModal({ isOpen, onClose, existing, positions, buildingTypes, persist }) {
  const [label, setLabel] = useState('');
  const [abbr, setAbbr] = useState('');
  const [accessLevel, setAccessLevel] = useState(ACCESS_LEVEL_VALUES[1]); // member/Edit
  const [buildingTypeIds, setBuildingTypeIds] = useState([]); // [] = Any
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setLabel(existing?.label ?? '');
      setAbbr(existing?.abbr ?? '');
      setAccessLevel(existing?.accessLevel ?? ACCESS_LEVEL_VALUES[1]);
      setBuildingTypeIds(existing?.buildingTypeIds ?? []);
      setError('');
    }
  }, [isOpen, existing]);

  function toggleType(id) {
    setBuildingTypeIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!label.trim()) return setError('Name is required.');
    if (!ACCESS_LEVEL_VALUES.includes(accessLevel)) return setError('Pick an access level.');
    setLoading(true);
    try {
      const fields = {
        label: label.trim(),
        abbr: abbr.trim(),
        accessLevel,
        buildingTypeIds,
      };
      let next;
      if (existing) {
        next = positions.map((p) => (p.id === existing.id ? { ...p, ...fields } : p));
      } else {
        next = [...positions, { id: crypto.randomUUID(), ...fields, order: positions.length }];
      }
      await persist(next);
      onClose();
    } catch (err) {
      console.error(err);
      setError(`Failed to save: ${err.message ?? 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={existing ? 'Edit Position' : 'Add Position'} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Position title"
            id="posLabel"
            className="col-span-2"
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Residence Hall Director"
            autoFocus
          />
          <Input
            label="Abbr."
            id="posAbbr"
            value={abbr}
            onChange={(e) => setAbbr(e.target.value)}
            placeholder="RHD"
          />
        </div>
        <Select
          label="Access level"
          id="posAccess"
          value={accessLevel}
          onChange={(e) => setAccessLevel(e.target.value)}
          helpText="What this position can do. Where it applies is set when assigning the person."
        >
          {ACCESS_LEVELS.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </Select>
        <div>
          <span className="block text-sm font-medium text-gray-700 mb-1">Building types</span>
          {buildingTypes.length === 0 ? (
            <p className="text-xs text-gray-400 italic">
              No building types defined yet — this position will apply to any building.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {buildingTypes.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={buildingTypeIds.includes(t.id)}
                    onChange={() => toggleType(t.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {t.name}
                </label>
              ))}
            </div>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Limits where this title appears when assigning. Leave all unchecked for any type.
          </p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{existing ? 'Save' : 'Add'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteConfirmModal({ isOpen, onClose, item, positions, persist }) {
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await persist(positions.filter((p) => p.id !== item.id));
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Delete Position" size="sm">
      <p className="text-sm text-gray-600 mb-4">
        Delete <span className="font-semibold">{item?.label}</span>? People already
        assigned this position keep their access; only the title choice goes away.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={loading} onClick={handleDelete}>Delete</Button>
      </div>
    </Modal>
  );
}

function Select({ label, id, helpText, children, className = '', ...props }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      <select
        id={id}
        className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        {...props}
      >
        {children}
      </select>
      {helpText && <p className="mt-1 text-xs text-gray-500">{helpText}</p>}
    </div>
  );
}

function TrashIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function PencilIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}
