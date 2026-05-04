import { useState, useEffect } from 'react';
import { subscribeToCollection, orderBy } from '../../lib/firestore';
import { formatCurrency, formatDate } from '../../lib/format';

export default function VendorList({ building }) {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const unsub = subscribeToCollection(
      `buildings/${building.id}/vendors`,
      (docs) => { setVendors(docs); setLoading(false); },
      orderBy('name', 'asc')
    );
    return unsub;
  }, [building.id]);

  const filtered = search.trim()
    ? vendors.filter((v) => v.name.toLowerCase().includes(search.toLowerCase()))
    : vendors;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Vendors</h2>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vendors..."
          className="rounded-md border border-gray-300 px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filtered.map((v) => (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{v.name}</div>
                    {v.aliases?.length > 0 && (
                      <div className="text-xs text-gray-400">{v.aliases.join(', ')}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${
                        v.status === 'verified'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {v.status ?? 'unverified'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(v.totalSpend ?? 0)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{v.transactionCount ?? 0}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(v.lastUsedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
