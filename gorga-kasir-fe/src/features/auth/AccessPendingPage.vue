<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

import { ROUTE_PATHS } from "@/constants/routes";

const route = useRoute();
const router = useRouter();

const tenant = computed(() => String(route.query.tenant ?? "").trim());
const reason = computed(
  () =>
    String(route.query.reason ?? "Akses akun Anda masih menunggu approval super admin atau pembayaran subscription.").trim()
);
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-100 p-4">
    <div class="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
      <h1 class="text-xl font-bold text-slate-900">Akses Belum Aktif</h1>
      <p class="mt-2 text-sm text-slate-600">
        {{ reason }}
      </p>
      <p v-if="tenant" class="mt-2 text-sm text-slate-600">
        Tenant: <span class="font-medium text-slate-900">{{ tenant }}</span>
      </p>

      <div class="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
        Silakan hubungi super admin untuk approval tenant dan pastikan status pembayaran subscription sudah paid.
      </div>

      <div class="mt-5 grid gap-2 md:grid-cols-2">
        <button
          class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          @click="router.push(ROUTE_PATHS.login)"
        >
          Kembali ke Login
        </button>
        <button
          class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          @click="router.push(ROUTE_PATHS.signupOwner)"
        >
          Daftar Owner Baru
        </button>
      </div>
    </div>
  </div>
</template>
