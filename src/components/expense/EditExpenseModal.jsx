import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useBuilding } from '../../contexts/BuildingContext';
import {
  subscribeToCollection,
  updateDocument,
  addDocument,
  serverTimestamp,
  where,
  orderBy,
} from '../../lib/firestore';
import { toTimestamp, toDate } from '../../lib/format';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import Input from '../shared/Input';
import VendorTypeahead from './VendorTypeahead';
import CategorySelect from './CategorySelect';
import StaffAllocations from './StaffAllocations';

function dateInputValue(firestoreTimestamp) {
  const d = toDate(firestoreTimestamp);
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

function formFromTransaction(tx) {
  return {
    receiptDate: dateInputValue(tx.receiptDate),
    transactionDate: dateInputValue(tx.transactionDate) === dateInputValue(tx.receiptDate)
      ? ''
      : dateInputValue(tx.transactionDate),
    vendorId: tx.vendorId ?? null,
    description: tx.description ?? '',
    categoryId: tx.categoryId ?? null,
    subCategoryId: tx.subCategoryId ?? null,
    staffAllocations: tx.staffAllocations ?? [],
    eventId: tx.eventId ?? null,
    eventTitle: '',
    cost: tx.cost != null ? String(tx.cost) : '',
    subGroupingTag: tx.subGroupingTag ?? '',
    notes: tx.notes ?? '',
  };
}

export default function EditExpenseModal({ isOpen, onClose, transaction, building }) {
  const { user } = useAuth();
  const { fiscalYear } = useBuilding();

  const [form, setForm] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [staff, setStaff] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const trackPersonal = building?.settings?.trackPersonalBudgets;
  const subGroupLabel = building?.settings?.subGroupingLabel;
  const eventIntegration = building?.settings?.eventIntegration;
  const hasEvents = eventIntegration && eventIntegration !== 'none';

  useEffect(() => {
    if (!isOpen || !building?.id || !fiscalYear?.id) return;

    const unsubVendors = subscribeToCollection(
      `buildings/${building.id}/vendors`,
      setVendors,
      orderBy('name', 'asc')
    );
    const unsubCats = subscribeToCollection(
      `buildings/${building.id}/categories`,
      setCategories,
      where('fiscalYearId', '==', fiscalYear.id),
      orderBy('order', 'asc')
    );
    const unsubStaff = trackPersonal
      ? subscribeToCollection(
          `buildings/${building.id}/staffMembers`,
          (docs) => setStaff(docs.filter((s) => s.active !== false)),
          where('fiscalYearId', '==', fiscalYear.id),
          orderBy('lastName', 'asc')
        )
      : () => {};
    const unsubEvents = hasEvents
      ? subscribeToCollection(`buildings/${building.id}/events`, setEvents, orderBy('title', 'asc'))
      : () => {};

    return () => { unsubVendors(); unsubCats(); unsubStaff(); unsubEvents(); };
  }, [isOpen, building?.id, fiscalYear?.id]);

  useEffect(() => {
    if (isOpen && transaction) {
      setForm(formFromTransaction(transaction));
      setError('');

      // Populate event title if there's an eventId
      if (transaction.eventId && hasEvents) {
        const ev = events.find((e) => e.id === transaction.eventId);
        if (ev) setForm((f) => ({ ...f, eventTitle: ev.title }));
      }
    }
  }, [isOpen, transaction]);

  // Sync event title once events load
  useEffect(() => {
    if (form?.eventId && hasEvents && events.length > 0) {
      const ev = events.find((e) => e.id === form.eventId);
      if (ev) setForm((f) => ({ ...f, eventTitle: ev.title }));
    }
  }, [events]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Recalculate even split when cost changes and staff are selected
  useEffect(() => {
    if (!form) return;
    const cost = parseFloat(form.cost) || 0;
    if (form.staffAllocations.length === 0 || cost <= 0) return;
    const even = +(cost / form.staffAllocations.length).toFixed(2);
    const newAllocs = form.staffAllocations.map((a, i) => ({
      ...a,
      amount: i === form.staffAllocations.length - 1
        ? +(cost - even * (form.staffAllocations.length - 1)).toFixed(2)
        : even,
    }));
    set('staffAllocations', newAllocs);
  }, [form?.cost]);

  function validate() {
    if (!form) return 'No form data.';
    const cost = parseFloat(form.cost);
    if (!form.vendorId) return 'Vendor is required.';
    if (!form.categoryId) return 'Category is required.';
    if (!form.subCategoryId) return 'Sub-category is required.';
    if (!form.receiptDate) return 'Receipt date is required.';
    if (isNaN(cost) || cost <= 0) return 'Cost must be a positive number.';
    if (fiscalYear) {
      const receiptTs = new Date(form.receiptDate).getTime();
      const fyStart = fiscalYear.startDate?.toDate?.()?.getTime() ?? 0;
      const fyEnd = fiscalYear.endDate?.toDate?.()?.getTime() ?? Infinity;
      if (receiptTs < fyStart || receiptTs > fyEnd) {
        return 'Receipt date must be within the current fiscal year.';
      }
    }
    return null;
  }

  async function createVendorIfNew(name) {
    const id = await addDocument(`buildings/${building.id}/vendors`, {
      name,
      aliases: [],
      status: 'unverified',
      notes: '',
      categoryHint: null,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      lastUsedAt: serverTimestamp(),
      transactionCount: 0,
      totalSpend: 0,
    });
    set('vendorId', id);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) return setError(validationError);

    setLoading(true);
    setError('');
    try {
      const cost = parseFloat(form.cost);
      const txDate = form.transactionDate || form.receiptDate;

      let eventId = form.eventId;
      if (hasEvents && form.eventTitle.trim() && !eventId) {
        eventId = await addDocument(`buildings/${building.id}/events`, {
          title: form.eventTitle.trim(),
          externalId: null,
          externalUrl: null,
          eventDate: null,
          associatedStaffIds: form.staffAllocations.map((a) => a.staffId),
          notes: '',
          verified: false,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
      }

      await updateDocument(`buildings/${building.id}/transactions/${transaction.id}`, {
        receiptDate: toTimestamp(form.receiptDate),
        transactionDate: toTimestamp(txDate),
        vendorId: form.vendorId,
        description: form.description.trim(),
        categoryId: form.categoryId,
        subCategoryId: form.subCategoryId,
        cost,
        staffAllocations: form.staffAllocations,
        eventId: eventId ?? null,
        notes: form.notes.trim(),
        subGroupingTag: subGroupLabel && form.subGroupingTag.trim() ? form.subGroupingTag.trim() : null,
        lastEditedAt: serverTimestamp(),
        lastEditedBy: user.uid,
      });

      onClose();
    } catch (err) {
      console.error(err);
      setError('Failed to save changes. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!form) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Expense" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Receipt Date *"
            id="editReceiptDate"
            type="date"
            required
            value={form.receiptDate}
            onChange={(e) => set('receiptDate', e.target.value)}
          />
          <Input
            label="Transaction Date (if different)"
            id="editTransactionDate"
            type="date"
            value={form.transactionDate}
            onChange={(e) => set('transactionDate', e.target.value)}
            helpText="Leave blank to match receipt date."
          />
        </div>

        <VendorTypeahead
          vendors={vendors}
          value={form.vendorId}
          onChange={(id) => set('vendorId', id)}
          onCreateNew={createVendorIfNew}
        />

        <Input
          label="Description"
          id="editDescription"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="What was this for?"
        />

        <CategorySelect
          categories={categories}
          categoryId={form.categoryId}
          subCategoryId={form.subCategoryId}
          onCategoryChange={(id) => set('categoryId', id)}
          onSubCategoryChange={(id) => set('subCategoryId', id)}
        />

        <Input
          label="Cost ($) *"
          id="editCost"
          type="number"
          min="0.01"
          step="0.01"
          required
          value={form.cost}
          onChange={(e) => set('cost', e.target.value)}
          placeholder="0.00"
        />

        {trackPersonal && staff.length > 0 && (
          <StaffAllocations
            staff={staff}
            allocations={form.staffAllocations}
            onChange={(allocs) => set('staffAllocations', allocs)}
            totalCost={parseFloat(form.cost) || 0}
          />
        )}

        {hasEvents && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event / Program</label>
            <input
              type="text"
              value={form.eventTitle}
              onChange={(e) => { set('eventTitle', e.target.value); set('eventId', null); }}
              list="edit-events-list"
              placeholder="Search or type event name..."
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <datalist id="edit-events-list">
              {events.map((ev) => (
                <option key={ev.id} value={ev.title} />
              ))}
            </datalist>
          </div>
        )}

        {subGroupLabel && (
          <Input
            label={subGroupLabel}
            id="editSubGroupingTag"
            value={form.subGroupingTag}
            onChange={(e) => set('subGroupingTag', e.target.value)}
          />
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={2}
            placeholder="Optional notes..."
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>Save Changes</Button>
        </div>
      </form>
    </Modal>
  );
}
