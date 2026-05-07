import { useState, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getBatch,
  batchSet,
  newDocId,
  serverTimestamp,
} from '../../lib/firestore';
import { toTimestamp, formatCurrency } from '../../lib/format';

// ─── CSV parsing ────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const result = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = [];
    let inQuote = false;
    let cell = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cell += '"'; i++; }
        else { inQuote = !inQuote; }
      } else if (ch === ',' && !inQuote) {
        cells.push(cell.trim());
        cell = '';
      } else {
        cell += ch;
      }
    }
    cells.push(cell.trim());
    result.push(cells);
  }
  return result;
}

// ─── Column mapping config ───────────────────────────────────────────────────

const FIELD_OPTIONS = [
  { value: '', label: '— skip —' },
  { value: 'receiptDate', label: 'Receipt Date *' },
  { value: 'vendorName', label: 'Vendor Name *' },
  { value: 'cost', label: 'Cost *' },
  { value: 'description', label: 'Description' },
  { value: 'categoryName', label: 'Category Name' },
  { value: 'subCategoryName', label: 'Sub-Category Name' },
  { value: 'notes', label: 'Notes' },
];

const REQUIRED_FIELDS = ['receiptDate', 'vendorName', 'cost'];

function guessMapping(headers) {
  const mapping = {};
  const lower = headers.map((h) => h.toLowerCase());
  const tryMatch = (field, patterns) => {
    const idx = lower.findIndex((h) => patterns.some((p) => h.includes(p)));
    if (idx >= 0 && !Object.values(mapping).includes(field)) mapping[idx] = field;
  };
  tryMatch('receiptDate', ['date', 'receipt']);
  tryMatch('vendorName', ['vendor', 'payee', 'merchant', 'supplier']);
  tryMatch('cost', ['cost', 'amount', 'total', 'price', 'sum']);
  tryMatch('description', ['description', 'desc', 'memo', 'detail', 'note']);
  tryMatch('categoryName', ['category', 'cat']);
  tryMatch('subCategoryName', ['sub', 'subcategory']);
  tryMatch('notes', ['notes', 'comment']);
  return mapping;
}

// ─── Row validation ──────────────────────────────────────────────────────────

function validateRow(mapped, fiscalYear) {
  const errors = [];
  if (!mapped.receiptDate) errors.push('Missing date');
  else {
    const d = new Date(mapped.receiptDate);
    if (isNaN(d)) errors.push('Invalid date');
    else if (fiscalYear) {
      const fyStart = fiscalYear.startDate?.toDate?.()?.getTime() ?? 0;
      const fyEnd = fiscalYear.endDate?.toDate?.()?.getTime() ?? Infinity;
      if (d.getTime() < fyStart || d.getTime() > fyEnd) errors.push('Date outside fiscal year');
    }
  }
  if (!mapped.vendorName) errors.push('Missing vendor');
  const cost = parseFloat(mapped.cost);
  if (!mapped.cost) errors.push('Missing cost');
  else if (isNaN(cost) || cost <= 0) errors.push('Invalid cost');
  return errors;
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function CsvImport({ building, fiscalYear, categories, existingVendors }) {
  const { user } = useAuth();

  const [step, setStep] = useState('upload'); // upload | map | preview | done
  const [rows, setRows] = useState([]);        // all rows (first is header)
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});  // colIndex → field
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  // ── Upload step ────────────────────────────────────────────────────────────

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseCSV(e.target.result);
      if (parsed.length < 2) return;
      const hdrs = parsed[0];
      setHeaders(hdrs);
      setRows(parsed.slice(1));
      setMapping(guessMapping(hdrs));
      setStep('map');
    };
    reader.readAsText(file);
  }

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.csv')) handleFile(file);
  }, []);

  // ── Preview step ───────────────────────────────────────────────────────────

  function mappedRows() {
    return rows.map((row) => {
      const obj = {};
      Object.entries(mapping).forEach(([colIdx, field]) => {
        if (field) obj[field] = row[Number(colIdx)] ?? '';
      });
      return obj;
    });
  }

  const mapped = mappedRows();
  const validated = mapped.map((r) => ({ ...r, _errors: validateRow(r, fiscalYear) }));
  const validCount = validated.filter((r) => r._errors.length === 0).length;
  const errorCount = validated.length - validCount;

  // ── Import ─────────────────────────────────────────────────────────────────

  async function handleImport() {
    setImporting(true);
    try {
      // Build vendor name → id map; create new vendors as needed
      const vendorMap = Object.fromEntries(
        existingVendors.map((v) => [v.name.toLowerCase(), v.id])
      );
      const newVendorIds = {};

      // Collect vendor names that need creating
      const uniqueNewVendors = [
        ...new Set(
          validated
            .filter((r) => r._errors.length === 0)
            .map((r) => r.vendorName.trim())
            .filter((n) => !vendorMap[n.toLowerCase()])
        ),
      ];

      // Create new vendors in batches of 500
      const vendorBatch = getBatch();
      for (const name of uniqueNewVendors) {
        const id = newDocId(`buildings/${building.id}/vendors`);
        batchSet(vendorBatch, `buildings/${building.id}/vendors/${id}`, {
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
        newVendorIds[name.toLowerCase()] = id;
      }
      if (uniqueNewVendors.length > 0) await vendorBatch.commit();

      // Build category/sub lookup
      const catMap = {};
      for (const cat of categories) {
        catMap[cat.name.toLowerCase()] = cat;
        for (const sub of cat.subCategories ?? []) {
          if (!catMap[`${cat.name.toLowerCase()}/${sub.name.toLowerCase()}`]) {
            catMap[`${cat.name.toLowerCase()}/${sub.name.toLowerCase()}`] = { catId: cat.id, subId: sub.id };
          }
        }
      }

      // Batch-write transactions (max 500 per batch)
      const validRows = validated.filter((r) => r._errors.length === 0);
      let batch = getBatch();
      let batchCount = 0;
      let imported = 0;

      for (const row of validRows) {
        const vendorName = row.vendorName.trim();
        const vendorId =
          vendorMap[vendorName.toLowerCase()] ??
          newVendorIds[vendorName.toLowerCase()];

        const cost = parseFloat(row.cost);
        const receiptDate = toTimestamp(new Date(row.receiptDate));

        // Category resolution
        let categoryId = null;
        let subCategoryId = null;
        if (row.categoryName && row.subCategoryName) {
          const key = `${row.categoryName.trim().toLowerCase()}/${row.subCategoryName.trim().toLowerCase()}`;
          const match = catMap[key];
          if (match) { categoryId = match.catId; subCategoryId = match.subId; }
        } else if (row.categoryName) {
          const cat = catMap[row.categoryName.trim().toLowerCase()];
          if (cat?.id) categoryId = cat.id;
        }

        const txId = newDocId(`buildings/${building.id}/transactions`);
        batchSet(batch, `buildings/${building.id}/transactions/${txId}`, {
          fiscalYearId: fiscalYear.id,
          receiptDate,
          transactionDate: receiptDate,
          recordedBy: user.uid,
          vendorId,
          description: (row.description ?? '').trim(),
          categoryId,
          subCategoryId,
          cost,
          staffAllocations: [],
          eventId: null,
          reconciliationStatus: 'open',
          reconciliationCycleId: null,
          receiptUrl: null,
          notes: (row.notes ?? '').trim(),
          subGroupingTag: null,
          createdAt: serverTimestamp(),
          lastEditedAt: serverTimestamp(),
          lastEditedBy: user.uid,
          voidedAt: null,
          voidReason: null,
          linkedTransactionId: null,
          importedFromCSV: true,
        });

        batchCount++;
        imported++;

        if (batchCount === 490) {
          await batch.commit();
          batch = getBatch();
          batchCount = 0;
        }
      }

      if (batchCount > 0) await batch.commit();

      setImportResult({
        imported,
        skipped: errorCount,
        newVendors: uniqueNewVendors.length,
      });
      setStep('done');
    } catch (err) {
      console.error(err);
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setStep('upload');
    setRows([]);
    setHeaders([]);
    setMapping({});
    setImportResult(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (step === 'done') {
    return (
      <div className="max-w-lg space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Import Complete</h3>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-1">
          <p className="text-green-800 font-medium">
            {importResult.imported} transaction{importResult.imported !== 1 ? 's' : ''} imported
          </p>
          {importResult.newVendors > 0 && (
            <p className="text-green-700 text-sm">
              {importResult.newVendors} new vendor{importResult.newVendors !== 1 ? 's' : ''} created (unverified)
            </p>
          )}
          {importResult.skipped > 0 && (
            <p className="text-amber-700 text-sm">
              {importResult.skipped} row{importResult.skipped !== 1 ? 's' : ''} skipped due to errors
            </p>
          )}
        </div>
        <button
          onClick={reset}
          className="text-sm text-blue-600 hover:underline"
        >
          Import another file
        </button>
      </div>
    );
  }

  if (step === 'upload') {
    return (
      <div className="max-w-lg space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Import Transactions from CSV</h3>
          <p className="text-sm text-gray-500 mt-1">
            Upload a CSV file with transaction data. You'll map columns before importing.
          </p>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400 bg-white'
          }`}
        >
          <UploadIcon className="w-10 h-10 mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-600">Drop a CSV file here</p>
          <p className="text-xs text-gray-400 mt-1">or click to browse</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-600">Expected columns (any order, any header name):</p>
          <p>Date, Vendor, Cost/Amount — required</p>
          <p>Description, Category, Sub-Category, Notes — optional</p>
        </div>
      </div>
    );
  }

  if (step === 'map') {
    const missingFields = REQUIRED_FIELDS.filter(
      (f) => !Object.values(mapping).includes(f)
    );

    return (
      <div className="max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Map Columns</h3>
            <p className="text-sm text-gray-500">{rows.length} rows · {headers.length} columns</p>
          </div>
          <button onClick={reset} className="text-sm text-gray-400 hover:text-gray-600">← Start over</button>
        </div>

        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-1/3">CSV Column</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-1/3">Maps to</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sample</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {headers.map((header, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 font-medium text-gray-700">{header || `Column ${i + 1}`}</td>
                  <td className="px-4 py-2">
                    <select
                      value={mapping[i] ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMapping((prev) => {
                          const next = { ...prev };
                          // Clear any other column mapped to same field
                          Object.keys(next).forEach((k) => { if (next[k] === val && val) delete next[k]; });
                          if (val) next[i] = val; else delete next[i];
                          return next;
                        });
                      }}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                    >
                      {FIELD_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2 text-gray-400 truncate max-w-xs text-xs">
                    {rows[0]?.[i] ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {missingFields.length > 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Required fields not mapped: {missingFields.join(', ')}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Cancel</button>
          <button
            onClick={() => setStep('preview')}
            disabled={missingFields.length > 0}
            className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Preview →
          </button>
        </div>
      </div>
    );
  }

  // preview step
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Preview</h3>
          <p className="text-sm text-gray-500">
            <span className="text-green-700 font-medium">{validCount} valid</span>
            {errorCount > 0 && (
              <span className="text-red-600 font-medium ml-2">{errorCount} with errors (will be skipped)</span>
            )}
          </p>
        </div>
        <button onClick={() => setStep('map')} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-96 overflow-y-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase"></th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-48">Issues</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {validated.map((row, i) => {
              const hasErrors = row._errors.length > 0;
              const catLabel = [row.categoryName, row.subCategoryName].filter(Boolean).join(' / ');
              return (
                <tr key={i} className={hasErrors ? 'bg-red-50' : 'hover:bg-gray-50'}>
                  <td className="px-3 py-2">
                    {hasErrors
                      ? <span className="text-red-400">✗</span>
                      : <span className="text-green-500">✓</span>
                    }
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.receiptDate}</td>
                  <td className="px-3 py-2 text-gray-700">{row.vendorName}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{catLabel || '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-700">
                    {!isNaN(parseFloat(row.cost)) ? formatCurrency(parseFloat(row.cost)) : row.cost}
                  </td>
                  <td className="px-3 py-2 text-gray-500 truncate max-w-xs">{row.description || '—'}</td>
                  <td className="px-3 py-2">
                    {hasErrors && (
                      <span className="text-xs text-red-600">{row._errors.join('; ')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {validCount === 0 ? (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          No valid rows to import. Fix the errors and re-upload.
        </p>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Will create {validCount} transaction{validCount !== 1 ? 's' : ''}
            {errorCount > 0 && ` (skipping ${errorCount} invalid)`}
          </p>
          <div className="flex gap-2">
            <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Cancel</button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {importing && (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              Import {validCount} Transactions
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function UploadIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}
