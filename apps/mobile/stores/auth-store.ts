import { create } from 'zustand';

type User = {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  displayName?: string | null;
  username?: string | null;
  onboardingStep: string;
  onboardingCompleted: boolean;
  lastActiveTab: string;
  availabilityStatus: string;
};

type AuthStore = {
  user: User | null;
  isAuthenticated: boolean;
  onboardingStep: number;
  // Actions
  setUser: (user: User | null) => void;
  setOnboardingStep: (step: number) => void;
  clearAuth: () => void;
};

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  onboardingStep: 0,

  setUser: (user) =>
    set({
      user,
      isAuthenticated: !!user,
      onboardingStep: user ? parseInt(user.onboardingStep ?? '0', 10) : 0,
    }),

  setOnboardingStep: (step) => set({ onboardingStep: step }),

  clearAuth: () =>
    set({
      user: null,
      isAuthenticated: false,
      onboardingStep: 0,
    }),
}));
