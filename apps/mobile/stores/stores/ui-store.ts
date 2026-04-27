import { create } from 'zustand';

type Tab = 'discovery' | 'motives' | 'chat' | 'profile';

type BottomSheetState = {
  isOpen: boolean;
  content: string | null;
};

type UiStore = {
  activeTab: Tab;
  bottomSheet: BottomSheetState;
  // Actions
  setActiveTab: (tab: Tab) => void;
  openBottomSheet: (content: string) => void;
  closeBottomSheet: () => void;
};

export const useUiStore = create<UiStore>((set) => ({
  activeTab: 'discovery',
  bottomSheet: {
    isOpen: false,
    content: null,
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  openBottomSheet: (content) =>
    set({ bottomSheet: { isOpen: true, content } }),

  closeBottomSheet: () =>
    set({ bottomSheet: { isOpen: false, content: null } }),
}));
