<script setup lang="ts">
import { onMounted, ref } from "vue";

import PageErrorAlert from "@/components/PageErrorAlert.vue";
import PageHeader from "@/components/PageHeader.vue";
import { decideLeaveRequest, getLeaveApprovals, type LeaveRequestDto } from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";

import UserManagementSubmenu from "./UserManagementSubmenu.vue";

const toast = useToast();
const loading = ref(false);
const error = ref("");
const items = ref<LeaveRequestDto[]>([]);
const processingId = ref("");

async function loadData() {
  loading.value = true;
  error.value = "";
  try {
    const result = await getLeaveApprovals();
    items.value = result.items;
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal memuat data approval");
    toast.error(error.value);
  } finally {
    loading.value = false;
  }
}

async function decide(id: string, decision: "approved" | "rejected") {
  processingId.value = id;
  try {
    await decideLeaveRequest(id, { decision });
    toast.success(`Request ${decision}`);
    await loadData();
  } catch (err) {
    error.value = getErrorMessage(err, "Gagal proses approval");
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
    <PageHeader title="Leave Approvals" subtitle="Approval leave/sick oleh atasan + history." />
    <UserManagementSubmenu />
    <PageErrorAlert :message="error" class="mt-3" />

    <div class="mt-4 overflow-x-auto rounded-xl border border-slate-200">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50 text-left text-slate-600">
          <tr>
            <th class="px-4 py-3">User</th>
            <th class="px-4 py-3">Type</th>
            <th class="px-4 py-3">Periode</th>
            <th class="px-4 py-3">Alasan</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white">
          <tr v-for="item in items" :key="item.id">
            <td class="px-4 py-3">{{ item.userName }}</td>
            <td class="px-4 py-3 uppercase">{{ item.type }}</td>
            <td class="px-4 py-3">{{ item.startDate }} s/d {{ item.endDate }}</td>
            <td class="px-4 py-3">{{ item.reason }}</td>
            <td class="px-4 py-3">{{ item.status }}</td>
            <td class="px-4 py-3">
              <div class="flex gap-2" v-if="item.status === 'pending'">
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
            <td colspan="6" class="px-4 py-6 text-center text-slate-500">Belum ada data</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
