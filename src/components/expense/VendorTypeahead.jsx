import { useState, useEffect, useRef } from 'react';

export default function VendorTypeahead({ vendors, value, onChange, onCreateNew }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Sync display when value is set externally (e.g. editing an existing
  // transaction). Never clear the input here — handleInputChange briefly
  // sets value=null on every keystroke, and clearing would wipe the text
  // the user just typed before the parent's next render lands.
  useEffect(() => {
    if (!value) return;
    const v = vendors.find((vv) => vv.id === value);
    if (v) setQuery(v.name);
  }, [value, vendors]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = query.trim()
    ? vendors.filter((v) => {
        const q = query.toLowerCase();
        return (
          v.name.toLowerCase().includes(q) ||
          (v.aliases ?? []).some((a) => a.toLowerCase().includes(q))
        );
      })
    : vendors.slice(0, 8);

  function handleSelect(vendor) {
    onChange(vendor.id);
    setQuery(vendor.name);
    setOpen(false);
  }

  function handleInputChange(e) {
    setQuery(e.target.value);
    onChange(null);
    setOpen(true);
  }

  const showCreate = query.trim() && !vendors.some((v) => {
    const q = query.trim().toLowerCase();
    return v.name.toLowerCase() === q ||
      (v.aliases ?? []).some((a) => a.toLowerCase() === q);
  });

  return (
    <div className="relative" ref={ref}>
      <label className="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
      <input
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        placeholder="Search or create vendor..."
        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => handleSelect(v)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between"
            >
              <span>{v.name}</span>
              <span className="flex items-center gap-2">
                {v.scope === 'department' && (
                  <span className="text-[10px] uppercase tracking-wide text-blue-500 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                    shared
                  </span>
                )}
                {v.status === 'unverified' && (
                  <span className="text-xs text-amber-500">unverified</span>
                )}
              </span>
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              onClick={() => { onCreateNew(query.trim()); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 border-t border-gray-100"
            >
              + Create "{query.trim()}"
            </button>
          )}
          {filtered.length === 0 && !showCreate && (
            <p className="px-3 py-2 text-sm text-gray-400">No vendors found.</p>
          )}
        </div>
      )}
    </div>
  );
}
