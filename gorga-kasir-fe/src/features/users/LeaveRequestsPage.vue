<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";

import LoadingButton from "@/components/LoadingButton.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import PageHeader from "@/components/PageHeader.vue";
import { createLeaveRequest, getMyLeaveRequests, type LeaveRequestDto } from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";

import UserManagementSubmenu from "./UserManagementSubmenu.vue";

const toast = useToast();
const loading = ref(false);
const submitting = ref(false);
const error = ref("");
const items = ref<LeaveRequestDto[]>([]);

const form = reactive({
  type: "leave" as "leave" | "sick",
  startDate: "",
  endDate: "",
  reason: ""
});

async function loadData() {
  loading.value = true;
  error.value = "";
  try {
    const result = await getMyLeaveRequests();
    items.value = result.items;
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat leave requests");
    toast.error(error.value);
  } finally {
    loading.value = false;
  }
}

async function submitRequest() {
  if (!form.startDate || !form.endDate || !form.reason.trim()) {
    toast.warning("Tanggal dan alasan wajib diisi");
    return;
  }

  submitting.value = true;
  try {
    await createLeaveRequest({
      type: form.type,
      startDate: form.startDate,
      endDate: form.endDate,
      reason: form.reason.trim()
    });
    toast.success("Request berhasil diajukan");
    form.reason = "";
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal submit request");
    toast.error(error.value);
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void loadData();
});
</script>

<template>
  <section>
    <PageHeader title="Leave Requests" subtitle="Pengajuan cuti/sakit oleh bawahan beserta history." />
    <UserManagementSubmenu />

    <form class="mt-4 grid gap-2 rounded-xl border border-slate-200 p-3 md:grid-cols-4" @submit.prevent="submitRequest">
      <select v-model="form.type" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="leave">Leave</option>
        <option value="sick">Sick</option>
      </select>
      <input v-model="form.startDate" type="date" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
      <input v-model="form.endDate" type="date" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
      <LoadingButton
        :loading="submitting"
        loading-text="Mengajukan..."
        class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        type="submit"
      >
        Ajukan
      </LoadingButton>
      <textarea
        v-model="form.reason"
        rows="2"
        class="md:col-span-4 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        placeholder="Alasan leave/sick"
      />
    </form>

    <PageErrorAlert :message="error" class="mt-3" />

    <div class="mt-4 overflow-x-auto rounded-xl border border-slate-200">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50 text-left text-slate-600">
          <tr>
            <th class="px-4 py-3">Type</th>
            <th class="px-4 py-3">Periode</th>
            <th class="px-4 py-3">Alasan</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Catatan</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white">
          <tr v-for="item in items" :key="item.id">
            <td class="px-4 py-3 uppercase">{{ item.type }}</td>
            <td class="px-4 py-3">{{ item.startDate }} s/d {{ item.endDate }}</td>
            <td class="px-4 py-3">{{ item.reason }}</td>
            <td class="px-4 py-3">{{ item.status }}</td>
            <td class="px-4 py-3">{{ item.note || '-' }}</td>
          </tr>
          <tr v-if="!loading && items.length === 0">
            <td colspan="5" class="px-4 py-6 text-center text-slate-500">Belum ada request</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
