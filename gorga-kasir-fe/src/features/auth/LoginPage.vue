<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";

import LoadingButton from "@/components/LoadingButton.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import { ROUTE_PATHS } from "@/constants/routes";
import { login, verifyLoginOtp, type AuthSessionResponse } from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";
import { useAuthStore } from "@/store/auth";

const auth = useAuthStore();
const toast = useToast();
const router = useRouter();

const form = reactive({
  email: "",
  password: ""
});

const loading = ref(false);
const errorMessage = ref("");
const otpCode = ref("");
const mfaChallengeId = ref("");

async function handleSubmit() {
  loading.value = true;
  errorMessage.value = "";

  try {
    const email = form.email.trim();
    const password = form.password;

    if (!email) {
      errorMessage.value = "Email wajib diisi";
      toast.error(errorMessage.value);
      return;
    }

    if (password.length < 6) {
      errorMessage.value = "Password minimal 6 karakter";
      toast.error(errorMessage.value);
      return;
    }

    const data = await login({ email, password });
    if ("mfaRequired" in data && data.mfaRequired) {
      mfaChallengeId.value = data.challengeId;
      otpCode.value = "";
      toast.warning("Masukkan kode OTP dari authenticator");
      return;
    }

    const session = data as AuthSessionResponse;

    auth.setSession({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      accessTokenExpiresAt: session.accessTokenExpiresAt,
      profile: session.user
    });
    toast.success("Login berhasil");
    await router.push(ROUTE_PATHS.dashboard);
  } catch (error) {
    errorMessage.value = getErrorMessage(error, "Login gagal");
    const normalized = errorMessage.value.toLowerCase();
    if (
      normalized.includes("tenant is not active")
      || normalized.includes("subscription is not active")
      || normalized.includes("subscription payment is required")
      || normalized.includes("status pending")
    ) {
      await router.push({
        path: ROUTE_PATHS.accessPending,
        query: { reason: errorMessage.value }
      });
      return;
    }
    toast.error(errorMessage.value || "Login gagal");
  } finally {
    loading.value = false;
  }
}

async function handleVerifyOtp() {
  loading.value = true;
  errorMessage.value = "";

  try {
    const code = otpCode.value.trim();
    if (!/^\d{6}$/.test(code)) {
      errorMessage.value = "Kode OTP harus 6 digit";
      toast.error(errorMessage.value);
      return;
    }

    const data = await verifyLoginOtp({
      challengeId: mfaChallengeId.value,
      code
    });

    auth.setSession({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      accessTokenExpiresAt: data.accessTokenExpiresAt,
      profile: data.user
    });
    toast.success("Login berhasil");
    await router.push(ROUTE_PATHS.dashboard);
  } catch (error) {
    errorMessage.value = getErrorMessage(error, "Verifikasi OTP gagal");
    toast.error(errorMessage.value || "Verifikasi OTP gagal");
  } finally {
    loading.value = false;
  }
}

function cancelMfaStep() {
  mfaChallengeId.value = "";
  otpCode.value = "";
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-100 p-4">
    <div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 class="text-xl font-bold text-slate-900">Masuk Klontong Digital</h1>
      <p class="mt-1 text-sm text-slate-500">Login internal (owner/manager/kasir)</p>
      <p class="mt-1 text-xs text-slate-500">
        Belum punya akun owner?
        <RouterLink :to="ROUTE_PATHS.signupOwner" class="font-medium text-slate-900 underline">Daftar di sini</RouterLink>
      </p>

      <form v-if="!mfaChallengeId" class="mt-5 space-y-3" @submit.prevent="handleSubmit">
        <div>
          <label class="mb-1 block text-sm text-slate-700">Email</label>
          <input
            v-model="form.email"
            type="email"
            autocomplete="username"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
          />
        </div>

        <div>
          <label class="mb-1 block text-sm text-slate-700">Password</label>
          <input
            v-model="form.password"
            type="password"
            autocomplete="current-password"
            minlength="6"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
          />
        </div>

        <PageErrorAlert :message="errorMessage" />

        <LoadingButton
          :loading="loading"
          loading-text="Memproses..."
          class="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          type="submit"
        >
          Login
        </LoadingButton>
      </form>

      <form v-else class="mt-5 space-y-3" @submit.prevent="handleVerifyOtp">
        <div>
          <label class="mb-1 block text-sm text-slate-700">Kode OTP (6 digit)</label>
          <input
            v-model="otpCode"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="6"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="123456"
            required
          />
        </div>

        <PageErrorAlert :message="errorMessage" />

        <LoadingButton
          :loading="loading"
          loading-text="Memverifikasi..."
          class="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          type="submit"
        >
          Verifikasi OTP
        </LoadingButton>

        <button class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700" type="button" @click="cancelMfaStep">
          Kembali ke Login
        </button>
      </form>
    </div>
  </div>
</template>
