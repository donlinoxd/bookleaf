import { create } from 'zustand';
import { AppMode, User, Institution, Settings } from '../types';

interface AppState {
  mode: AppMode;
  currentUser: User | null;
  institution: Institution | null;
  settings: Settings | null;
  serverUrl: string | null;

  setMode: (mode: AppMode) => void;
  setCurrentUser: (user: User | null) => void;
  setInstitution: (institution: Institution | null) => void;
  setSettings: (settings: Settings) => void;
  setServerUrl: (url: string | null) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  mode: null,
  currentUser: null,
  institution: null,
  settings: null,
  serverUrl: null,

  setMode: (mode) => set({ mode }),
  setCurrentUser: (user) => set({ currentUser: user }),
  setInstitution: (institution) => set({ institution }),
  setSettings: (settings) => set({ settings }),
  setServerUrl: (url) => set({ serverUrl: url }),
  reset: () => set({
    currentUser: null,
    institution: null,
    settings: null,
  }),
}));
