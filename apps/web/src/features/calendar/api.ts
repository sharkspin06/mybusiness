import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sgToIso, type Appointment, type AppointmentInput, type Member } from '@mybusiness/shared';
import { api } from '../../lib/api';

/** Appointments overlapping the Singapore dates [fromDate, toDate). */
export function useAppointmentsRange(fromDate: string, toDate: string) {
  const from = sgToIso(fromDate, '00:00');
  const to = sgToIso(toDate, '00:00');
  return useQuery({
    queryKey: ['appointments', 'range', from, to],
    queryFn: () => api<{ items: Appointment[] }>(`/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    placeholderData: keepPreviousData,
  });
}

export function useCustomerAppointments(customerId: string) {
  return useQuery({
    queryKey: ['appointments', 'customer', customerId],
    queryFn: () => api<{ items: Appointment[] }>(`/appointments?customerId=${customerId}`),
    enabled: !!customerId,
  });
}

export function useAppointment(id: string | null) {
  return useQuery({ queryKey: ['appointments', 'one', id], queryFn: () => api<Appointment>(`/appointments/${id}`), enabled: !!id });
}

export function useMembers() {
  return useQuery({ queryKey: ['members'], queryFn: () => api<{ items: Member[] }>('/business/members'), staleTime: 5 * 60_000 });
}

function useRefresh() {
  const qc = useQueryClient();
  return (a?: Appointment) => {
    qc.invalidateQueries({ queryKey: ['appointments'] });
    const customerId = a?.customerId;
    if (customerId) {
      qc.invalidateQueries({ queryKey: ['customers', 'summary', customerId] });
      qc.invalidateQueries({ queryKey: ['customers', 'history', customerId] });
    }
  };
}

export function useSaveAppointment() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: AppointmentInput }) =>
      id ? api<Appointment>(`/appointments/${id}`, { method: 'PUT', json: data }) : api<Appointment>('/appointments', { method: 'POST', json: data }),
    onSuccess: (a) => refresh(a),
  });
}

/** Drag-to-reschedule. Moves the appointment on screen straight away, then saves. */
export function useMoveAppointment() {
  const qc = useQueryClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, startsAt, endsAt }: { id: string; startsAt: string; endsAt: string }) =>
      api<Appointment>(`/appointments/${id}/time`, { method: 'PATCH', json: { startsAt, endsAt } }),
    onMutate: async ({ id, startsAt, endsAt }) => {
      await qc.cancelQueries({ queryKey: ['appointments', 'range'] });
      const snapshots = qc.getQueriesData<{ items: Appointment[] }>({ queryKey: ['appointments', 'range'] });
      for (const [key, data] of snapshots) {
        if (data) qc.setQueryData(key, { items: data.items.map((a) => (a.id === id ? { ...a, startsAt, endsAt } : a)) });
      }
      return { snapshots };
    },
    onError: (_e, _v, ctx) => ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: (a) => refresh(a),
  });
}

export function useDeleteAppointment() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (a: Appointment) => api<void>(`/appointments/${a.id}`, { method: 'DELETE' }),
    onSuccess: (_v, a) => refresh(a),
  });
}
