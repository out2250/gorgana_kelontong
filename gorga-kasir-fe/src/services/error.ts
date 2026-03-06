import axios from "axios";

export function getErrorMessage(error: unknown, fallback = "Terjadi kesalahan") {
  if (axios.isAxiosError(error)) {
    const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
    if (apiMessage) {
      return apiMessage;
    }

    if (error.code === "ERR_NETWORK") {
      return "Koneksi ke server bermasalah";
    }

    if (error.message) {
      return error.message;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
