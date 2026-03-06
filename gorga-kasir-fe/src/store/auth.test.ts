import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "./auth";

vi.mock("@/services/api", () => ({
  updateMyProfile: vi.fn(async (payload: { fullName: string; address?: string | null; phoneNumber?: string | null; profileImageUrl?: string | null }) => ({
    id: "u-1",
    email: "owner@klontong.local",
    role: "owner",
    tenantId: "t-1",
    ...payload
  }))
}));

describe("auth store", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("persists session and authenticates with future expiry", () => {
    const store = useAuthStore();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    store.setSession({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: expiresAt,
      profile: {
        id: "u-1",
        fullName: "Owner",
        email: "owner@klontong.local",
        role: "owner",
        tenantId: "t-1"
      }
    });

    expect(store.isAuthenticated).toBe(true);
    expect(localStorage.getItem("access_token")).toBe("access-token");
    expect(localStorage.getItem("refresh_token")).toBe("refresh-token");
  });

  it("updates in-memory profile via updateProfile", async () => {
    const store = useAuthStore();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    store.setSession({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: expiresAt,
      profile: {
        id: "u-1",
        fullName: "Owner",
        email: "owner@klontong.local",
        role: "owner",
        tenantId: "t-1"
      }
    });

    await store.updateProfile({
      fullName: "Owner Updated",
      address: "Jl. Baru",
      phoneNumber: "0812"
    });

    expect(store.user?.fullName).toBe("Owner Updated");
    expect(store.user?.address).toBe("Jl. Baru");
    expect(store.user?.phoneNumber).toBe("0812");
  });
});
