import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useOrg } from '../../contexts/BuildingContext';
import {
  subscribeToCollection,
  getCollection,
  getBatch,
  batchUpdate,
  serverTimestamp,
  where,
  orderBy,
  increment,
} from '../../lib/firestore';
import { formatCurrency, formatDate } from '../../lib/format';
import Button from '../shared/Button';
import Modal from '../shared/Modal';
import Input from '../shared/Input';
import ExpenseModal from '../expense/ExpenseModal';

export default function TransactionsView({ building, fiscalYear }) {
  const { user } = useAuth();
  const { activeDepartment } = useOrg();
  const deptId = activeDepartment?.id;
  const [transactions, setTransactions] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [deptVendors, setDeptVendors] = useState([]);
  const [paymentSources, setPaymentSources] = useState([]);
  const [categories, setCategories] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [voidModal, setVoidModal] = useState(null);
  const [editTx, setEditTx] = useState(null);
  const [filters, setFilters] = useState({ search: '', categoryId: '', staffId: '' });

  useEffect(() => {
    if (!building?.id || !fiscalYear?.id || !deptId) return;
    const unsubTx = subscribeToCollection(
      `buildings/${building.id}/transactions`,
      (docs) => { setTransactions(docs); setLoading(false); },
      where('fiscalYearId', '==', fiscalYear.id),
      orderBy('receiptDate', 'desc')
    );
    const unsubVendors = subscribeToCollection(`buildings/${building.id}/vendors`, setVendors);
    const unsubDeptVendors = subscribeToCollection(`departments/${deptId}/vendors`, setDeptVendors);
    const unsubPaymentSources = subscribeToCollection(
      `departments/${deptId}/paymentSources`,
      setPaymentSources,
      orderBy('order', 'asc')
    );
    const unsubCats = subscribeToCollection(
      `departments/${deptId}/categories`,
      setCategories,
      orderBy('order', 'asc')
    );
    const unsubStaff = subscribeToCollection(
      `buildings/${building.id}/staffMembers`,
      setStaff,
      where('fiscalYearId', '==', fiscalYear.id)
    );
    return () => { unsubTx(); unsubVendors(); unsubDeptVendors(); unsubPaymentSources(); unsubCats(); unsubStaff(); };
  }, [building?.id, fiscalYear?.id, deptId]);

  const isAdmin = building?.roles?.[user?.uid] === 'admin';

  // Merge dept + building vendors so transactions referencing dept-scoped
  // vendors render correctly and so the void handler can locate either scope.
  const vendorById = Object.fromEntries([
    ...deptVendors.map((v) => [v.id, { ...v, scope: 'department' }]),
    ...vendors.map((v) => [v.id, { ...v, scope: 'building' }]),
  ]);
  const vendorMap = Object.fromEntries(Object.entries(vendorById).map(([id, v]) => [id, v.name]));
  const paymentSourceById = Object.fromEntries(paymentSources.map((p) => [p.id, p]));
  const staffMap = Object.fromEntries(staff.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));

  function getCategoryParts(tx) {
    const cat = categories.find((c) => c.id === tx.categoryId);
    if (!cat) return { category: '—', subcategory: '—' };
    const sub = cat.subCategories?.find((s) => s.id === tx.subCategoryId);
    return { category: cat.name, subcategory: sub?.name ?? '—' };
  }

  const filtered = transactions.filter((tx) => {
    const searchLower = filters.search.toLowerCase();
    if (searchLower) {
      const vendorName = vendorMap[tx.vendorId] ?? '';
      const desc = tx.description ?? '';
      if (!vendorName.toLowerCase().includes(searchLower) && !desc.toLowerCase().includes(searchLower))
        return false;
    }
    if (filters.categoryId && tx.categoryId !== filters.categoryId) return false;
    if (filters.staffId) {
      const hasStaff = tx.staffAllocations?.some((a) => a.staffId === filters.staffId);
      if (!hasStaff) return false;
    }
    return true;
  });

  function exportCSV() {
    const headers = ['Date', 'Vendor', 'Description', 'Category', 'Subcategory', 'Cost', 'Status', 'Notes'];
    const rows = filtered.map((tx) => {
      const { category, subcategory } = getCategoryParts(tx);
      return [
        formatDate(tx.receiptDate),
        vendorMap[tx.vendorId] ?? tx.vendorId,
        tx.description ?? '',
        category,
        subcategory,
        tx.cost ?? 0,
        tx.reconciliationStatus,
        tx.notes ?? '',
      ];
    });
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${fiscalYear.label}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-500">{filtered.length} of {transactions.length} shown</p>
        </div>
        <Button variant="secondary" size="sm" onClick={exportCSV}>Export CSV</Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search vendor or description..."
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filters.categoryId}
          onChange={(e) => setFilters((f) => ({ ...f, categoryId: e.target.value }))}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {building?.settings?.trackPersonalBudgets && (
          <select
            value={filters.staffId}
            onChange={(e) => setFilters((f) => ({ ...f, staffId: e.target.value }))}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All staff</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg text-gray-400">
          No transactions found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full table-fixed divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-[110px]">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-[220px]">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-[150px]">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-[160px]">Subcategory</th>
                <th className="pl-4 pr-[41px] py-3 text-right text-xs font-medium text-gray-500 uppercase w-[120px] border-r-2 border-gray-300">Cost</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-[90px]">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-[80px]">Status</th>
                {isAdmin && <th className="px-4 py-3 w-[80px]" />}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filtered.map((tx) => {
                const { category, subcategory } = getCategoryParts(tx);
                const source = tx.paymentSourceId ? paymentSourceById[tx.paymentSourceId] : null;
                return (
                <tr
                  key={tx.id}
                  className={`hover:bg-gray-50 ${tx.reconciliationStatus === 'voided' ? 'opacity-40 line-through' : ''}`}
                >
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(tx.receiptDate)}</td>
                  <td className="px-4 py-3 font-medium text-gray-800 truncate" title={vendorMap[tx.vendorId] ?? ''}>{vendorMap[tx.vendorId] ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 truncate" title={tx.description ?? ''}>{tx.description || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 truncate" title={category}>{category}</td>
                  <td className="px-4 py-3 text-gray-600 truncate" title={subcategory}>{subcategory}</td>
                  <td className="pl-4 pr-[41px] py-3 text-right text-gray-800 font-medium whitespace-nowrap border-r-2 border-gray-300">{formatCurrency(tx.cost)}</td>
                  <td className="px-4 py-3">
                    <SourceBadge source={source} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={tx.reconciliationStatus} />
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      {tx.reconciliationStatus !== 'voided' && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditTx(tx)}
                            title="Edit"
                            aria-label="Edit transaction"
                            className="text-gray-400 hover:text-gray-700 p-1 rounded"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setVoidModal(tx)}
                            title="Void"
                            aria-label="Void transaction"
                            className="text-gray-400 hover:text-red-500 p-1 rounded"
                          >
                            <BanIcon className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <VoidModal
        isOpen={voidModal !== null}
        onClose={() => setVoidModal(null)}
        transaction={voidModal}
        building={building}
        deptId={deptId}
        user={user}
        vendorMap={vendorMap}
        vendorById={vendorById}
      />

      <ExpenseModal
        isOpen={editTx !== null}
        onClose={() => setEditTx(null)}
        building={building}
        existing={editTx}
      />
    </div>
  );
}

function SourceBadge({ source }) {
  if (!source) return <span className="text-xs text-gray-300">—</span>;
  // Cool color for reconciling sources, neutral gray for non-reconciling ones.
  // Once Phase 2 reconciliation lands, the blue badges flag work in queue.
  const cls = source.requiresReconciliation
    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
    : 'bg-gray-100 text-gray-600 border border-gray-200';
  return (
    <span
      className={`inline-flex px-2 py-0.5 text-[11px] font-mono font-medium rounded ${cls}`}
      title={source.name}
    >
      {source.code}
    </span>
  );
}

function StatusBadge({ status }) {
  const styles = {
    open: 'bg-gray-100 text-gray-600',
    pending: 'bg-blue-100 text-blue-700',
    reconciled: 'bg-green-100 text-green-700',
    voided: 'bg-red-100 text-red-600',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${styles[status] ?? styles.open}`}>
      {status}
    </span>
  );
}

function VoidModal({ isOpen, onClose, transaction, building, deptId, user, vendorMap, vendorById }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (isOpen) setReason(''); }, [isOpen]);

  async function handleVoid() {
    setLoading(true);
    try {
      const batch = getBatch();
      batchUpdate(batch, `buildings/${building.id}/transactions/${transaction.id}`, {
        reconciliationStatus: 'voided',
        voidedAt: serverTimestamp(),
        voidReason: reason.trim() || null,
        lastEditedAt: serverTimestamp(),
        lastEditedBy: user.uid,
      });
      // Roll back the vendor's denormalized counters. Voids are reversible at
      // the data level (we just flip the status flag) but un-voiding isn't
      // exposed in the UI today, so we don't track that direction here.
      const vendor = vendorById?.[transaction.vendorId];
      if (vendor) {
        const vPath = vendor.scope === 'department'
          ? `departments/${deptId}/vendors/${vendor.id}`
          : `buildings/${building.id}/vendors/${vendor.id}`;
        batchUpdate(batch, vPath, {
          transactionCount: increment(-1),
          totalSpend: increment(-(transaction.cost ?? 0)),
        });
      }
      await batch.commit();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (!transaction) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Void Transaction" size="sm">
      <p className="text-sm text-gray-600 mb-4">
        Void <span className="font-semibold">{vendorMap[transaction?.vendorId] ?? 'this transaction'}</span>{' '}
        for <span className="font-semibold">{formatCurrency(transaction?.cost)}</span>?
        It will be hidden from all rollups.
      </p>
      <Input
        label="Reason (optional)"
        id="voidReason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Data entry error, duplicate, etc."
        autoFocus
      />
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={loading} onClick={handleVoid}>Void Transaction</Button>
      </div>
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

function BanIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  );
}
