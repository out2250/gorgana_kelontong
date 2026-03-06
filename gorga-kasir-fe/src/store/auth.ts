import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { updateMyProfile } from "@/services/api";

type UserProfile = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isSuperAdmin?: boolean;
  tenantId: string;
  address?: string | null;
  phoneNumber?: string | null;
  profileImageUrl?: string | null;
  mfaEnabled?: boolean;
};

const TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const ACCESS_EXPIRES_AT_KEY = "access_token_expires_at";
const USER_KEY = "user_profile";

export const useAuthStore = defineStore("auth", () => {
  const accessToken = ref(localStorage.getItem(TOKEN_KEY) ?? "");
  const refreshToken = ref(localStorage.getItem(REFRESH_TOKEN_KEY) ?? "");
  const accessTokenExpiresAt = ref(localStorage.getItem(ACCESS_EXPIRES_AT_KEY) ?? "");
  const user = ref<UserProfile | null>(
    localStorage.getItem(USER_KEY) ? JSON.parse(localStorage.getItem(USER_KEY) as string) : null
  );
  const autoLogoutTimer = ref<number | null>(null);

  const isAuthenticated = computed(() => {
    if (!accessToken.value || !accessTokenExpiresAt.value) {
      return false;
    }

    return Date.now() < new Date(accessTokenExpiresAt.value).getTime();
  });

  function clearLogoutTimer() {
    if (autoLogoutTimer.value) {
      window.clearTimeout(autoLogoutTimer.value);
      autoLogoutTimer.value = null;
    }
  }

  function scheduleAutoLogout() {
    clearLogoutTimer();

    if (!accessTokenExpiresAt.value) {
      return;
    }

    const msLeft = new Date(accessTokenExpiresAt.value).getTime() - Date.now();
    if (msLeft <= 0) {
      logout();
      return;
    }

    autoLogoutTimer.value = window.setTimeout(() => {
      logout();
      window.location.href = "/login";
    }, msLeft);
  }

  function setSession(session: {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: string;
    profile: UserProfile;
  }) {
    accessToken.value = session.accessToken;
    refreshToken.value = session.refreshToken;
    accessTokenExpiresAt.value = session.accessTokenExpiresAt;
    user.value = session.profile;

    localStorage.setItem(TOKEN_KEY, session.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
    localStorage.setItem(ACCESS_EXPIRES_AT_KEY, session.accessTokenExpiresAt);
    localStorage.setItem(USER_KEY, JSON.stringify(session.profile));

    scheduleAutoLogout();
  }

  function updateAccessSession(nextAccessToken: string, nextExpiresAt: string, nextRefreshToken?: string) {
    accessToken.value = nextAccessToken;
    accessTokenExpiresAt.value = nextExpiresAt;

    localStorage.setItem(TOKEN_KEY, nextAccessToken);
    localStorage.setItem(ACCESS_EXPIRES_AT_KEY, nextExpiresAt);

    if (nextRefreshToken) {
      refreshToken.value = nextRefreshToken;
      localStorage.setItem(REFRESH_TOKEN_KEY, nextRefreshToken);
    }

    scheduleAutoLogout();
  }

  function logout() {
    clearLogoutTimer();
    accessToken.value = "";
    refreshToken.value = "";
    accessTokenExpiresAt.value = "";
    user.value = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(ACCESS_EXPIRES_AT_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function updateProfile(payload: {
    fullName: string;
    address?: string | null;
    phoneNumber?: string | null;
    profileImageUrl?: string | null;
  }) {
    const updated = await updateMyProfile(payload);
    if (!user.value) {
      return updated;
    }

    user.value = {
      ...user.value,
      fullName: updated.fullName,
      address: updated.address ?? null,
      phoneNumber: updated.phoneNumber ?? null,
      profileImageUrl: updated.profileImageUrl ?? null
    };

    localStorage.setItem(USER_KEY, JSON.stringify(user.value));
    return updated;
  }

  scheduleAutoLogout();

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt,
    user,
    isAuthenticated,
    setSession,
    updateAccessSession,
    updateProfile,
    logout
  };
});
