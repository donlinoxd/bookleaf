import { useAppStore } from '../store/appStore';

/**
 * fetch wrapper for client-mode (patron) screens.
 *
 * - Prepends serverUrl (from the store) when the input is a path (e.g. '/api/me/borrows').
 * - Sends `Authorization: Bearer <token>` when a session token is present in the store.
 * - On 401, clears the persisted session so the next screen can redirect to login.
 */
export async function clientFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { serverUrl, sessionToken } = useAppStore.getState();
  const url = input.startsWith('http') ? input : `${serverUrl ?? ''}${input}`;

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (sessionToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    // Drop the stale session so the UI can route back to login.
    try { await useAppStore.getState().clearClientSession(); } catch {}
  }

  return res;
}
