import { create } from 'zustand';

/**
 * Queues the post-verification “Enjoy the Vibes” toast so it runs after
 * navigation lands on Home (popup survives stack transitions).
 */
type PostLoginWelcomeState = {
  pendingEnjoyVibes: boolean;
  queueEnjoyVibes: () => void;
  consumeEnjoyVibes: () => boolean;
};

export const usePostLoginWelcomeStore = create<PostLoginWelcomeState>((set, get) => ({
  pendingEnjoyVibes: false,
  queueEnjoyVibes: () => set({ pendingEnjoyVibes: true }),
  consumeEnjoyVibes: () => {
    if (!get().pendingEnjoyVibes) return false;
    set({ pendingEnjoyVibes: false });
    return true;
  },
}));
