import { createTRPCClient, httpLink, TRPCClientError } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '@bookleaf/server';
import { useAuthStore } from '@/store/useAuthStore';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

const SERVER_URL = 'http://localhost:3000';

export function createTrpcClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: `${SERVER_URL}/trpc`,
        headers: () => {
          const token = useAuthStore.getState().token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}

export function getTRPCErrorMessage(e: unknown): string {
  if (e instanceof TRPCClientError) return e.message || 'Server error.';
  return 'Could not reach the server.';
}

export function isTRPCUnauthorized(e: unknown): boolean {
  return e instanceof TRPCClientError && e.data?.code === 'UNAUTHORIZED';
}
