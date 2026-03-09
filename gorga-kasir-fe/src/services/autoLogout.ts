// Auto logout logic based on user inactivity
// Usage: import and call setupAutoLogout() in main.ts

import { useAuthStore } from "../store/auth";

const AUTO_LOGOUT_MINUTES = 15; // bisa diubah sesuai kebutuhan
let logoutTimer: ReturnType<typeof setTimeout> | null = null;

function resetLogoutTimer() {
  if (logoutTimer) clearTimeout(logoutTimer);
  logoutTimer = setTimeout(() => {
    const auth = useAuthStore();
    if (auth.isAuthenticated) {
      auth.logout();
      window.location.reload();
    }
  }, AUTO_LOGOUT_MINUTES * 60 * 1000);
}

function setupAutoLogout() {
  // List of events considered as activity
  const events = ["click", "keydown", "scroll", "mousemove", "touchstart"];
  events.forEach((evt) => {
    window.addEventListener(evt, resetLogoutTimer);
  });
  resetLogoutTimer(); // start timer on load
}

export { setupAutoLogout };
