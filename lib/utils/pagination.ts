import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export type Paginated<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export function buildPagination(input: PaginationInput) {
  const { page, limit } = input;
  return { skip: (page - 1) * limit, limit, page };
}

export function paginate<T>(items: T[], total: number, input: PaginationInput): Paginated<T> {
  const totalPages = Math.max(1, Math.ceil(total / input.limit));
  return {
    items,
    page: input.page,
    limit: input.limit,
    total,
    totalPages,
    hasMore: input.page < totalPages,
  };
}

/** Reads pagination + arbitrary filter params from a URL search string. */
export function parseSearchParams(url: string): URLSearchParams {
  return new URL(url).searchParams;
}
