<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";

import LoadingButton from "@/components/LoadingButton.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import PageHeader from "@/components/PageHeader.vue";
import {
  createAbsentCorrection,
  decideAbsentCorrection,
  getAbsentCorrections,
  type AbsentCorrectionDto
} from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";
import { useAuthStore } from "@/store/auth";

import UserManagementSubmenu from "./UserManagementSubmenu.vue";

const auth = useAuthStore();
const toast = useToast();

const isApprover = computed(() => Boolean(auth.user?.isSuperAdmin || auth.user?.role === "owner" || auth.user?.role === "manager"));
const loading = ref(false);
const submitting = ref(false);
const processingId = ref("");
const error = ref("");
const items = ref<AbsentCorrectionDto[]>([]);

const form = reactive({
  date: "",
  requestedClockIn: "",
  requestedClockOut: "",
  reason: ""
});

async function loadData() {
  loading.value = true;
  error.value = "";
  try {
    const result = await getAbsentCorrections();
    items.value = result.items;
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat absent corrections");
    toast.error(error.value);
  } finally {
    loading.value = false;
  }
}

async function submitCorrection() {
  if (!form.date || !form.reason.trim()) {
    toast.warning("Tanggal dan alasan wajib diisi");
    return;
  }

  if (!form.requestedClockIn && !form.requestedClockOut) {
    toast.warning("Isi jam masuk atau jam pulang yang dikoreksi");
    return;
  }

  submitting.value = true;
  try {
    await createAbsentCorrection({
      date: form.date,
      requestedClockIn: form.requestedClockIn || undefined,
      requestedClockOut: form.requestedClockOut || undefined,
      reason: form.reason.trim()
    });
    toast.success("Koreksi absensi diajukan");
    form.reason = "";
    form.requestedClockIn = "";
    form.requestedClockOut = "";
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal mengajukan koreksi");
    toast.error(error.value);
  } finally {
    submitting.value = false;
  }
}

async function decide(id: string, decision: "approved" | "rejected") {
  processingId.value = id;
  try {
    await decideAbsentCorrection(id, { decision });
    toast.success(`Correction ${decision}`);
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal proses correction");
    toast.error(error.value);
  } finally {
    processingId.value = "";
  }
}

onMounted(() => {
  void loadData();
});
</script>

<template>
  <section>
    <PageHeader title="Absent Corrections" subtitle="Approval koreksi absensi dan history." />
    <UserManagementSubmenu />

    <form class="mt-4 grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-4" @submit.prevent="submitCorrection">
      <input v-model="form.date" type="date" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
      <input v-model="form.requestedClockIn" type="time" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Jam masuk" />
      <input v-model="form.requestedClockOut" type="time" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Jam pulang" />
      <LoadingButton
        :loading="submitting"
        loading-text="Mengajukan..."
        class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        type="submit"
      >
        Ajukan Koreksi
      </LoadingButton>
      <textarea
        v-model="form.reason"
        rows="2"
        class="md:col-span-4 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        placeholder="Alasan koreksi"
      />
    </form>

    <PageErrorAlert :message="error" class="mt-3" />

    <div class="mt-4 overflow-x-auto rounded-xl border border-slate-200">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50 text-left text-slate-600">
          <tr>
            <th class="px-4 py-3">User</th>
            <th class="px-4 py-3">Tanggal</th>
            <th class="px-4 py-3">Request</th>
            <th class="px-4 py-3">Alasan</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white">
          <tr v-for="item in items" :key="item.id">
            <td class="px-4 py-3">{{ item.userName }}</td>
            <td class="px-4 py-3">{{ item.date }}</td>
            <td class="px-4 py-3">in: {{ item.requestedClockIn || '-' }} / out: {{ item.requestedClockOut || '-' }}</td>
            <td class="px-4 py-3">{{ item.reason }}</td>
            <td class="px-4 py-3">{{ item.status }}</td>
            <td class="px-4 py-3">
              <div class="flex gap-2" v-if="isApprover && item.status === 'pending'">
                <button
                  :disabled="processingId === item.id"
                  class="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 disabled:opacity-50"
                  @click="decide(item.id, 'approved')"
                >
                  Approve
                </button>
                <button
                  :disabled="processingId === item.id"
                  class="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 disabled:opacity-50"
                  @click="decide(item.id, 'rejected')"
                >
                  Reject
                </button>
              </div>
              <span v-else>-</span>
            </td>
          </tr>
          <tr v-if="!loading && items.length === 0">
            <td colspan="6" class="px-4 py-6 text-center text-slate-500">Belum ada data correction</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
