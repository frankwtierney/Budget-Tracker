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

// Department-level shared category schema. Names + structure live here and
// are shared across every building in the department. Per-building, per-FY
// dollar amounts live in /buildings/{bid}/allocations/{fyId} and are edited
// in AllocationEditor.

export default function CategoryEditor() {
  const { activeDepartment } = useOrg();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryModal, setCategoryModal] = useState(null); // null | 'new' | category
  const [subModal, setSubModal] = useState(null); // null | { category, sub? }
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const deptId = activeDepartment?.id;

  useEffect(() => {
    if (!deptId) return;
    const unsub = subscribeToCollection(
      `departments/${deptId}/categories`,
      setCategories,
      orderBy('order', 'asc')
    );
    setLoading(false);
    return unsub;
  }, [deptId]);

  if (!activeDepartment) {
    return <p className="text-gray-400">No active department.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Categories</h2>
          <p className="text-sm text-gray-500">
            Shared across all buildings in {activeDepartment.shortName || activeDepartment.name}.
            Per-building dollar amounts are set in Allocations.
          </p>
        </div>
        <Button onClick={() => setCategoryModal('new')}>+ Add Category</Button>
      </div>

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
          <p className="text-gray-400">No categories yet.</p>
          <p className="text-sm text-gray-400 mt-1">Add a category to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              deptId={deptId}
              onEdit={() => setCategoryModal(cat)}
              onDelete={() => setDeleteConfirm({ type: 'category', item: cat })}
              onAddSub={() => setSubModal({ category: cat })}
              onEditSub={(sub) => setSubModal({ category: cat, sub })}
              onDeleteSub={(sub) => setDeleteConfirm({ type: 'sub', item: sub, category: cat })}
            />
          ))}
        </div>
      )}

      <CategoryModal
        isOpen={categoryModal !== null}
        onClose={() => setCategoryModal(null)}
        existing={categoryModal !== 'new' ? categoryModal : null}
        deptId={deptId}
        nextOrder={categories.length}
      />

      <SubCategoryModal
        isOpen={subModal !== null}
        onClose={() => setSubModal(null)}
        category={subModal?.category}
        existing={subModal?.sub ?? null}
        deptId={deptId}
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

function CategoryCard({ category, onEdit, onDelete, onAddSub, onEditSub, onDeleteSub }) {
  const subs = category.subCategories ?? [];

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-gray-800">{category.name}</span>
          {category.requiresEvent && (
            <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
              Requires event
            </span>
          )}
          <span className="text-sm text-gray-500">
            {subs.length} sub-{subs.length === 1 ? 'category' : 'categories'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onAddSub}
            title="Add sub-category"
            aria-label="Add sub-category"
            className="text-gray-400 hover:text-blue-600 p-1 rounded"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
          <button
            onClick={onEdit}
            title="Edit"
            aria-label="Edit category"
            className="text-gray-400 hover:text-gray-700 p-1 rounded"
          >
            <PencilIcon className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            aria-label="Delete category"
            className="text-gray-400 hover:text-red-500 p-1 rounded"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {subs.length > 0 && (
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Sub-category</th>
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

function CategoryModal({ isOpen, onClose, existing, deptId, nextOrder }) {
  const [name, setName] = useState('');
  const [order, setOrder] = useState(0);
  const [requiresEvent, setRequiresEvent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(existing?.name ?? '');
      setOrder(existing?.order ?? nextOrder);
      setRequiresEvent(existing?.requiresEvent ?? false);
      setError('');
    }
  }, [isOpen, existing, nextOrder]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Name is required.');
    setLoading(true);
    try {
      const path = `departments/${deptId}/categories`;
      const data = {
        name: name.trim(),
        order: Number(order),
        requiresEvent,
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
      title={existing ? 'Edit Category' : 'Add Category'}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          id="categoryName"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Programs"
          autoFocus
        />
        <Input
          label="Display Order"
          id="categoryOrder"
          type="number"
          min={0}
          value={order}
          onChange={(e) => setOrder(e.target.value)}
        />
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={requiresEvent}
            onChange={(e) => setRequiresEvent(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">
            Require an event for transactions in this category
            <span className="block text-xs text-gray-500 mt-0.5">
              Use for programming/event categories where every expense should tie to a specific event
              (UB Linked Event ID and/or event title).
            </span>
          </span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{existing ? 'Save' : 'Add'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function SubCategoryModal({ isOpen, onClose, category, existing, deptId }) {
  const [name, setName] = useState('');
  const [order, setOrder] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(existing?.name ?? '');
      setOrder(existing?.order ?? (category?.subCategories?.length ?? 0));
      setError('');
    }
  }, [isOpen, existing, category]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Name is required.');

    setLoading(true);
    try {
      const subs = [...(category.subCategories ?? [])];
      const newSub = {
        id: existing?.id ?? crypto.randomUUID(),
        name: name.trim(),
        order: Number(order),
      };

      if (existing) {
        const idx = subs.findIndex((s) => s.id === existing.id);
        if (idx >= 0) subs[idx] = newSub;
        else subs.push(newSub);
      } else {
        subs.push(newSub);
      }

      await updateDocument(`departments/${deptId}/categories/${category.id}`, {
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
          label="Display Order"
          id="subOrder"
          type="number"
          min={0}
          value={order}
          onChange={(e) => setOrder(e.target.value)}
        />
        <p className="text-xs text-gray-500">
          Dollar allocation is set per building in the Allocations tab.
        </p>
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
      if (item.type === 'category') {
        await deleteDocument(`departments/${deptId}/categories/${item.item.id}`);
      } else {
        const subs = (item.category.subCategories ?? []).filter((s) => s.id !== item.item.id);
        await updateDocument(`departments/${deptId}/categories/${item.category.id}`, {
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
          {item?.type === 'category' ? item.item.name : item?.item?.name}
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

function PlusIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
    </svg>
  );
}
