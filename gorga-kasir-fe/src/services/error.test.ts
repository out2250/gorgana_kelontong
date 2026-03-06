import axios from "axios";
import { describe, expect, it } from "vitest";

import { getErrorMessage } from "./error";

describe("getErrorMessage", () => {
  it("uses api message when available", () => {
    const error = {
      isAxiosError: true,
      response: { data: { message: "custom api error" } }
    } as unknown;

    expect(getErrorMessage(error)).toBe("custom api error");
  });

  it("returns network fallback for network error", () => {
    const networkError = new axios.AxiosError("Network Error", "ERR_NETWORK");
    expect(getErrorMessage(networkError)).toBe("Koneksi ke server bermasalah");
  });

  it("returns generic fallback when error unknown", () => {
    expect(getErrorMessage({})).toBe("Terjadi kesalahan");
  });
});
