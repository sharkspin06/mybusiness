import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Quotation, QuotationInput, QuotationListResponse, QuoteStatus, QuoteStoredStatus } from '@mybusiness/shared';
import { api } from '../../lib/api';

export const QUOTE_PAGE_SIZE = 25;

export interface QuotationListParams {
  status?: QuoteStatus;
  customerId?: string;
  q?: string;
  page: number;
}

export function useQuotations(p: QuotationListParams) {
  const qs = new URLSearchParams({ page: String(p.page), pageSize: String(QUOTE_PAGE_SIZE) });
  if (p.status) qs.set('status', p.status);
  if (p.customerId) qs.set('customerId', p.customerId);
  if (p.q) qs.set('q', p.q);
  return useQuery({
    queryKey: ['quotations', 'list', p],
    queryFn: () => api<QuotationListResponse>(`/quotations?${qs}`),
    placeholderData: keepPreviousData,
  });
}

export function useQuotation(id: string | undefined) {
  return useQuery({
    queryKey: ['quotations', 'one', id],
    queryFn: () => api<Quotation>(`/quotations/${id}`),
    enabled: !!id,
  });
}

function useAfterChange() {
  const qc = useQueryClient();
  return (q: Quotation) => {
    qc.setQueryData(['quotations', 'one', q.id], q);
    qc.invalidateQueries({ queryKey: ['quotations', 'list'] });
    qc.invalidateQueries({ queryKey: ['customers', 'summary', q.customer.id] });
    qc.invalidateQueries({ queryKey: ['customers', 'history', q.customer.id] });
  };
}

export function useSaveQuotation() {
  const after = useAfterChange();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: QuotationInput }) =>
      id ? api<Quotation>(`/quotations/${id}`, { method: 'PUT', json: data }) : api<Quotation>('/quotations', { method: 'POST', json: data }),
    onSuccess: after,
  });
}

export function useSetQuotationStatus() {
  const after = useAfterChange();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: QuoteStoredStatus }) =>
      api<Quotation>(`/quotations/${id}/status`, { method: 'POST', json: { status } }),
    onSuccess: after,
  });
}

export function useDeleteQuotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (q: Quotation) => api<void>(`/quotations/${q.id}`, { method: 'DELETE' }),
    onSuccess: (_v, q) => {
      qc.removeQueries({ queryKey: ['quotations', 'one', q.id] });
      qc.invalidateQueries({ queryKey: ['quotations', 'list'] });
      qc.invalidateQueries({ queryKey: ['customers', 'history', q.customer.id] });
    },
  });
}
