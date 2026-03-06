<script setup lang="ts">
import { computed } from "vue";

import { useToast } from "@/services/toast";

const toast = useToast();
const items = computed(() => toast.state.items);

function toastClass(type: "success" | "error" | "info" | "warning") {
  if (type === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (type === "error") return "border-red-200 bg-red-50 text-red-800";
  if (type === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-white text-slate-800";
}
</script>

<template>
  <div class="pointer-events-none fixed right-4 top-4 z-[100] w-[min(360px,calc(100%-2rem))] space-y-2">
    <div
      v-for="item in items"
      :key="item.id"
      class="pointer-events-auto rounded-lg border px-3 py-2 text-sm shadow"
      :class="toastClass(item.type)"
    >
      <div class="flex items-start justify-between gap-3">
        <p>{{ item.message }}</p>
        <button class="text-xs opacity-70 hover:opacity-100" @click="toast.remove(item.id)">✕</button>
      </div>
    </div>
  </div>
</template>
