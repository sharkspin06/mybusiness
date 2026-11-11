import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Customer, CustomerInput, CustomerListResponse, CustomerStatus, HistoryEntry } from '@mybusiness/shared';
import { api } from '../../lib/api';

export interface CustomerListParams {
  status?: CustomerStatus;
  q?: string;
  page: number;
}

export const PAGE_SIZE = 25;

export function useCustomers(p: CustomerListParams) {
  const qs = new URLSearchParams({ page: String(p.page), pageSize: String(PAGE_SIZE) });
  if (p.status) qs.set('status', p.status);
  if (p.q) qs.set('q', p.q);
  return useQuery({
    queryKey: ['customers', 'list', p],
    queryFn: () => api<CustomerListResponse>(`/customers?${qs}`),
    placeholderData: keepPreviousData,
  });
}

export function useCustomer(id: string) {
  return useQuery({ queryKey: ['customers', 'one', id], queryFn: () => api<Customer>(`/customers/${id}`), enabled: !!id });
}

export function useCustomerHistory(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['customers', 'history', id],
    queryFn: () => api<{ items: HistoryEntry[] }>(`/customers/${id}/history`),
    enabled,
  });
}

export function useSaveCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: CustomerInput }) =>
      id ? api<Customer>(`/customers/${id}`, { method: 'PUT', json: data }) : api<Customer>('/customers', { method: 'POST', json: data }),
    onSuccess: (c) => {
      qc.setQueryData(['customers', 'one', c.id], c);
      qc.invalidateQueries({ queryKey: ['customers', 'list'] });
      qc.invalidateQueries({ queryKey: ['customers', 'history', c.id] });
    },
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/customers/${id}`, { method: 'DELETE' }),
    onSuccess: (_v, id) => {
      qc.removeQueries({ queryKey: ['customers', 'one', id] });
      qc.invalidateQueries({ queryKey: ['customers', 'list'] });
    },
  });
}

export interface CustomerSummary {
  quotedCents: number;
  acceptedCents: number;
  quotationCount: number;
  nextAppointment: { startsAt: string; title: string } | null;
}

export function useCustomerSummary(id: string) {
  return useQuery({ queryKey: ['customers', 'summary', id], queryFn: () => api<CustomerSummary>(`/customers/${id}/summary`), enabled: !!id });
}
