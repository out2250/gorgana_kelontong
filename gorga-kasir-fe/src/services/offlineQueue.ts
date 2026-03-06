import { openDB } from "idb";

export type QueueItem = {
  id: string;
  endpoint: "/sync/sales" | "/sales";
  payload: Record<string, unknown>;
  createdAt: string;
  syncedAt?: string;
  retryCount?: number;
  nextRetryAt?: string;
  lastError?: string;
};

async function getDb() {
  return openDB("klontong-digital", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("outbox")) {
        db.createObjectStore("outbox", { keyPath: "id" });
      }
    }
  });
}

export async function enqueue(item: QueueItem) {
  const db = await getDb();
  await db.put("outbox", item);
}

export async function listUnSynced() {
  const db = await getDb();
  const all = (await db.getAll("outbox")) as QueueItem[];
  return all.filter((item) => !item.syncedAt);
}

export async function listReadyToSync(referenceTime = new Date()) {
  const unSynced = await listUnSynced();
  const now = referenceTime.getTime();
  return unSynced.filter((item) => {
    if (!item.nextRetryAt) {
      return true;
    }

    const retryAt = new Date(item.nextRetryAt).getTime();
    return !Number.isNaN(retryAt) && retryAt <= now;
  });
}

export async function markSynced(id: string) {
  const db = await getDb();
  const existing = (await db.get("outbox", id)) as QueueItem | undefined;
  if (!existing) {
    return;
  }

  await db.put("outbox", {
    ...existing,
    syncedAt: new Date().toISOString(),
    retryCount: 0,
    nextRetryAt: undefined,
    lastError: undefined
  });
}

export async function markFailed(id: string, errorMessage: string) {
  const db = await getDb();
  const existing = (await db.get("outbox", id)) as QueueItem | undefined;
  if (!existing) {
    return;
  }

  const retryCount = (existing.retryCount ?? 0) + 1;
  const backoffMinutes = Math.min(2 ** (retryCount - 1), 30);
  const nextRetryAt = new Date(Date.now() + backoffMinutes * 60_000).toISOString();

  await db.put("outbox", {
    ...existing,
    retryCount,
    nextRetryAt,
    lastError: errorMessage
  });
}

export async function pruneSynced(keepLatest = 200) {
  const db = await getDb();
  const all = (await db.getAll("outbox")) as QueueItem[];
  const synced = all
    .filter((item) => Boolean(item.syncedAt))
    .sort((a, b) => new Date(b.syncedAt as string).getTime() - new Date(a.syncedAt as string).getTime());

  const toDelete = synced.slice(keepLatest);
  await Promise.all(toDelete.map((item) => db.delete("outbox", item.id)));
}
