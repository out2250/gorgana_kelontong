<script setup lang="ts">
withDefaults(defineProps<{
  unstyled?: boolean;
}>(), {
  unstyled: false
});
</script>

<template>
  <div :class="unstyled ? '' : 'mt-3 flex items-center gap-2'">
    <slot />
  </div>
</template>
