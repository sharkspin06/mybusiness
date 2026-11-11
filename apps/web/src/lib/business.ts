import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BusinessSettingsInput } from '@mybusiness/shared';
import { api } from './api';

export interface Business {
  id: string;
  name: string;
  uen: string | null;
  gstRegistered: boolean;
  gstRegNo: string | null;
  gstRateBp: number;
  phone: string | null;
  email: string | null;
  address: string | null;
  plan: string;
  quoteValidityDays: number;
  quoteTerms: string | null;
}

/** The current business's details (name, UEN, GST registration, quotation defaults). */
export function useBusiness() {
  return useQuery({ queryKey: ['business'], queryFn: () => api<Business>('/business'), staleTime: 5 * 60_000 });
}

export function useSaveBusiness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BusinessSettingsInput) => api<Business>('/business', { method: 'PUT', json: data }),
    onSuccess: (b) => {
      qc.setQueryData(['business'], b);
      qc.invalidateQueries({ queryKey: ['me'] }); // the business name shows in the sidebar
    },
  });
}
