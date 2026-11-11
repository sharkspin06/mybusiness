import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { LoginInput, Me, Role, SignupInput } from '@mybusiness/shared';
import { api } from './api';

export const ME_KEY = ['me'] as const;

/** The signed-in user. `data` is undefined while loading; the query errors with 401 when signed out. */
export function useMe() {
  return useQuery({ queryKey: ME_KEY, queryFn: () => api<Me>('/auth/me'), retry: false, staleTime: 5 * 60_000 });
}

export interface Session {
  business: { id: string; name: string; plan: string };
  user: { id: string; name: string; email: string; role: Role };
  businesses: Me['businesses'];
}

/** Session for pages inside the signed-in app (RequireAuth guarantees it is loaded). */
export function useSession(): Session {
  const { data } = useMe();
  if (!data) throw new Error('useSession used outside RequireAuth');
  return { business: data.business, user: { ...data.user, role: data.role }, businesses: data.businesses };
}

export const planLabel = (plan: string) => plan.charAt(0).toUpperCase() + plan.slice(1);

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api<Me>('/auth/login', { method: 'POST', json: input }),
    onSuccess: (me) => {
      qc.clear();
      qc.setQueryData(ME_KEY, me);
    },
  });
}

export function useSignup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SignupInput) => api<Me>('/auth/signup', { method: 'POST', json: input }),
    onSuccess: (me) => {
      qc.clear();
      qc.setQueryData(ME_KEY, me);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      qc.clear();
      navigate('/login', { replace: true });
    },
  });
}

/** Work in another business. Clears cached data so nothing from the previous business is shown. */
export function useSwitchBusiness() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (tenantId: string) => api<Me>('/auth/switch', { method: 'POST', json: { tenantId } }),
    onSuccess: (me) => {
      qc.clear();
      qc.setQueryData(ME_KEY, me);
      navigate('/', { replace: true });
    },
  });
}
