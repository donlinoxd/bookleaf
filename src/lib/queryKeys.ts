export const queryKeys = {
  dashboard: (institutionId: number) => ['dashboard', institutionId] as const,
  overdue: () => ['overdue'] as const,
  resources: (institutionId: number, query: string) => ['resources', institutionId, query] as const,
  resource: (id: number) => ['resource', id] as const,
  resourceCopies: (id: number) => ['resource', id, 'copies'] as const,
  resourceHistory: (id: number) => ['resource', id, 'history'] as const,
  members: (institutionId: number, query: string) => ['members', institutionId, query] as const,
  member: (id: number) => ['member', id] as const,
  activeBorrows: (userId: number) => ['member', userId, 'activeBorrows'] as const,
  memberHistory: (userId: number) => ['member', userId, 'history'] as const,
  memberFines: (userId: number) => ['member', userId, 'fines'] as const,
  settings: () => ['settings'] as const,
};
