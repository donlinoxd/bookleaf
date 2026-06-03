import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { AppMode, User, Institution, Settings } from '@bookleaf/types';

const CLIENT_SESSION_KEY = 'client_session';

interface PersistedClientSession {
  serverUrl: string;
  user: User;
  token: string;
  expires_at: string;
}

interface AppState {
  mode: AppMode;
  currentUser: User | null;
  institution: Institution | null;
  settings: Settings | null;
  serverUrl: string | null;
  sessionToken: string | null;
  sessionExpiresAt: string | null;

  setMode: (mode: AppMode) => void;
  setCurrentUser: (user: User | null) => void;
  setInstitution: (institution: Institution | null) => void;
  setSettings: (settings: Settings) => void;
  setServerUrl: (url: string | null) => void;
  setClientSession: (data: { user: User; token: string; expires_at: string; serverUrl: string }) => Promise<void>;
  clearClientSession: () => Promise<void>;
  hydrateClientSession: () => Promise<PersistedClientSession | null>;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  mode: null,
  currentUser: null,
  institution: null,
  settings: null,
  serverUrl: null,
  sessionToken: null,
  sessionExpiresAt: null,

  setMode: (mode) => set({ mode }),
  setCurrentUser: (user) => set({ currentUser: user }),
  setInstitution: (institution) => set({ institution }),
  setSettings: (settings) => set({ settings }),
  setServerUrl: (url) => set({ serverUrl: url }),

  setClientSession: async ({ user, token, expires_at, serverUrl }) => {
    const payload: PersistedClientSession = { user, token, expires_at, serverUrl };
    await AsyncStorage.setItem(CLIENT_SESSION_KEY, JSON.stringify(payload));
    set({ currentUser: user, sessionToken: token, sessionExpiresAt: expires_at, serverUrl });
  },

  clearClientSession: async () => {
    await AsyncStorage.removeItem(CLIENT_SESSION_KEY);
    set({ currentUser: null, sessionToken: null, sessionExpiresAt: null });
  },

  hydrateClientSession: async () => {
    const raw = await AsyncStorage.getItem(CLIENT_SESSION_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as PersistedClientSession;
      if (!parsed.token || !parsed.user || !parsed.expires_at || !parsed.serverUrl) return null;
      if (new Date(parsed.expires_at).getTime() < Date.now()) {
        await AsyncStorage.removeItem(CLIENT_SESSION_KEY);
        return null;
      }
      set({
        currentUser: parsed.user,
        sessionToken: parsed.token,
        sessionExpiresAt: parsed.expires_at,
        serverUrl: parsed.serverUrl,
      });
      return parsed;
    } catch {
      await AsyncStorage.removeItem(CLIENT_SESSION_KEY);
      return null;
    }
  },

  reset: () => set({
    currentUser: null,
    institution: null,
    settings: null,
    sessionToken: null,
    sessionExpiresAt: null,
  }),
}));
