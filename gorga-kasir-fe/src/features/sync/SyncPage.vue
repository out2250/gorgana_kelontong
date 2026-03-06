<script setup lang="ts">
import { onMounted, ref } from "vue";

import LoadingButton from "@/components/LoadingButton.vue";
import { postSyncSale } from "@/services/api";
import { getErrorMessage } from "@/services/error";
import {
  enqueue,
  listReadyToSync,
  listUnSynced,
  markFailed,
  markSynced,
  pruneSynced,
  type QueueItem
} from "@/services/offlineQueue";
import { useAuthStore } from "@/store/auth";

const auth = useAuthStore();
const queue = ref<QueueItem[]>([]);
const status = ref("idle");
const syncing = ref(false);
const isOnline = ref(typeof navigator !== "undefined" ? navigator.onLine : false);

const MOCK_STORE_ID = "00000000-0000-0000-0000-000000000001";
const MOCK_PRODUCT_ID = "00000000-0000-0000-0000-000000000010";

async function refreshQueue() {
  queue.value = await listUnSynced();
}

async function queueMockTransaction() {
  await enqueue({
    id: crypto.randomUUID(),
    endpoint: "/sync/sales",
    createdAt: new Date().toISOString(),
    payload: {
      idempotencyKey: crypto.randomUUID(),
      storeId: MOCK_STORE_ID,
      paymentMethod: "cash",
      soldAt: new Date().toISOString(),
      discount: 0,
      items: [
        {
          productId: MOCK_PRODUCT_ID,
          quantity: 1,
          unitPrice: 5000
        }
      ]
    }
  });

  status.value = "1 transaksi dimasukkan ke queue lokal";
  await refreshQueue();
}

async function syncNow() {
  if (!auth.accessToken) {
    status.value = "Login dulu untuk sync";
    return;
  }

  syncing.value = true;
  status.value = "syncing...";

  try {
    const currentQueue = await listReadyToSync();

    for (const item of currentQueue) {
      try {
        await postSyncSale(item.payload);
        await markSynced(item.id);
      } catch (error) {
        await markFailed(item.id, getErrorMessage(error, "sync gagal"));
      }
    }

    await pruneSynced();
    await refreshQueue();
    status.value = "sync selesai";
  } catch (error) {
    status.value = getErrorMessage(error, "sync gagal");
  } finally {
    syncing.value = false;
  }
}

onMounted(async () => {
  await refreshQueue();

  window.addEventListener("online", () => {
    isOnline.value = true;
    void syncNow();
  });

  window.addEventListener("offline", () => {
    isOnline.value = false;
  });

  if ("serviceWorker" in navigator) {
    await navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }
});
</script>

<template>
  <section>
    <h1 class="text-xl font-semibold text-slate-900">Offline Sync</h1>
    <p class="mt-1 text-sm text-slate-500">Transaksi disimpan lokal saat offline dan dikirim ke backend saat online.</p>

    <div class="mt-4 flex flex-wrap gap-2">
      <button class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white" @click="queueMockTransaction">
        Buat Transaksi Lokal
      </button>
      <LoadingButton
        :loading="syncing"
        loading-text="Sync..."
        class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
        @click="syncNow"
      >
        Sync Sekarang
      </LoadingButton>
    </div>

    <div class="mt-4 card">
      <div class="grid gap-2 text-sm text-slate-700">
        <p>Queue aktif: {{ queue.length }}</p>
        <p>Status: {{ status }}</p>
        <p>Online: {{ isOnline ? "true" : "false" }}</p>
      </div>
    </div>
  </section>
</template>
