import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export { serverTimestamp, Timestamp, query, where, orderBy, onSnapshot, collection, doc };

// Generic document helpers

export async function getDocument(path) {
  const snap = await getDoc(doc(db, path));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function setDocument(path, data) {
  await setDoc(doc(db, path), data);
}

export async function addDocument(collectionPath, data) {
  const ref = await addDoc(collection(db, collectionPath), data);
  return ref.id;
}

export async function updateDocument(path, data) {
  await updateDoc(doc(db, path), data);
}

export async function deleteDocument(path) {
  await deleteDoc(doc(db, path));
}

export async function getCollection(collectionPath, ...queryConstraints) {
  const q = queryConstraints.length
    ? query(collection(db, collectionPath), ...queryConstraints)
    : collection(db, collectionPath);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function subscribeToCollection(collectionPath, callback, ...queryConstraints) {
  const q = queryConstraints.length
    ? query(collection(db, collectionPath), ...queryConstraints)
    : collection(db, collectionPath);
  return onSnapshot(q, (snap) => {
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(docs);
  });
}

export function subscribeToDocument(path, callback) {
  return onSnapshot(doc(db, path), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export function getBatch() {
  return writeBatch(db);
}

export function batchSet(batch, path, data) {
  batch.set(doc(db, path), data);
}

export function batchUpdate(batch, path, data) {
  batch.update(doc(db, path), data);
}

export function getDocRef(path) {
  return doc(db, path);
}

export function getCollectionRef(path) {
  return collection(db, path);
}

export function newDocId(collectionPath) {
  return doc(collection(db, collectionPath)).id;
}
