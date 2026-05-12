import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useOrg } from '../../contexts/BuildingContext';
import {
  subscribeToCollection,
  addDocument,
  setDocument,
  getBatch,
  batchSet,
  batchUpdate,
  newDocId,
  getDocument,
  serverTimestamp,
  where,
  orderBy,
  increment,
} from '../../lib/firestore';
import { toTimestamp } from '../../lib/format';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import Input from '../shared/Input';
import VendorTypeahead from './VendorTypeahead';
import CategorySelect from './CategorySelect';
import StaffAllocations from './StaffAllocations';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function tsToDateStr(ts) {
  const d = ts?.toDate?.();
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

function emptyForm() {
  return {
    receiptDate: today(),
    transactionDate: '',
    vendorId: null,
    description: '',
    categoryId: null,
    subCategoryId: null,
    staffAllocations: [],
    eventId: null,
    eventTitle: '',
    externalEventId: '', // UB Linked Event ID (the unique key code)
    strategyTypeId: '',
    cost: '',
    paymentSourceId: null,
    subGroupingTag: '',
    notes: '',
  };
}

function formFromTransaction(tx, eventsList) {
  const ev = tx.eventId ? eventsList.find((e) => e.id === tx.eventId) : null;
  return {
    receiptDate: tsToDateStr(tx.receiptDate) || today(),
    transactionDate:
      tsToDateStr(tx.transactionDate) === tsToDateStr(tx.receiptDate)
        ? ''
        : tsToDateStr(tx.transactionDate),
    vendorId: tx.vendorId ?? null,
    description: tx.description ?? '',
    categoryId: tx.categoryId ?? null,
    subCategoryId: tx.subCategoryId ?? null,
    staffAllocations: tx.staffAllocations ?? [],
    eventId: tx.eventId ?? null,
    eventTitle: ev?.title ?? '',
    externalEventId: tx.externalEventId ?? ev?.externalId ?? '',
    strategyTypeId: ev?.strategyTypeId ?? '',
    cost: tx.cost != null ? String(tx.cost) : '',
    paymentSourceId: tx.paymentSourceId ?? null,
    subGroupingTag: tx.subGroupingTag ?? '',
    notes: tx.notes ?? '',
  };
}

export default function ExpenseModal({ isOpen, onClose, building, existing = null }) {
  const { user } = useAuth();
  const { fiscalYear, activeDepartment } = useOrg();
  const deptId = activeDepartment?.id;
  const editMode = !!existing;

  const [form, setForm] = useState(emptyForm());
  const [bldgVendors, setBldgVendors] = useState([]);
  const [deptVendors, setDeptVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [staff, setStaff] = useState([]);
  const [events, setEvents] = useState([]);
  const [strategyTypes, setStrategyTypes] = useState([]);
  const [paymentSources, setPaymentSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saveAndAdd, setSaveAndAdd] = useState(false);

  const trackPersonal = building?.settings?.trackPersonalBudgets;
  const subGroupLabel = building?.settings?.subGroupingLabel;

  const selectedCategory = categories.find((c) => c.id === form.categoryId);
  const categoryRequiresEvent = !!selectedCategory?.requiresEvent;

  // Subscribe to vendors, categories, staff, events when modal opens
  useEffect(() => {
    if (!isOpen || !building?.id || !fiscalYear?.id || !deptId) return;

    const unsubBldgVendors = subscribeToCollection(
      `buildings/${building.id}/vendors`,
      setBldgVendors,
      orderBy('name', 'asc')
    );
    const unsubDeptVendors = subscribeToCollection(
      `departments/${deptId}/vendors`,
      setDeptVendors,
      orderBy('name', 'asc')
    );
    const unsubCats = subscribeToCollection(
      `departments/${deptId}/categories`,
      setCategories,
      orderBy('order', 'asc')
    );
    const unsubStaff = building.settings?.trackPersonalBudgets
      ? subscribeToCollection(
          `buildings/${building.id}/staffMembers`,
          (docs) => setStaff(docs.filter((s) => s.active !== false)),
          where('fiscalYearId', '==', fiscalYear.id),
          orderBy('lastName', 'asc')
        )
      : () => {};
    const unsubEvents = subscribeToCollection(
      `buildings/${building.id}/events`,
      setEvents,
      orderBy('title', 'asc')
    );
    const unsubStrategies = subscribeToCollection(
      `departments/${deptId}/strategyTypes`,
      setStrategyTypes,
      orderBy('order', 'asc')
    );
    const unsubPaymentSources = subscribeToCollection(
      `departments/${deptId}/paymentSources`,
      (docs) => setPaymentSources(docs.filter((p) => !p.archived)),
      orderBy('order', 'asc')
    );

    return () => {
      unsubBldgVendors(); unsubDeptVendors(); unsubCats(); unsubStaff(); unsubEvents(); unsubStrategies(); unsubPaymentSources();
    };
  }, [isOpen, building?.id, fiscalYear?.id, deptId]);

  // Merge dept + building vendors with a scope tag so we can gate per-building
  // stats updates and let the typeahead label shared entries.
  const vendors = [
    ...deptVendors.map((v) => ({ ...v, scope: 'department' })),
    ...bldgVendors.map((v) => ({ ...v, scope: 'building' })),
  ];

  // Reset form when modal opens. In edit mode, populate from the transaction
  // once events have loaded (so we can resolve title/externalId/strategyType
  // from the linked event doc).
  useEffect(() => {
    if (!isOpen) return;
    if (editMode) {
      setForm(formFromTransaction(existing, events));
    } else {
      setForm(emptyForm());
    }
    setError('');
  }, [isOpen, editMode, existing?.id, events.length]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Recalculate even split when cost changes and staff are selected
  useEffect(() => {
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
  }, [form.cost]);

  function validate() {
    const cost = parseFloat(form.cost);
    if (!form.vendorId) return 'Vendor is required.';
    if (!form.categoryId) return 'Category is required.';
    if (!form.subCategoryId) return 'Sub-category is required.';
    if (!form.receiptDate) return 'Receipt date is required.';
    if (isNaN(cost) || cost <= 0) return 'Cost must be a positive number.';
    if (categoryRequiresEvent && !form.eventTitle.trim() && !form.externalEventId.trim() && !form.eventId) {
      return 'Event is required for this category. Enter an event title or UB Linked Event ID.';
    }
    // Date within fiscal year
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
      const receiptDateTs = toTimestamp(form.receiptDate);
      const txDateTs = toTimestamp(txDate);

      // Resolve or create the event doc.
      // Priority: explicit eventId from picker > match by externalEventId > match by title > create new.
      let eventId = form.eventId;
      const externalId = form.externalEventId.trim() || null;
      const title = form.eventTitle.trim();
      const strategyTypeId = form.strategyTypeId || null;

      if (!eventId && externalId) {
        const existing = events.find((ev) => ev.externalId === externalId);
        if (existing) eventId = existing.id;
      }
      if (!eventId && title) {
        const existing = events.find((ev) => ev.title?.toLowerCase() === title.toLowerCase());
        if (existing) eventId = existing.id;
      }
      if (!eventId && (title || externalId)) {
        eventId = await addDocument(`buildings/${building.id}/events`, {
          title: title || externalId,
          externalId,
          externalUrl: null,
          eventDate: null,
          strategyTypeId,
          associatedStaffIds: form.staffAllocations.map((a) => a.staffId),
          notes: '',
          verified: false,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
      }

      const batch = getBatch();
      const baseFields = {
        receiptDate: receiptDateTs,
        transactionDate: txDateTs,
        staffAllocations: form.staffAllocations,
        vendorId: form.vendorId,
        description: form.description.trim(),
        categoryId: form.categoryId,
        subCategoryId: form.subCategoryId,
        cost,
        paymentSourceId: form.paymentSourceId || null,
        eventId: eventId ?? null,
        externalEventId: externalId,
        notes: form.notes.trim(),
        subGroupingTag: subGroupLabel && form.subGroupingTag.trim() ? form.subGroupingTag.trim() : null,
        lastEditedAt: serverTimestamp(),
        lastEditedBy: user.uid,
      };

      // Resolve the Firestore path for a vendor doc by scope. Dept-scoped
      // vendors live under departments/<deptId>/vendors; multiple buildings
      // may write the same doc concurrently, so counters use increment() to
      // be race-safe.
      const vendorPath = (v) =>
        v?.scope === 'department'
          ? `departments/${deptId}/vendors/${v.id}`
          : `buildings/${building.id}/vendors/${v.id}`;

      if (editMode) {
        // Update existing transaction
        batchUpdate(batch, `buildings/${building.id}/transactions/${existing.id}`, baseFields);

        const oldVendor = existing.vendorId;
        const oldCost = existing.cost ?? 0;
        const oldVendorDoc = vendors.find((v) => v.id === oldVendor);
        const newVendorDoc = vendors.find((v) => v.id === form.vendorId);
        if (oldVendor === form.vendorId) {
          if (newVendorDoc && oldCost !== cost) {
            batchUpdate(batch, vendorPath(newVendorDoc), {
              lastUsedAt: serverTimestamp(),
              totalSpend: increment(cost - oldCost),
            });
          }
        } else {
          if (oldVendorDoc) {
            batchUpdate(batch, vendorPath(oldVendorDoc), {
              transactionCount: increment(-1),
              totalSpend: increment(-oldCost),
            });
          }
          if (newVendorDoc) {
            batchUpdate(batch, vendorPath(newVendorDoc), {
              lastUsedAt: serverTimestamp(),
              transactionCount: increment(1),
              totalSpend: increment(cost),
            });
          }
        }
      } else {
        // Create new transaction
        const txId = newDocId(`buildings/${building.id}/transactions`);
        batchSet(batch, `buildings/${building.id}/transactions/${txId}`, {
          ...baseFields,
          fiscalYearId: fiscalYear.id,
          recordedBy: user.uid,
          reconciliationStatus: 'open',
          reconciliationCycleId: null,
          receiptUrl: null,
          createdAt: serverTimestamp(),
          voidedAt: null,
          voidReason: null,
          linkedTransactionId: null,
        });

        const newVendorDoc = vendors.find((v) => v.id === form.vendorId);
        if (newVendorDoc) {
          batchUpdate(batch, vendorPath(newVendorDoc), {
            lastUsedAt: serverTimestamp(),
            transactionCount: increment(1),
            totalSpend: increment(cost),
          });
        }
      }

      await batch.commit();

      if (editMode) {
        onClose();
      } else if (saveAndAdd) {
        // Preserve date, vendor, event, payment source for batch entry
        setForm((f) => ({
          ...emptyForm(),
          receiptDate: f.receiptDate,
          vendorId: f.vendorId,
          eventId: f.eventId,
          eventTitle: f.eventTitle,
          externalEventId: f.externalEventId,
          strategyTypeId: f.strategyTypeId,
          paymentSourceId: f.paymentSourceId,
        }));
      } else {
        onClose();
      }
    } catch (err) {
      console.error(err);
      setError('Failed to save expense. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editMode ? 'Edit Expense' : 'New Expense'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Receipt Date *"
            id="receiptDate"
            type="date"
            required
            value={form.receiptDate}
            onChange={(e) => set('receiptDate', e.target.value)}
          />
          <Input
            label="Transaction Date (if different)"
            id="transactionDate"
            type="date"
            value={form.transactionDate}
            onChange={(e) => set('transactionDate', e.target.value)}
            helpText="Leave blank to match receipt date."
          />
        </div>

        {/* Vendor */}
        <VendorTypeahead
          vendors={vendors}
          value={form.vendorId}
          onChange={(id) => set('vendorId', id)}
          onCreateNew={createVendorIfNew}
        />

        {/* Description */}
        <Input
          label="Description"
          id="description"
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="What was this for?"
        />

        {/* Category */}
        <CategorySelect
          categories={categories}
          categoryId={form.categoryId}
          subCategoryId={form.subCategoryId}
          onCategoryChange={(id) => set('categoryId', id)}
          onSubCategoryChange={(id) => set('subCategoryId', id)}
        />

        {/* Cost + Payment Source */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Cost ($) *"
            id="cost"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={form.cost}
            onChange={(e) => set('cost', e.target.value)}
            placeholder="0.00"
          />
          <div>
            <label htmlFor="paymentSourceId" className="block text-sm font-medium text-gray-700 mb-1">
              Payment Source
            </label>
            <select
              id="paymentSourceId"
              value={form.paymentSourceId ?? ''}
              onChange={(e) => set('paymentSourceId', e.target.value || null)}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">— Select —</option>
              {paymentSources.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.requiresReconciliation ? '' : ' (no reconcile)'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Staff Allocations */}
        {trackPersonal && staff.length > 0 && (
          <StaffAllocations
            staff={staff}
            allocations={form.staffAllocations}
            onChange={(allocs) => set('staffAllocations', allocs)}
            totalCost={parseFloat(form.cost) || 0}
          />
        )}

        {/* Event */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div className="text-xs font-medium text-gray-400 uppercase">
            Event {categoryRequiresEvent && <span className="text-red-500 normal-case lowercase">required for this category</span>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Event Title{categoryRequiresEvent ? ' *' : ''}
              </label>
              <input
                type="text"
                value={form.eventTitle}
                onChange={(e) => {
                  set('eventTitle', e.target.value);
                  set('eventId', null);
                }}
                list="events-list"
                placeholder="e.g. Welcome Back BBQ"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="events-list">
                {events.map((ev) => (
                  <option key={ev.id} value={ev.title} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                UB Linked Event ID
              </label>
              <input
                type="text"
                value={form.externalEventId}
                onChange={(e) => {
                  set('externalEventId', e.target.value);
                  set('eventId', null);
                }}
                placeholder="e.g. 12345 (from UB Linked)"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {strategyTypes.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Strategy Type
              </label>
              <select
                value={form.strategyTypeId}
                onChange={(e) => set('strategyTypeId', e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— None —</option>
                {strategyTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Saved on the event doc when a new event is created. Existing events keep their current strategy.
              </p>
            </div>
          )}
        </div>

        {/* Sub-grouping tag */}
        {subGroupLabel && (
          <Input
            label={subGroupLabel}
            id="subGroupingTag"
            value={form.subGroupingTag}
            onChange={(e) => set('subGroupingTag', e.target.value)}
            placeholder={`e.g. GOO, LEH, FLEEK...`}
          />
        )}

        {/* Notes */}
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
          <div className="flex gap-2">
            {!editMode && (
              <Button
                type="submit"
                variant="secondary"
                loading={loading && saveAndAdd}
                disabled={loading}
                onClick={() => setSaveAndAdd(true)}
              >
                Save & Add Another
              </Button>
            )}
            <Button
              type="submit"
              loading={loading && !saveAndAdd}
              disabled={loading}
              onClick={() => setSaveAndAdd(false)}
            >
              {editMode ? 'Save Changes' : 'Save Expense'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
