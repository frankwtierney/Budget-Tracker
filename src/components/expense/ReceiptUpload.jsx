import { useState, useRef } from 'react';
import { uploadReceipt } from '../../lib/storage';
import { updateDocument } from '../../lib/firestore';

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/heic,application/pdf';

function isImage(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('.jpg') ||
    lower.includes('.jpeg') ||
    lower.includes('.png') ||
    lower.includes('.webp') ||
    lower.includes('.heic')
  );
}

/**
 * Props:
 *   buildingId      string
 *   transactionId   string
 *   receiptUrl      string | null   – current stored URL
 *   onUploaded      (url: string) => void   – called after successful upload + Firestore update
 *   compact         boolean   – smaller inline variant for use in table rows
 */
export default function ReceiptUpload({ buildingId, transactionId, receiptUrl, onUploaded, compact = false }) {
  const [progress, setProgress] = useState(null); // null | 0–100
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError('File must be under 20 MB.');
      return;
    }
    setError('');
    setProgress(0);
    try {
      const url = await uploadReceipt(buildingId, transactionId, file, setProgress);
      await updateDocument(`buildings/${buildingId}/transactions/${transactionId}`, {
        receiptUrl: url,
      });
      onUploaded?.(url);
    } catch (err) {
      console.error(err);
      setError('Upload failed. Check your connection and try again.');
    } finally {
      setProgress(null);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  // ── Compact variant (used inline in table rows) ────────────────────────────
  if (compact) {
    if (progress !== null) {
      return (
        <div className="flex items-center gap-1.5 min-w-[80px]">
          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-gray-400">{progress}%</span>
        </div>
      );
    }

    if (receiptUrl) {
      return (
        <div className="flex items-center gap-1.5">
          <a
            href={receiptUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            <PaperclipIcon className="w-3 h-3" />
            Receipt
          </a>
          <button
            onClick={() => inputRef.current?.click()}
            className="text-xs text-gray-400 hover:text-gray-600"
            title="Replace receipt"
          >
            ↺
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
        </div>
      );
    }

    return (
      <div>
        <button
          onClick={() => inputRef.current?.click()}
          className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 transition-colors"
        >
          <PaperclipIcon className="w-3 h-3" />
          Attach
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
        {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
      </div>
    );
  }

  // ── Full variant (used in EditExpenseModal) ────────────────────────────────
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">Receipt</label>

      {/* Current receipt preview */}
      {receiptUrl && progress === null && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {isImage(receiptUrl) ? (
            <a href={receiptUrl} target="_blank" rel="noreferrer">
              <img
                src={receiptUrl}
                alt="Receipt"
                className="max-h-48 w-full object-contain bg-gray-50"
              />
            </a>
          ) : (
            <a
              href={receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
            >
              <PdfIcon className="w-8 h-8 text-red-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-700">View Receipt (PDF)</p>
                <p className="text-xs text-gray-400">Opens in new tab</p>
              </div>
            </a>
          )}
        </div>
      )}

      {/* Upload area */}
      {progress !== null ? (
        <div className="border border-gray-200 rounded-lg p-4 space-y-2">
          <p className="text-sm text-gray-600">Uploading…</p>
          <div className="bg-gray-100 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 text-right">{progress}%</p>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300 bg-gray-50'
          }`}
        >
          <PaperclipIcon className="w-6 h-6 mx-auto text-gray-300 mb-1.5" />
          <p className="text-sm text-gray-500">
            {receiptUrl ? 'Drop a file to replace receipt' : 'Drop receipt here'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, HEIC, or PDF · max 20 MB</p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}

function PaperclipIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
    </svg>
  );
}

function PdfIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}
