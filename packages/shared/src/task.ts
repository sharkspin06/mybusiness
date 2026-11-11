import { z } from 'zod';

export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const taskStatusLabel: Record<TaskStatus, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' };

export const TASK_PRIORITIES = ['high', 'medium', 'low'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const taskPriorityLabel: Record<TaskPriority, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export const TASK_DUE_FILTERS = ['overdue', 'today', 'week', 'none'] as const;
export type TaskDueFilter = (typeof TASK_DUE_FILTERS)[number];

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, 'Enter a task').max(300),
  description: z
    .string()
    .trim()
    .max(5000)
    .nullish()
    .transform((v) => (v ? v : null)),
  status: z.enum(TASK_STATUSES).default('todo'),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date')
    .nullish()
    .transform((v) => v ?? null),
  assignedTo: z.string().uuid().nullish().transform((v) => v ?? null),
  customerId: z.string().uuid().nullish().transform((v) => v ?? null),
});
export type TaskInput = z.input<typeof taskInputSchema>;
export type TaskData = z.output<typeof taskInputSchema>;

export interface Task extends TaskData {
  id: string;
  overdue: boolean;
  assignee: { id: string; name: string } | null;
  customer: { id: string; name: string } | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskListResponse {
  items: Task[];
  counts: { open: number; overdue: number; done: number };
}

export interface TaskSummary {
  open: number;
  overdue: number;
  dueToday: number;
  /** Open tasks assigned to the signed-in user. */
  mine: number;
}
