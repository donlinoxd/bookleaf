import type { AuthorityType } from '@bookleaf/types';

export interface AuthorityCreateInput {
  institutionId: number;
  name: string;
  type: AuthorityType;
  variants?: string[] | null;
}

export interface AuthorityUpdateInput {
  name?: string;
  type?: AuthorityType;
  variants?: string[] | null;
}

export interface AuthorityListFilter {
  type?: AuthorityType;
  q?: string;
}
