export const queryKeys = {
  dashboard: (institutionId: number) => ['dashboard', institutionId] as const,
  overdue: () => ['overdue'] as const,
  books: (institutionId: number, query: string) => ['books', institutionId, query] as const,
  book: (id: number) => ['book', id] as const,
  bookCopies: (id: number) => ['book', id, 'copies'] as const,
  bookHistory: (id: number) => ['book', id, 'history'] as const,
  members: (institutionId: number, query: string) => ['members', institutionId, query] as const,
  member: (id: number) => ['member', id] as const,
  activeBorrows: (userId: number) => ['member', userId, 'activeBorrows'] as const,
  memberHistory: (userId: number) => ['member', userId, 'history'] as const,
  memberFines: (userId: number) => ['member', userId, 'fines'] as const,
};
