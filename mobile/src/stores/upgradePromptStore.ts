import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UpgradePromptState {
  hasSeenPrompt: boolean;
  setHasSeenPrompt: (seen: boolean) => void;
  reset: () => void;
}

export const useUpgradePromptStore = create<UpgradePromptState>()(
  persist(
    (set) => ({
      hasSeenPrompt: false,
      setHasSeenPrompt: (seen: boolean) => set({ hasSeenPrompt: seen }),
      reset: () => set({ hasSeenPrompt: false }),
    }),
    {
      name: 'vybe-upgrade-prompt',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
