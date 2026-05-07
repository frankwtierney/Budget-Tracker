import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { storage } from './firebase';

/**
 * Upload a receipt file for a transaction.
 * @param {string} buildingId
 * @param {string} transactionId
 * @param {File} file
 * @param {(pct: number) => void} onProgress  - called with 0–100
 * @returns {Promise<string>} download URL
 */
export function uploadReceipt(buildingId, transactionId, file, onProgress) {
  const ext = file.name.split('.').pop();
  const path = `buildings/${buildingId}/receipts/${transactionId}/receipt.${ext}`;
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, file, {
    contentType: file.type,
  });

  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        onProgress?.(pct);
      },
      reject,
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      }
    );
  });
}

/**
 * Delete a receipt for a transaction (best-effort; ignores not-found).
 */
export async function deleteReceipt(buildingId, transactionId, filename) {
  try {
    const path = `buildings/${buildingId}/receipts/${transactionId}/${filename}`;
    await deleteObject(ref(storage, path));
  } catch (err) {
    if (err.code !== 'storage/object-not-found') throw err;
  }
}
