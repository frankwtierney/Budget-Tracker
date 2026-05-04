export default function CategorySelect({ categories, categoryId, subCategoryId, onCategoryChange, onSubCategoryChange }) {
  const selectedCategory = categories.find((c) => c.id === categoryId);
  const subs = selectedCategory?.subCategories ?? [];

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
        <select
          value={categoryId ?? ''}
          onChange={(e) => { onCategoryChange(e.target.value || null); onSubCategoryChange(null); }}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        >
          <option value="">Select category...</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Sub-category *</label>
        <select
          value={subCategoryId ?? ''}
          onChange={(e) => onSubCategoryChange(e.target.value || null)}
          disabled={!categoryId}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
          required
        >
          <option value="">Select sub-category...</option>
          {subs
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
        </select>
      </div>
    </div>
  );
}
