import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  subscribeToCollection,
  updateDocument,
  getCollection,
  serverTimestamp,
  where,
  orderBy,
} from '../../lib/firestore';
import { formatCurrency, formatDate } from '../../lib/format';
import Button from '../shared/Button';
import Modal from '../shared/Modal';
import Input from '../shared/Input';
import EditExpenseModal from '../expense/EditExpenseModal';
import ReceiptUpload from '../expense/ReceiptUpload';

export default function TransactionsView({ building, fiscalYear }) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [voidModal, setVoidModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [filters, setFilters] = useState({ search: '', categoryId: '', staffId: '' });

  useEffect(() => {
    if (!building?.id || !fiscalYear?.id) return;
    const unsubTx = subscribeToCollection(
      `buildings/${building.id}/transactions`,
      (docs) => { setTransactions(docs); setLoading(false); },
      where('fiscalYearId', '==', fiscalYear.id),
      orderBy('receiptDate', 'desc')
    );
    const unsubVendors = subscribeToCollection(`buildings/${building.id}/vendors`, setVendors);
    const unsubCats = subscribeToCollection(
      `buildings/${building.id}/categories`,
      setCategories,
      where('fiscalYearId', '==', fiscalYear.id)
    );
    const unsubStaff = subscribeToCollection(
      `buildings/${building.id}/staffMembers`,
      setStaff,
      where('fiscalYearId', '==', fiscalYear.id)
    );
    return () => { unsubTx(); unsubVendors(); unsubCats(); unsubStaff(); };
  }, [building?.id, fiscalYear?.id]);

  const isAdmin = building?.roles?.[user?.uid] === 'admin';

  const vendorMap = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  const staffMap = Object.fromEntries(staff.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));

  function getCategoryLabel(tx) {
    const cat = categories.find((c) => c.id === tx.categoryId);
    if (!cat) return '—';
    const sub = cat.subCategories?.find((s) => s.id === tx.subCategoryId);
    return sub ? `${cat.name} / ${sub.name}` : cat.name;
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
    const headers = ['Date', 'Vendor', 'Description', 'Category', 'Cost', 'Status', 'Notes'];
    const rows = filtered.map((tx) => [
      formatDate(tx.receiptDate),
      vendorMap[tx.vendorId] ?? tx.vendorId,
      tx.description ?? '',
      getCategoryLabel(tx),
      tx.cost ?? 0,
      tx.reconciliationStatus,
      tx.notes ?? '',
    ]);
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
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Receipt</th>
                {isAdmin && <th className="px-4 py-3 w-24" />}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filtered.map((tx) => (
                <tr
                  key={tx.id}
                  className={`hover:bg-gray-50 ${tx.reconciliationStatus === 'voided' ? 'opacity-40 line-through' : ''}`}
                >
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(tx.receiptDate)}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{vendorMap[tx.vendorId] ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{tx.description || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{getCategoryLabel(tx)}</td>
                  <td className="px-4 py-3 text-right text-gray-800 font-medium">{formatCurrency(tx.cost)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={tx.reconciliationStatus} />
                  </td>
                  <td className="px-4 py-3">
                    {tx.reconciliationStatus !== 'voided' && (
                      <ReceiptUpload
                        compact
                        buildingId={building.id}
                        transactionId={tx.id}
                        receiptUrl={tx.receiptUrl}
                        onUploaded={(url) => {
                          // Optimistic update handled by Firestore subscription
                        }}
                      />
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      {tx.reconciliationStatus !== 'voided' && (
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => setEditModal(tx)}
                            className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setVoidModal(tx)}
                            className="text-xs text-red-500 hover:text-red-700 hover:underline"
                          >
                            Void
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EditExpenseModal
        isOpen={editModal !== null}
        onClose={() => setEditModal(null)}
        transaction={editModal}
        building={building}
      />

      <VoidModal
        isOpen={voidModal !== null}
        onClose={() => setVoidModal(null)}
        transaction={voidModal}
        building={building}
        user={user}
        vendorMap={vendorMap}
      />
    </div>
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

function VoidModal({ isOpen, onClose, transaction, building, user, vendorMap }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (isOpen) setReason(''); }, [isOpen]);

  async function handleVoid() {
    setLoading(true);
    try {
      await updateDocument(`buildings/${building.id}/transactions/${transaction.id}`, {
        reconciliationStatus: 'voided',
        voidedAt: serverTimestamp(),
        voidReason: reason.trim() || null,
        lastEditedAt: serverTimestamp(),
        lastEditedBy: user.uid,
      });
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
