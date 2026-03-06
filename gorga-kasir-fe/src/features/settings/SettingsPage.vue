<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";

import LoadingButton from "@/components/LoadingButton.vue";
import PageHeader from "@/components/PageHeader.vue";
import { disableMfa, enableMfa, setupMfa, uploadProfileImage } from "@/services/api";
import { useToast } from "@/services/toast";
import { useAuthStore } from "@/store/auth";
import { useUiPreferencesStore } from "@/store/ui-preferences";

type ThemeMode = "light" | "dark" | "system";
type FontMode = "inter" | "poppins" | "nunito" | "system";

const auth = useAuthStore();
const uiPreferences = useUiPreferencesStore();
const toast = useToast();

const profileForm = reactive({
  fullName: auth.user?.fullName ?? "",
  phoneNumber: auth.user?.phoneNumber ?? "",
  address: auth.user?.address ?? "",
  profileImageUrl: auth.user?.profileImageUrl ?? ""
});

const selectedImageName = ref("");
const savingProfile = ref(false);
const mfaCode = ref("");
const mfaSetupSecret = ref("");
const mfaSetupOtpAuthUrl = ref("");
const mfaLoading = ref(false);
const MAX_PROFILE_IMAGE_BYTES = 350 * 1024;
const MAX_PROFILE_RAW_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_PROFILE_IMAGE_DIMENSION = 1280;

const profilePreview = computed(() => profileForm.profileImageUrl || "");

watch(
  () => auth.user,
  (nextUser) => {
    profileForm.fullName = nextUser?.fullName ?? "";
    profileForm.phoneNumber = nextUser?.phoneNumber ?? "";
    profileForm.address = nextUser?.address ?? "";
    profileForm.profileImageUrl = nextUser?.profileImageUrl ?? "";
  },
  { deep: true }
);

function estimateDataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.ceil((base64.length * 3) / 4);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Invalid image format"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = dataUrl;
  });
}

async function compressImageToDataUrl(file: File) {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(originalDataUrl);

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.floor((image.naturalWidth - sourceSize) / 2);
  const sourceY = Math.floor((image.naturalHeight - sourceSize) / 2);

  let targetSize = Math.min(sourceSize, MAX_PROFILE_IMAGE_DIMENSION);
  let quality = 0.9;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas not supported");
  }

  for (let attempt = 0; attempt < 16; attempt += 1) {
    canvas.width = targetSize;
    canvas.height = targetSize;
    context.clearRect(0, 0, targetSize, targetSize);
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      targetSize,
      targetSize
    );

    const output = canvas.toDataURL("image/jpeg", quality);
    if (estimateDataUrlBytes(output) <= MAX_PROFILE_IMAGE_BYTES) {
      return output;
    }

    if (quality > 0.45) {
      quality = Math.max(0.45, quality - 0.1);
    } else {
      targetSize = Math.max(320, Math.round(targetSize * 0.85));
      quality = 0.85;
    }
  }

  throw new Error("Image too large");
}

async function onSelectImage(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    toast.warning("File harus berupa gambar");
    target.value = "";
    return;
  }

  if (file.size > MAX_PROFILE_RAW_UPLOAD_BYTES) {
    toast.warning("Ukuran file maksimal 8MB");
    target.value = "";
    return;
  }

  selectedImageName.value = file.name;
  try {
    const optimizedDataUrl = await compressImageToDataUrl(file);
    const uploaded = await uploadProfileImage({
      fileName: file.name,
      mimeType: "image/jpeg",
      dataUrl: optimizedDataUrl
    });
    profileForm.profileImageUrl = uploaded.imageUrl;
    toast.success("Foto diproses otomatis");
  } catch {
    toast.warning("Gagal memproses foto. Coba gambar lain atau ukuran lebih kecil.");
  } finally {
    target.value = "";
  }
}

function removePhoto() {
  profileForm.profileImageUrl = "";
  selectedImageName.value = "";
}

async function saveProfile() {
  const fullName = profileForm.fullName.trim();
  if (!fullName) {
    toast.warning("Nama lengkap wajib diisi");
    return;
  }

  savingProfile.value = true;
  try {
    await auth.updateProfile({
      fullName,
      phoneNumber: profileForm.phoneNumber.trim() || null,
      address: profileForm.address.trim() || null,
      profileImageUrl: profileForm.profileImageUrl || null
    });
    toast.success("Profil berhasil diperbarui");
  } catch {
    toast.error("Gagal menyimpan profil");
  } finally {
    savingProfile.value = false;
  }
}

function updateTheme(event: Event) {
  uiPreferences.setThemeMode((event.target as HTMLSelectElement).value as ThemeMode);
}

function updateFont(event: Event) {
  uiPreferences.setFontMode((event.target as HTMLSelectElement).value as FontMode);
}

async function startMfaSetup() {
  mfaLoading.value = true;
  try {
    const setup = await setupMfa();
    mfaSetupSecret.value = setup.secret;
    mfaSetupOtpAuthUrl.value = setup.otpauthUrl;
    mfaCode.value = "";
    toast.success("MFA setup siap, masukkan OTP untuk aktivasi");
  } catch {
    toast.error("Gagal memulai setup MFA");
  } finally {
    mfaLoading.value = false;
  }
}

async function confirmEnableMfa() {
  const code = mfaCode.value.trim();
  if (!/^\d{6}$/.test(code)) {
    toast.warning("Kode OTP harus 6 digit");
    return;
  }

  mfaLoading.value = true;
  try {
    await enableMfa({ code });
    if (auth.user) {
      auth.user.mfaEnabled = true;
    }
    mfaCode.value = "";
    mfaSetupSecret.value = "";
    mfaSetupOtpAuthUrl.value = "";
    toast.success("MFA berhasil diaktifkan");
  } catch {
    toast.error("Gagal mengaktifkan MFA");
  } finally {
    mfaLoading.value = false;
  }
}

async function turnOffMfa() {
  mfaLoading.value = true;
  try {
    await disableMfa();
    if (auth.user) {
      auth.user.mfaEnabled = false;
    }
    mfaCode.value = "";
    mfaSetupSecret.value = "";
    mfaSetupOtpAuthUrl.value = "";
    toast.success("MFA dinonaktifkan");
  } catch {
    toast.error("Gagal menonaktifkan MFA");
  } finally {
    mfaLoading.value = false;
  }
}
</script>

<template>
  <section>
    <PageHeader
      title="Settings"
      subtitle="Atur tampilan aplikasi (Dark/Light/System, font) dan ubah detail profil Anda."
    />

    <article class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 class="text-sm font-semibold text-slate-900">App Appearance</h2>
      <div class="mt-3 grid gap-3 md:grid-cols-2">
        <label class="flex flex-col gap-1 text-sm text-slate-700">
          Theme / Brightness
          <select
            :value="uiPreferences.themeMode"
            class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            @change="updateTheme"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System Brightness</option>
          </select>
        </label>

        <label class="flex flex-col gap-1 text-sm text-slate-700">
          Font
          <select
            :value="uiPreferences.fontMode"
            class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            @change="updateFont"
          >
            <option value="inter">Inter</option>
            <option value="poppins">Poppins</option>
            <option value="nunito">Nunito</option>
            <option value="system">System Font</option>
          </select>
        </label>
      </div>
      <p class="mt-3 text-xs text-slate-500">
        Mode aktif: <span class="font-medium">{{ uiPreferences.resolvedTheme }}</span>
      </p>
    </article>

    <article class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 class="text-sm font-semibold text-slate-900">Profile</h2>

      <div class="mt-3 grid gap-4 md:grid-cols-[140px_1fr]">
        <div class="flex flex-col items-center gap-2">
          <img
            v-if="profilePreview"
            :src="profilePreview"
            alt="Profile"
            class="h-24 w-24 rounded-full border border-slate-200 object-cover"
          />
          <div
            v-else
            class="flex h-24 w-24 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-2xl font-semibold text-slate-500"
          >
            {{ (profileForm.fullName || "U").charAt(0).toUpperCase() }}
          </div>

          <label class="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
            Upload Foto
            <input type="file" accept="image/*" class="hidden" @change="onSelectImage" />
          </label>
          <button class="text-xs text-slate-500 hover:text-slate-700" type="button" @click="removePhoto">Hapus foto</button>
          <p v-if="selectedImageName" class="line-clamp-1 max-w-[140px] text-center text-[11px] text-slate-500">{{ selectedImageName }}</p>
        </div>

        <div class="grid gap-3">
          <label class="flex flex-col gap-1 text-sm text-slate-700">
            Nama Lengkap
            <input v-model="profileForm.fullName" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Nama lengkap" />
          </label>

          <label class="flex flex-col gap-1 text-sm text-slate-700">
            Nomor HP
            <input v-model="profileForm.phoneNumber" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="08xxxxxxxxxx" />
          </label>

          <label class="flex flex-col gap-1 text-sm text-slate-700">
            Alamat
            <textarea
              v-model="profileForm.address"
              rows="3"
              class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Alamat lengkap"
            />
          </label>

          <div class="flex justify-end">
            <LoadingButton
              :loading="savingProfile"
              loading-text="Menyimpan..."
              class="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
              @click="saveProfile"
            >
              Simpan Profil
            </LoadingButton>
          </div>
        </div>
      </div>
    </article>

    <article
      v-if="auth.user?.isSuperAdmin || auth.user?.role === 'owner'"
      class="mt-4 rounded-xl border border-slate-200 bg-white p-4"
    >
      <h2 class="text-sm font-semibold text-slate-900">MFA Security</h2>
      <p class="mt-1 text-xs text-slate-500">Status MFA: {{ auth.user?.mfaEnabled ? 'Enabled' : 'Disabled' }}</p>

      <div v-if="!auth.user?.mfaEnabled" class="mt-3 grid gap-3">
        <LoadingButton
          :loading="mfaLoading"
          loading-text="Menyiapkan..."
          class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          @click="startMfaSetup"
        >
          Setup MFA
        </LoadingButton>

        <div v-if="mfaSetupSecret" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <p class="font-semibold">Secret (simpan di authenticator app):</p>
          <p class="mt-1 break-all">{{ mfaSetupSecret }}</p>
          <p class="mt-2 font-semibold">OTP Auth URL:</p>
          <p class="mt-1 break-all">{{ mfaSetupOtpAuthUrl }}</p>
        </div>

        <div v-if="mfaSetupSecret" class="flex gap-2">
          <input
            v-model="mfaCode"
            maxlength="6"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Masukkan OTP 6 digit"
          />
          <LoadingButton
            :loading="mfaLoading"
            loading-text="Aktivasi..."
            class="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white"
            @click="confirmEnableMfa"
          >
            Enable
          </LoadingButton>
        </div>
      </div>

      <div v-else class="mt-3">
        <LoadingButton
          :loading="mfaLoading"
          loading-text="Memproses..."
          class="rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-700"
          @click="turnOffMfa"
        >
          Disable MFA
        </LoadingButton>
      </div>
    </article>
  </section>
</template>
