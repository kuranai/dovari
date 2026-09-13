import {
  normalizeSearchQuery,
  searchResponseSchema,
  type SearchResponse,
} from '../../../shared/search';
import { request } from '../pages/api';

export function searchPages(query: string, signal?: AbortSignal): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: normalizeSearchQuery(query) });
  return request<SearchResponse>(`/api/private/search?${params.toString()}`, searchResponseSchema, {
    signal,
  });
}
