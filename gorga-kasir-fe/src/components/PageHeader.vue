<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string;
}>();
</script>

<template>
  <div class="flex items-start justify-between gap-3">
    <div>
      <h1 class="text-xl font-semibold text-blue-900">{{ title }}</h1>
      <p v-if="subtitle" class="mt-1 text-sm text-slate-500">{{ subtitle }}</p>
    </div>
    <div class="shrink-0">
      <slot name="right" />
    </div>
  </div>
</template>
