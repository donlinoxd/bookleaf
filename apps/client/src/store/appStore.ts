import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { User } from '@bookleaf/types';

const CLIENT_SESSION_KEY = 'client_session';

interface PersistedSession {
  serverUrl: string;
  institutionId: number;
  institutionName: string;
  user: User;
  token: string;
  expires_at: string;
}

interface ClientState {
  serverUrl: string | null;
  institutionId: number | null;
  institutionName: string | null;
  sessionToken: string | null;
  sessionExpiresAt: string | null;
  currentUser: User | null;

  setServerUrl: (url: string | null) => void;
  setInstitutionInfo: (info: { institutionId: number; institutionName: string }) => void;
  setClientSession: (data: {
    user: User;
    token: string;
    expires_at: string;
    serverUrl: string;
    institutionId: number;
    institutionName: string;
  }) => Promise<void>;
  clearClientSession: () => Promise<void>;
  hydrateClientSession: () => Promise<boolean>;
}

export const useAppStore = create<ClientState>((set) => ({
  serverUrl: null,
  institutionId: null,
  institutionName: null,
  sessionToken: null,
  sessionExpiresAt: null,
  currentUser: null,

  setServerUrl: (url) => set({ serverUrl: url }),

  setInstitutionInfo: ({ institutionId, institutionName }) =>
    set({ institutionId, institutionName }),

  setClientSession: async ({ user, token, expires_at, serverUrl, institutionId, institutionName }) => {
    const payload: PersistedSession = { user, token, expires_at, serverUrl, institutionId, institutionName };
    await AsyncStorage.setItem(CLIENT_SESSION_KEY, JSON.stringify(payload));
    set({ currentUser: user, sessionToken: token, sessionExpiresAt: expires_at, serverUrl, institutionId, institutionName });
  },

  clearClientSession: async () => {
    await AsyncStorage.removeItem(CLIENT_SESSION_KEY);
    set({ currentUser: null, sessionToken: null, sessionExpiresAt: null });
  },

  hydrateClientSession: async () => {
    const raw = await AsyncStorage.getItem(CLIENT_SESSION_KEY);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as PersistedSession;
      if (!parsed.token || !parsed.user || !parsed.expires_at || !parsed.serverUrl) return false;
      if (new Date(parsed.expires_at).getTime() < Date.now()) {
        await AsyncStorage.removeItem(CLIENT_SESSION_KEY);
        return false;
      }
      set({
        currentUser: parsed.user,
        sessionToken: parsed.token,
        sessionExpiresAt: parsed.expires_at,
        serverUrl: parsed.serverUrl,
        institutionId: parsed.institutionId ?? 1,
        institutionName: parsed.institutionName ?? 'Library',
      });
      return true;
    } catch {
      await AsyncStorage.removeItem(CLIENT_SESSION_KEY);
      return false;
    }
  },
}));
