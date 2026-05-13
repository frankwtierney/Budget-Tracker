import { useState, useEffect } from 'react';
import { useOrg } from '../../contexts/BuildingContext';
import {
  subscribeToCollection,
  addDocument,
  updateDocument,
  deleteDocument,
  orderBy,
} from '../../lib/firestore';
import Button from '../shared/Button';
import Input from '../shared/Input';
import Modal from '../shared/Modal';

// Department-level flat list of strategy types (e.g. Educational, Social,
// Service, Diversity). Tagged onto events; transactions inherit the strategy
// from the event they're attached to.

export default function StrategyTypeEditor() {
  const { activeDepartment } = useOrg();
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState(null); // null | 'new' | type
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const deptId = activeDepartment?.id;

  useEffect(() => {
    if (!deptId) return;
    const unsub = subscribeToCollection(
      `departments/${deptId}/strategyTypes`,
      (docs) => { setTypes(docs); setLoading(false); },
      orderBy('order', 'asc')
    );
    return unsub;
  }, [deptId]);

  if (!activeDepartment) {
    return <p className="text-gray-400">No active department.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Strategy Types</h2>
          <p className="text-sm text-gray-500">
            Tagged onto events to enable spend reporting by strategy
            (e.g. Educational, Social, Diversity).
          </p>
        </div>
        <Button onClick={() => setEditModal('new')}>+ Add Strategy Type</Button>
      </div>

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : types.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <p className="text-gray-400">No strategy types yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            Add the strategies your department uses to classify events.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase w-20">Code</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase w-24">Order</th>
                <th className="px-4 py-2 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {types.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs text-gray-700">{t.code || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-2 text-gray-700">{t.name}</td>
                  <td className="px-4 py-2 text-gray-500">{t.order}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditModal(t)}
                        title="Edit"
                        aria-label="Edit strategy type"
                        className="text-gray-400 hover:text-gray-700 p-1 rounded"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(t)}
                        title="Delete"
                        aria-label="Delete strategy type"
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
        deptId={deptId}
        nextOrder={types.length}
      />

      <DeleteConfirmModal
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        item={deleteConfirm}
        deptId={deptId}
      />
    </div>
  );
}

function EditModal({ isOpen, onClose, existing, deptId, nextOrder }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [order, setOrder] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(existing?.name ?? '');
      setCode(existing?.code ?? '');
      setOrder(existing?.order ?? nextOrder);
      setError('');
    }
  }, [isOpen, existing, nextOrder]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Name is required.');
    if (!code.trim()) return setError('Code is required.');
    if (code.trim().length > 5) return setError('Code must be 5 characters or fewer.');
    setLoading(true);
    try {
      const path = `departments/${deptId}/strategyTypes`;
      const data = {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        order: Number(order),
      };
      if (existing) {
        await updateDocument(`${path}/${existing.id}`, data);
      } else {
        await addDocument(path, data);
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
      title={existing ? 'Edit Strategy Type' : 'Add Strategy Type'}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          id="strategyName"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Community Meeting"
          autoFocus
        />
        <Input
          label="Code"
          id="strategyCode"
          required
          maxLength={5}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="CM"
        />
        <Input
          label="Display Order"
          id="strategyOrder"
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

function DeleteConfirmModal({ isOpen, onClose, item, deptId }) {
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await deleteDocument(`departments/${deptId}/strategyTypes/${item.id}`);
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
        Are you sure you want to delete{' '}
        <span className="font-semibold">{item?.name}</span>? Existing events
        already tagged with it will keep the value (it just won't appear in the
        dropdown anymore). This cannot be undone.
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
