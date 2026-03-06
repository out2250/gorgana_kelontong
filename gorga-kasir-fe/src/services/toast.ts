import { reactive } from "vue";

export type ToastType = "success" | "error" | "info" | "warning";

export type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
};

const state = reactive<{ items: ToastItem[] }>({
  items: []
});

const timers = new Map<string, number>();

function getToastKey(type: ToastType, message: string) {
  return `${type}::${message.trim()}`;
}

function clearToastTimer(id: string) {
  const timerId = timers.get(id);
  if (!timerId) {
    return;
  }

  window.clearTimeout(timerId);
  timers.delete(id);
}

function remove(id: string) {
  state.items = state.items.filter((item) => item.id !== id);
  clearToastTimer(id);
}

function show(type: ToastType, message: string, duration = 3000) {
  const normalizedMessage = message.trim();
  const key = getToastKey(type, normalizedMessage);

  const existing = state.items.find((item) => getToastKey(item.type, item.message) === key);
  if (existing) {
    clearToastTimer(existing.id);
    const timerId = window.setTimeout(() => {
      remove(existing.id);
    }, duration);
    timers.set(existing.id, timerId);
    return;
  }

  const id = crypto.randomUUID();
  state.items.push({ id, type, message: normalizedMessage });

  const timerId = window.setTimeout(() => {
    remove(id);
  }, duration);

  timers.set(id, timerId);
}

export function useToast() {
  return {
    state,
    show,
    remove,
    success(message: string, duration?: number) {
      show("success", message, duration);
    },
    error(message: string, duration?: number) {
      show("error", message, duration);
    },
    info(message: string, duration?: number) {
      show("info", message, duration);
    },
    warning(message: string, duration?: number) {
      show("warning", message, duration);
    }
  };
}
