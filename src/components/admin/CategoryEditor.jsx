import { useState, useEffect } from 'react';
import { useBuilding } from '../../contexts/BuildingContext';
import {
  subscribeToCollection,
  addDocument,
  updateDocument,
  deleteDocument,
  serverTimestamp,
  where,
  orderBy,
} from '../../lib/firestore';
import { formatCurrency } from '../../lib/format';
import Button from '../shared/Button';
import Input from '../shared/Input';
import Modal from '../shared/Modal';

export default function CategoryEditor({ building }) {
  const { fiscalYear } = useBuilding();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [umbrellaModal, setUmbrellaModal] = useState(null); // null | 'new' | category
  const [subModal, setSubModal] = useState(null); // null | { category, sub? }
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    if (!building?.id || !fiscalYear?.id) return;
    const unsub = subscribeToCollection(
      `buildings/${building.id}/categories`,
      setCategories,
      where('fiscalYearId', '==', fiscalYear.id),
      orderBy('order', 'asc')
    );
    setLoading(false);
    return unsub;
  }, [building?.id, fiscalYear?.id]);

  if (!fiscalYear) {
    return <p className="text-gray-400">No active fiscal year found.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Categories</h2>
          <p className="text-sm text-gray-500">{fiscalYear.label}</p>
        </div>
        <Button onClick={() => setUmbrellaModal('new')}>+ Add Umbrella</Button>
      </div>

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <p className="text-gray-400">No categories yet.</p>
          <p className="text-sm text-gray-400 mt-1">Add an umbrella category to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => (
            <UmbrellaCard
              key={cat.id}
              category={cat}
              building={building}
              fiscalYear={fiscalYear}
              onEdit={() => setUmbrellaModal(cat)}
              onDelete={() => setDeleteConfirm({ type: 'umbrella', item: cat })}
              onAddSub={() => setSubModal({ category: cat })}
              onEditSub={(sub) => setSubModal({ category: cat, sub })}
              onDeleteSub={(sub) => setDeleteConfirm({ type: 'sub', item: sub, category: cat })}
            />
          ))}
        </div>
      )}

      <UmbrellaModal
        isOpen={umbrellaModal !== null}
        onClose={() => setUmbrellaModal(null)}
        existing={umbrellaModal !== 'new' ? umbrellaModal : null}
        building={building}
        fiscalYear={fiscalYear}
        nextOrder={categories.length}
      />

      <SubCategoryModal
        isOpen={subModal !== null}
        onClose={() => setSubModal(null)}
        category={subModal?.category}
        existing={subModal?.sub ?? null}
        building={building}
      />

      <DeleteConfirmModal
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        item={deleteConfirm}
        building={building}
      />
    </div>
  );
}

function UmbrellaCard({ category, onEdit, onDelete, onAddSub, onEditSub, onDeleteSub }) {
  const subs = category.subCategories ?? [];
  const total = subs.reduce((sum, s) => sum + (s.allocation ?? 0), 0);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-gray-800">{category.name}</span>
          <span className="text-sm text-gray-500">{formatCurrency(total)} total allocation</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onAddSub}>+ Sub-category</Button>
          <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <TrashIcon className="w-4 h-4 text-red-400" />
          </Button>
        </div>
      </div>

      {subs.length > 0 && (
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Sub-category</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-400 uppercase">Allocation</th>
              <th className="px-4 py-2 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {subs
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-700">{sub.name}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{formatCurrency(sub.allocation)}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEditSub(sub)}
                        className="text-gray-400 hover:text-gray-600 p-1"
                      >
                        <PencilIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteSub(sub)}
                        className="text-gray-400 hover:text-red-500 p-1"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {subs.length === 0 && (
        <p className="px-4 py-3 text-sm text-gray-400 italic">No sub-categories yet.</p>
      )}
    </div>
  );
}

function UmbrellaModal({ isOpen, onClose, existing, building, fiscalYear, nextOrder }) {
  const [name, setName] = useState('');
  const [order, setOrder] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(existing?.name ?? '');
      setOrder(existing?.order ?? nextOrder);
      setError('');
    }
  }, [isOpen, existing, nextOrder]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Name is required.');
    setLoading(true);
    try {
      const path = `buildings/${building.id}/categories`;
      const data = {
        fiscalYearId: fiscalYear.id,
        name: name.trim(),
        order: Number(order),
        subCategories: existing?.subCategories ?? [],
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
      title={existing ? 'Edit Umbrella Category' : 'Add Umbrella Category'}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          id="umbrellaName"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Programs"
          autoFocus
        />
        <Input
          label="Display Order"
          id="umbrellaOrder"
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

function SubCategoryModal({ isOpen, onClose, category, existing, building }) {
  const [name, setName] = useState('');
  const [allocation, setAllocation] = useState('');
  const [order, setOrder] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(existing?.name ?? '');
      setAllocation(existing?.allocation ?? '');
      setOrder(existing?.order ?? (category?.subCategories?.length ?? 0));
      setError('');
    }
  }, [isOpen, existing, category]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Name is required.');
    if (allocation === '' || isNaN(Number(allocation)) || Number(allocation) < 0)
      return setError('Allocation must be a non-negative number.');

    setLoading(true);
    try {
      const subs = [...(category.subCategories ?? [])];
      const newSub = {
        id: existing?.id ?? crypto.randomUUID(),
        name: name.trim(),
        allocation: Number(allocation),
        order: Number(order),
      };

      if (existing) {
        const idx = subs.findIndex((s) => s.id === existing.id);
        if (idx >= 0) subs[idx] = newSub;
        else subs.push(newSub);
      } else {
        subs.push(newSub);
      }

      await updateDocument(`buildings/${building.id}/categories/${category.id}`, {
        subCategories: subs,
      });
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
      title={existing ? 'Edit Sub-category' : 'Add Sub-category'}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          id="subName"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Community Programs"
          autoFocus
        />
        <Input
          label="Allocation ($)"
          id="subAllocation"
          type="number"
          min={0}
          step="0.01"
          required
          value={allocation}
          onChange={(e) => setAllocation(e.target.value)}
          placeholder="0.00"
        />
        <Input
          label="Display Order"
          id="subOrder"
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

function DeleteConfirmModal({ isOpen, onClose, item, building }) {
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      if (item.type === 'umbrella') {
        await deleteDocument(`buildings/${building.id}/categories/${item.item.id}`);
      } else {
        const subs = (item.category.subCategories ?? []).filter((s) => s.id !== item.item.id);
        await updateDocument(`buildings/${building.id}/categories/${item.category.id}`, {
          subCategories: subs,
        });
      }
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
        <span className="font-semibold">
          {item?.type === 'umbrella' ? item.item.name : item?.item?.name}
        </span>
        ? This cannot be undone.
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
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}
