import {type ToastOptions, toast as toastify} from "react-toastify";

const defaults: ToastOptions = {
  position: "top-right",
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  hideProgressBar: true,
};

export const toast = {
  success(message: string, durationMs = 5500) {
    toastify.success(message, {...defaults, autoClose: durationMs});
  },
  error(message: string, durationMs = 10000) {
    toastify.error(message, {...defaults, autoClose: durationMs});
  },
  info(message: string, durationMs = 6000) {
    toastify.info(message, {...defaults, autoClose: durationMs});
  },
};
