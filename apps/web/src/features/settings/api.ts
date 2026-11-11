import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InviteInput, Me, Role, TeamResponse } from '@mybusiness/shared';
import { api } from '../../lib/api';
import { ME_KEY } from '../../lib/session';

export function useTeam() {
  return useQuery({ queryKey: ['team'], queryFn: () => api<TeamResponse>('/team') });
}

function useTeamMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] });
      qc.invalidateQueries({ queryKey: ['members'] });
    },
  });
}

export const useInvite = () => useTeamMutation((v: InviteInput) => api<{ link: string }>('/team/invites', { method: 'POST', json: v }));
export const useCancelInvite = () => useTeamMutation((id: string) => api<void>(`/team/invites/${encodeURIComponent(id)}`, { method: 'DELETE' }));
export const useChangeRole = () =>
  useTeamMutation(({ userId, role }: { userId: string; role: Role }) => api<void>(`/team/members/${userId}`, { method: 'PATCH', json: { role } }));
export const useRemoveMember = () => useTeamMutation((userId: string) => api<void>(`/team/members/${userId}`, { method: 'DELETE' }));
export const useResetLink = () => useTeamMutation((userId: string) => api<{ link: string }>(`/team/members/${userId}/reset-link`, { method: 'POST' }));

export function useUpdateName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api<Me>('/auth/me', { method: 'PATCH', json: { name } }),
    onSuccess: (me) => {
      qc.setQueryData(ME_KEY, me);
      qc.invalidateQueries({ queryKey: ['team'] });
      qc.invalidateQueries({ queryKey: ['members'] });
    },
  });
}

export const useChangePassword = () =>
  useMutation({ mutationFn: (v: { currentPassword: string; newPassword: string }) => api<void>('/auth/password', { method: 'POST', json: v }) });
