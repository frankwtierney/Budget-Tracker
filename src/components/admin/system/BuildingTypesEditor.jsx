import { useState, useEffect } from 'react';
import { useSystem } from '../../../contexts/SystemContext';
import { useTerm } from '../../../lib/terminology';
import { updateDocument } from '../../../lib/firestore';
import Button from '../../shared/Button';
import Input from '../../shared/Input';
import Modal from '../../shared/Modal';

// System-level managed list of building types (Super Admin only). Lives on the
// single system/config doc as an array of { id, name, order }. Buildings
// reference a type by `typeId`, so renaming a type here never breaks the link.
// The Structure editor's building "Type" field is a picker sourced from this.

const SYSTEM_DOC_PATH = 'system/config';
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

export default function BuildingTypesEditor() {
  const { systemDoc } = useSystem();
  const term = useTerm();
  const types = (systemDoc?.buildingTypes ?? []).slice().sort(byOrder);

  const [editModal, setEditModal] = useState(null); // null | 'new' | type
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  async function persist(next) {
    await updateDocument(SYSTEM_DOC_PATH, { buildingTypes: next });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{term.building.one} Types</h2>
          <p className="text-sm text-gray-500">
            The categories a {term.building.one.toLowerCase()} can be (Residence
            Hall, Apartment, Success Center…). Assigned to {term.building.many.toLowerCase()}{' '}
            in the Structure tab.
          </p>
        </div>
        <Button onClick={() => setEditModal('new')}>+ Add Type</Button>
      </div>

      {types.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <p className="text-gray-400">No {term.building.one.toLowerCase()} types yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            Add the types your org uses to classify {term.building.many.toLowerCase()}.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase w-24">Order</th>
                <th className="px-4 py-2 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {types.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-700">{t.name}</td>
                  <td className="px-4 py-2 text-gray-500">{t.order}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditModal(t)}
                        title="Edit"
                        aria-label="Edit building type"
                        className="text-gray-400 hover:text-gray-700 p-1 rounded"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(t)}
                        title="Delete"
                        aria-label="Delete building type"
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

      <EditModal
        isOpen={editModal !== null}
        onClose={() => setEditModal(null)}
        existing={editModal !== 'new' ? editModal : null}
        types={types}
        persist={persist}
      />

      <DeleteConfirmModal
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        item={deleteConfirm}
        types={types}
        persist={persist}
      />
    </div>
  );
}

function EditModal({ isOpen, onClose, existing, types, persist }) {
  const [name, setName] = useState('');
  const [order, setOrder] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(existing?.name ?? '');
      setOrder(existing?.order ?? types.length);
      setError('');
    }
  }, [isOpen, existing, types.length]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Name is required.');
    setLoading(true);
    try {
      let next;
      if (existing) {
        next = types.map((t) =>
          t.id === existing.id ? { ...t, name: name.trim(), order: Number(order) } : t
        );
      } else {
        next = [
          ...types,
          { id: crypto.randomUUID(), name: name.trim(), order: Number(order) },
        ];
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={existing ? 'Edit Building Type' : 'Add Building Type'}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          id="typeName"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Residence Hall"
          autoFocus
        />
        <Input
          label="Display Order"
          id="typeOrder"
          type="number"
          min={0}
          value={order}
          onChange={(e) => setOrder(e.target.value)}
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

function DeleteConfirmModal({ isOpen, onClose, item, types, persist }) {
  const term = useTerm();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await persist(types.filter((t) => t.id !== item.id));
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirm Delete" size="sm">
      <p className="text-sm text-gray-600 mb-4">
        Delete <span className="font-semibold">{item?.name}</span>?{' '}
        {term.building.many} currently set to this type will show no type until
        reassigned. This cannot be undone.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={loading} onClick={handleDelete}>Delete</Button>
      </div>
    </Modal>
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
