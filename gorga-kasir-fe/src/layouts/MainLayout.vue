<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterView, useRouter } from "vue-router";

import AppSidebar from "@/components/AppSidebar.vue";
import { getAttendanceTodayStatus, getMe, logoutSession, startDay, type MeResponse } from "@/services/api";
import { useToast } from "@/services/toast";
import { useAuthStore } from "@/store/auth";

const auth = useAuthStore();
const router = useRouter();
const toast = useToast();
const subscription = ref<MeResponse["subscription"]>(null);
const startDayModalOpen = ref(false);
const startDaySubmitting = ref(false);
const startDayCanStart = ref(false);
const startDayReason = ref("");

const subscriptionNotice = computed(() => {
  if (!subscription.value?.endsAt) {
    return "";
  }

  if (subscription.value.isExpired) {
    return `Subscription berakhir pada ${new Date(subscription.value.endsAt).toLocaleDateString("id-ID")}. Silakan perpanjang.`;
  }

  if (typeof subscription.value.daysLeft === "number" && subscription.value.daysLeft <= 7) {
    return `Subscription akan berakhir dalam ${subscription.value.daysLeft} hari (deadline ${new Date(subscription.value.endsAt).toLocaleDateString("id-ID")}).`;
  }

  return `Deadline subscription: ${new Date(subscription.value.endsAt).toLocaleDateString("id-ID")}`;
});

const isSubscriptionCritical = computed(() => {
  if (!subscription.value?.endsAt) {
    return false;
  }

  return subscription.value.isExpired || (typeof subscription.value.daysLeft === "number" && subscription.value.daysLeft <= 7);
});

onMounted(async () => {
  if (auth.user?.isSuperAdmin) {
    return;
  }

  try {
    const me = await getMe();
    subscription.value = me.subscription;
  } catch {
    subscription.value = null;
  }

  try {
    const attendance = await getAttendanceTodayStatus();
    startDayModalOpen.value = attendance.needsStartDayPopup;
    startDayCanStart.value = attendance.canStartDay;
    startDayReason.value = attendance.blockReason || (attendance.todayLog ? "Start Day hari ini sudah dilakukan." : "");
  } catch {
    startDayModalOpen.value = false;
  }
});

async function handleStartDay() {
  startDaySubmitting.value = true;
  try {
    await startDay();
    toast.success("Start Day berhasil");
    startDayModalOpen.value = false;
  } catch {
    toast.error("Gagal Start Day");
  } finally {
    startDaySubmitting.value = false;
  }
}

async function handleLogout() {
  if (auth.refreshToken) {
    await logoutSession({ refreshToken: auth.refreshToken }).catch(() => undefined);
  }
  auth.logout();
  await router.push("/login");
}
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <div class="grid min-h-screen md:grid-cols-[256px_1fr]">
      <AppSidebar />

      <div class="flex min-w-0 flex-col">
        <header class="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:px-6">
          <div>
            <p class="text-xs text-slate-500">Tenant</p>
            <h2 class="text-sm font-semibold text-blue-800">{{ auth.user?.isSuperAdmin ? 'ALL TENANTS' : (auth.user?.tenantId || '-') }}</h2>
          </div>

          <div class="flex items-center gap-2">
            <img
              v-if="auth.user?.profileImageUrl"
              :src="auth.user.profileImageUrl"
              alt="Profile"
              class="h-9 w-9 rounded-full border border-slate-200 object-cover"
            />
            <div
              v-else
              class="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-600"
            >
              {{ (auth.user?.fullName || 'G').charAt(0).toUpperCase() }}
            </div>
            <div class="text-right">
              <p class="text-sm font-medium text-slate-800">{{ auth.user?.fullName || 'Guest' }}</p>
              <p class="text-xs uppercase text-slate-500">
                {{ auth.user?.isSuperAdmin ? 'super_admin' : (auth.user?.role || '-') }}
              </p>
            </div>
            <span
              v-if="auth.user?.isSuperAdmin"
              class="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700"
            >
              Super Admin
            </span>
            <button class="rounded-lg border border-blue-200 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50" @click="handleLogout">
              Logout
            </button>
          </div>
        </header>

        <div
          v-if="subscriptionNotice"
          :class="[
            'border-b px-4 py-3 text-sm md:px-6',
            isSubscriptionCritical
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'
          ]"
        >
          {{ subscriptionNotice }}
        </div>

        <main class="flex-1 bg-white p-4 md:p-6">
          <RouterView />
        </main>
      </div>
    </div>

    <div
      v-if="startDayModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      @click.self="startDayModalOpen = false"
    >
      <div class="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
        <h3 class="text-base font-semibold text-slate-900">Start Day</h3>
        <p class="mt-2 text-sm text-slate-600">
          {{ startDayReason || "Mulai hari kerja sekarang?" }}
        </p>

        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded border border-slate-300 px-3 py-2 text-sm"
            @click="startDayModalOpen = false"
          >
            Nanti
          </button>
          <button
            type="button"
            class="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            :disabled="!startDayCanStart || startDaySubmitting"
            @click="handleStartDay"
          >
            {{ startDaySubmitting ? 'Memulai...' : 'Start Day' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
