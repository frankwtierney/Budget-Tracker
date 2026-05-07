import { useState, useEffect, useRef } from 'react';
import {
  subscribeToCollection,
  updateDocument,
  orderBy,
} from '../../lib/firestore';
import { formatCurrency, formatDate } from '../../lib/format';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import Input from '../shared/Input';

export default function VendorList({ building }) {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editModal, setEditModal] = useState(null);

  useEffect(() => {
    const unsub = subscribeToCollection(
      `buildings/${building.id}/vendors`,
      (docs) => { setVendors(docs); setLoading(false); },
      orderBy('name', 'asc')
    );
    return unsub;
  }, [building.id]);

  const filtered = search.trim()
    ? vendors.filter((v) => {
        const q = search.toLowerCase();
        return (
          v.name.toLowerCase().includes(q) ||
          (v.aliases ?? []).some((a) => a.toLowerCase().includes(q))
        );
      })
    : vendors;

  const unverifiedCount = vendors.filter((v) => v.status !== 'verified').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Vendors</h2>
          {unverifiedCount > 0 && (
            <p className="text-sm text-amber-600 mt-0.5">
              {unverifiedCount} unverified vendor{unverifiedCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vendors or aliases..."
          className="rounded-md border border-gray-300 px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg text-gray-400">
          {search ? 'No vendors match your search.' : 'No vendors yet. They are created when you log expenses.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Spend</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Transactions</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Used</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filtered.map((v) => (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{v.name}</div>
                    {v.aliases?.length > 0 && (
                      <div className="text-xs text-gray-400 mt-0.5">{v.aliases.join(', ')}</div>
                    )}
                    {v.notes && (
                      <div className="text-xs text-gray-400 italic mt-0.5 truncate max-w-xs">{v.notes}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${
                      v.status === 'verified'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {v.status ?? 'unverified'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(v.totalSpend ?? 0)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{v.transactionCount ?? 0}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(v.lastUsedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {v.status !== 'verified' && (
                        <button
                          onClick={() => updateDocument(`buildings/${building.id}/vendors/${v.id}`, { status: 'verified' })}
                          className="text-xs text-green-600 hover:text-green-800 hover:underline"
                        >
                          Verify
                        </button>
                      )}
                      <button
                        onClick={() => setEditModal(v)}
                        className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <VendorEditModal
        isOpen={editModal !== null}
        onClose={() => setEditModal(null)}
        vendor={editModal}
        building={building}
      />
    </div>
  );
}

function VendorEditModal({ isOpen, onClose, vendor, building }) {
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState([]);
  const [aliasInput, setAliasInput] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('unverified');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const aliasRef = useRef(null);

  useEffect(() => {
    if (isOpen && vendor) {
      setName(vendor.name ?? '');
      setAliases(vendor.aliases ?? []);
      setNotes(vendor.notes ?? '');
      setStatus(vendor.status ?? 'unverified');
      setAliasInput('');
      setError('');
    }
  }, [isOpen, vendor]);

  function addAlias() {
    const val = aliasInput.trim();
    if (!val || aliases.includes(val)) { setAliasInput(''); return; }
    setAliases((prev) => [...prev, val]);
    setAliasInput('');
    aliasRef.current?.focus();
  }

  function removeAlias(alias) {
    setAliases((prev) => prev.filter((a) => a !== alias));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Name is required.');
    setSaving(true);
    setError('');
    try {
      await updateDocument(`buildings/${building.id}/vendors/${vendor.id}`, {
        name: name.trim(),
        aliases,
        notes: notes.trim(),
        status,
      });
      onClose();
    } catch (err) {
      console.error(err);
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!vendor) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Vendor" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          id="vendorName"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        {/* Aliases */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Aliases
            <span className="ml-1 text-xs font-normal text-gray-400">(alternate names for typeahead matching)</span>
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {aliases.map((a) => (
              <span key={a} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">
                {a}
                <button
                  type="button"
                  onClick={() => removeAlias(a)}
                  className="text-gray-400 hover:text-gray-600 leading-none"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              ref={aliasRef}
              type="text"
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); } }}
              placeholder="Type alias and press Enter"
              className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button type="button" variant="secondary" size="sm" onClick={addAlias}>Add</Button>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Internal notes about this vendor..."
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <div className="flex gap-3">
            {['unverified', 'verified'].map((s) => (
              <label key={s} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="vendorStatus"
                  value={s}
                  checked={status === s}
                  onChange={() => setStatus(s)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className={`text-sm capitalize ${s === 'verified' ? 'text-green-700' : 'text-amber-700'}`}>
                  {s}
                </span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
