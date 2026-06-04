import { createTRPCClient, httpLink, TRPCClientError } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '@bookleaf/server';
import { useAppStore } from '../store/appStore';

// Creates TRPCProvider and useTRPC hook — both exported for use throughout the app
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// Call once in _layout.tsx via useState — reads serverUrl and token dynamically per request
export function createTrpcClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: () => `${useAppStore.getState().serverUrl ?? ''}/trpc`,
        headers: () => {
          const token = useAppStore.getState().sessionToken;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}

/** Human-readable error message from a tRPC error or network failure. */
export function getTRPCErrorMessage(e: unknown): string {
  if (e instanceof TRPCClientError) {
    return e.message || 'Server error. Please try again.';
  }
  return 'Could not reach the library server.';
}

/** Returns true if the error is an UNAUTHORIZED tRPC error. */
export function isTRPCUnauthorized(e: unknown): boolean {
  return e instanceof TRPCClientError && e.data?.code === 'UNAUTHORIZED';
}
