import { create } from 'zustand';
import { AppMode, User, Institution, Settings } from '@bookleaf/types';

interface AppState {
  mode: AppMode;
  currentUser: User | null;
  institution: Institution | null;
  settings: Settings | null;

  setMode: (mode: AppMode) => void;
  setCurrentUser: (user: User | null) => void;
  setInstitution: (institution: Institution | null) => void;
  setSettings: (settings: Settings) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  mode: null,
  currentUser: null,
  institution: null,
  settings: null,

  setMode: (mode) => set({ mode }),
  setCurrentUser: (user) => set({ currentUser: user }),
  setInstitution: (institution) => set({ institution }),
  setSettings: (settings) => set({ settings }),

  reset: () => set({ currentUser: null, institution: null, settings: null }),
}));
