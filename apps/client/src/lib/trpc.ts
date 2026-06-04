import { createTRPCClient, httpLink, TRPCClientError } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '@bookleaf/server';
import { useAppStore } from '../store/appStore';

// Creates TRPCProvider and useTRPC hook — both exported for use throughout the app
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// Pass serverUrl explicitly — tRPC v11's httpLink resolves url via .toString() at link creation,
// so a function would be serialized as source code, not called. Recreate the client when serverUrl changes.
export function createTrpcClient(serverUrl: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: `${serverUrl}/trpc`,
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
