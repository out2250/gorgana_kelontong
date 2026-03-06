<script setup lang="ts">
import { computed, useAttrs } from "vue";

type ButtonType = "button" | "submit" | "reset";

const props = withDefaults(defineProps<{
  loading?: boolean;
  disabled?: boolean;
  loadingText?: string;
  type?: ButtonType;
}>(), {
  loading: false,
  disabled: false,
  type: "button"
});

const attrs = useAttrs();

const mergedClass = computed(() => {
  return [
    "inline-flex items-center justify-center gap-2 disabled:opacity-70",
    attrs.class
  ];
});
</script>

<template>
  <button
    v-bind="attrs"
    :type="props.type"
    :disabled="props.disabled || props.loading"
    :class="mergedClass"
  >
    <span
      v-if="props.loading"
      class="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current"
    />
    <span v-if="props.loading">{{ props.loadingText || "Memproses..." }}</span>
    <slot v-else />
  </button>
</template>
