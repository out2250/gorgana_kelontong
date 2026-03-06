<script setup lang="ts">
defineProps<{
  compact?: boolean;
}>();
</script>

<template>
  <div class="flex items-center gap-2">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 260" role="img" aria-label="Klontong Digital Logo">
      <defs>
        <linearGradient id="kdBlue" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#123A67"/>
          <stop offset="100%" stop-color="#2E7BFF"/>
        </linearGradient>
        <linearGradient id="kdBlueSoft" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#2E7BFF"/>
          <stop offset="100%" stop-color="#1F5FD6"/>
        </linearGradient>
      </defs>

      <!-- ICON -->
      <g transform="translate(36,30)">
        <!-- subtle rounded tile -->
        <rect x="0" y="0" width="180" height="180" rx="28" fill="#F8FAFC" stroke="#E2E8F0"/>

        <!-- trunk -->
        <path d="M86 62h8c6.6 0 12 5.4 12 12v58c0 10.8 8.2 19.8 18.9 20.8l15.1 1.4V166H40v-11.8l15.1-1.4C65.8 151.8 74 142.8 74 132V74c0-6.6 5.4-12 12-12z"
              fill="url(#kdBlue)"/>

        <!-- branches -->
        <g stroke="url(#kdBlueSoft)" stroke-width="7" stroke-linecap="round">
          <line x1="90" y1="72" x2="62" y2="92"/>
          <line x1="90" y1="72" x2="118" y2="92"/>
          <line x1="90" y1="58" x2="90" y2="34"/>
          <line x1="62" y1="96" x2="40" y2="112"/>
          <line x1="118" y1="96" x2="140" y2="112"/>
          <line x1="74" y1="112" x2="56" y2="130"/>
          <line x1="106" y1="112" x2="124" y2="130"/>
        </g>

        <!-- nodes -->
        <g fill="url(#kdBlueSoft)">
          <circle cx="90" cy="30" r="8"/>
          <circle cx="58" cy="95" r="8"/>
          <circle cx="122" cy="95" r="8"/>
          <circle cx="36" cy="115" r="8"/>
          <circle cx="144" cy="115" r="8"/>
          <circle cx="52" cy="134" r="8"/>
          <circle cx="128" cy="134" r="8"/>
        </g>
      </g>

      <!-- WORDMARK -->
      <g transform="translate(246,74)">
        <text x="0" y="70"
              font-family="Inter, Poppins, Segoe UI, Arial, sans-serif"
              font-size="68"
              font-weight="800"
              letter-spacing="-1"
              fill="#0F172A">
          Klontong
        </text>
        <text x="360" y="70"
              font-family="Inter, Poppins, Segoe UI, Arial, sans-serif"
              font-size="68"
              font-weight="800"
              letter-spacing="-1"
              fill="#1D4ED8">
          Digital
        </text>

        <text x="2" y="106"
              font-family="Inter, Segoe UI, Arial, sans-serif"
              font-size="20"
              font-weight="600"
              letter-spacing="1.6"
              fill="#64748B">
          MULTI-STORE POS & INVENTORY
        </text>
      </g>
    </svg>
  </div>
</template>
