// src/lib/firestoreData.js
// Firestore helpers for bulk data operations (reset / delete).
// Batches are capped at 500 writes, so everything is chunked.

import { collection, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../firebase";

// Sub-collections that hold an account's user-visible data.
export const ACCOUNT_DATA_COLLECTIONS = ["trades", "journal", "notes", "challenges", "backtests"];

export async function deleteDocuments(refs) {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

export async function deleteCollectionDocs(collectionRef) {
  const snap = await getDocs(collectionRef);
  await deleteDocuments(snap.docs.map((d) => d.ref));
  return snap.size;
}

/**
 * Delete every trade, journal entry, note, challenge and backtest in one account.
 * A collection that is missing, or that the security rules don't cover, is skipped
 * instead of aborting the whole reset.
 */
export async function clearAccountData(uid, accountId) {
  let deleted = 0;
  const skipped = [];

  for (const name of ACCOUNT_DATA_COLLECTIONS) {
    try {
      deleted += await deleteCollectionDocs(
        collection(db, "users", uid, "accounts", accountId, name)
      );
    } catch (err) {
      console.warn(`Could not clear ${name}:`, err?.message || err);
      skipped.push(name);
    }
  }

  return { deleted, skipped };
}

/** Same, across every account the user owns. */
export async function clearAllUserData(uid) {
  const accountsSnap = await getDocs(collection(db, "users", uid, "accounts"));
  let deleted = 0;
  const skipped = new Set();

  for (const accountDoc of accountsSnap.docs) {
    const result = await clearAccountData(uid, accountDoc.id);
    deleted += result.deleted;
    result.skipped.forEach((name) => skipped.add(name));
  }

  return { deleted, accounts: accountsSnap.size, skipped: [...skipped] };
}
