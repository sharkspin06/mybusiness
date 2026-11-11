import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Task, TaskInput, TaskListResponse, TaskStatus, TaskSummary } from '@mybusiness/shared';
import { api } from '../../lib/api';

export interface TaskFilters {
  status?: string;
  assignee?: string;
  priority?: string;
  due?: string;
}

export function useTasks(f: TaskFilters) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) qs.set(k, v);
  return useQuery({
    queryKey: ['tasks', 'list', f],
    queryFn: () => api<TaskListResponse>(`/tasks?${qs}`),
    placeholderData: keepPreviousData,
  });
}

export function useTaskSummary() {
  return useQuery({ queryKey: ['tasks', 'summary'], queryFn: () => api<TaskSummary>('/tasks/summary'), staleTime: 60_000 });
}

function useRefresh() {
  const qc = useQueryClient();
  return (t?: Task) => {
    qc.invalidateQueries({ queryKey: ['tasks'] });
    if (t?.customerId) qc.invalidateQueries({ queryKey: ['customers', 'history', t.customerId] });
  };
}

export function useSaveTask() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: TaskInput }) =>
      id ? api<Task>(`/tasks/${id}`, { method: 'PUT', json: data }) : api<Task>('/tasks', { method: 'POST', json: data }),
    onSuccess: (t) => refresh(t),
  });
}

/** Tick box and board drag: update the screen straight away, then save. */
export function useSetTaskStatus() {
  const qc = useQueryClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => api<Task>(`/tasks/${id}/status`, { method: 'PATCH', json: { status } }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['tasks', 'list'] });
      const snapshots = qc.getQueriesData<TaskListResponse>({ queryKey: ['tasks', 'list'] });
      for (const [key, data] of snapshots) {
        if (data) qc.setQueryData(key, { ...data, items: data.items.map((t) => (t.id === id ? { ...t, status, overdue: status === 'done' ? false : t.overdue } : t)) });
      }
      return { snapshots };
    },
    onError: (_e, _v, ctx) => ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: (t) => refresh(t),
  });
}

export function useDeleteTask() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (t: Task) => api<void>(`/tasks/${t.id}`, { method: 'DELETE' }),
    onSuccess: (_v, t) => refresh(t),
  });
}
