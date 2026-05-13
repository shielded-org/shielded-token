type ToastKind = "success" | "error" | "info";

type ToastPush = (kind: ToastKind, message: string, durationMs?: number) => void;

let pushRef: ToastPush | null = null;

/** Wired by `ToastHost` in the app shell. Safe no-op before mount. */
export function setToastPush(fn: ToastPush | null) {
  pushRef = fn;
}

/** Lightweight stack toasts (toastify-style API, no extra dependency). */
export const toast = {
  success(message: string, durationMs = 5500) {
    pushRef?.("success", message, durationMs);
  },
  error(message: string, durationMs = 10000) {
    pushRef?.("error", message, durationMs);
  },
  info(message: string, durationMs = 6000) {
    pushRef?.("info", message, durationMs);
  },
};
