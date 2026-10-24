import { create } from 'zustand';

let nextId = 0;
export const useAppDialogStore = create((set) => ({
  queue: [],
  enqueue: (dialog) => set(state => ({ queue: [...state.queue, dialog] })),
  settle: (id, value) => set(state => {
    const dialog = state.queue[0];
    if (!dialog || dialog.id !== id) return state;
    dialog.resolve(value);
    return { queue: state.queue.slice(1) };
  }),
}));

const openDialog = (kind, message, options = {}) => new Promise(resolve => {
  useAppDialogStore.getState().enqueue({ ...options, id: ++nextId, kind, message: String(message ?? ''), resolve });
});

/** Await these dialogs just like a user decision; the browser stays responsive. */
export const appDialog = {
  alert: (message, options) => openDialog('alert', message, options),
  confirm: (message, options) => openDialog('confirm', message, options),
  prompt: (message, defaultValue = '', options) => openDialog('prompt', message, { ...options, defaultValue }),
};
