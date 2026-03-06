<script setup lang="ts">
withDefaults(defineProps<{
  message?: string;
}>(), {
  message: ""
});
</script>

<template>
  <div
    v-if="message"
    class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    role="alert"
  >
    {{ message }}
  </div>
</template>
