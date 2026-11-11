import { useEffect, useState, type FormEvent } from 'react';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  taskInputSchema,
  taskPriorityLabel,
  taskStatusLabel,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '@mybusiness/shared';
import { Dialog } from '../../components/Dialog';
import { Field, Segmented, Select, TextArea, TextInput } from '../../components/form';
import { Icon } from '../../components/Icon';
import { Avatar, Button, cx } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { useMembers } from '../calendar/api';
import { CustomerPicker, type PickedCustomer } from '../quotations/CustomerPicker';
import { useDeleteTask, useSaveTask } from './api';

interface FormState {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  assignedTo: string;
  customer: { id: string; name: string } | null;
}

const initial = (t: Task | undefined, myId: string, customer?: PickedCustomer | null): FormState =>
  t
    ? {
        title: t.title,
        description: t.description ?? '',
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate ?? '',
        assignedTo: t.assignedTo ?? '',
        customer: t.customer,
      }
    : { title: '', description: '', status: 'todo', priority: 'medium', dueDate: '', assignedTo: myId, customer: customer ? { id: customer.id, name: customer.name } : null };

/** Add or edit a task. */
export function TaskDialog({
  open,
  task,
  myId,
  defaultCustomer,
  onClose,
}: {
  open: boolean;
  task?: Task;
  myId: string;
  defaultCustomer?: PickedCustomer | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => initial(task, myId, defaultCustomer));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: members } = useMembers();
  const save = useSaveTask();
  const del = useDeleteTask();

  useEffect(() => {
    if (open) {
      setForm(initial(task, myId, defaultCustomer));
      setErrors({});
      setFormError(null);
      setConfirmDelete(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, defaultCustomer?.id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors(({ [k]: _d, ...rest }) => rest);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const input = {
      title: form.title,
      description: form.description,
      status: form.status,
      priority: form.priority,
      dueDate: form.dueDate || null,
      assignedTo: form.assignedTo || null,
      customerId: form.customer?.id ?? null,
    };
    const check = taskInputSchema.safeParse(input);
    if (!check.success) {
      const fe: Record<string, string> = {};
      for (const i of check.error.issues) fe[String(i.path[0])] ??= i.message;
      return setErrors(fe);
    }
    try {
      await save.mutateAsync({ id: task?.id, data: input });
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'validation') setErrors(err.fields);
      setFormError(errorMessage(err));
    }
  }

  async function remove() {
    if (!task) return;
    try {
      await del.mutateAsync(task);
      onClose();
    } catch (err) {
      setConfirmDelete(false);
      setFormError(errorMessage(err));
    }
  }

  return (
    <>
      <Dialog
        open={open && !picking && !confirmDelete}
        title={task ? 'Edit task' : 'New task'}
        onClose={onClose}
        footer={
          <>
            {task && (
              <Button variant="ghost" className="text-danger hover:bg-danger-soft" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
            <div className="grow" />
            <Button onClick={onClose} className="max-md:h-11 max-md:grow">
              Cancel
            </Button>
            <Button type="submit" form="task-form" variant="primary" disabled={save.isPending} className="max-md:h-11 max-md:grow">
              {save.isPending ? 'Saving…' : task ? 'Save changes' : 'Add task'}
            </Button>
          </>
        }
      >
        <form id="task-form" onSubmit={submit} noValidate className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {formError && (
            <p role="alert" className="sm:col-span-2 rounded-sm bg-danger-soft text-danger text-sm px-3 py-2">
              {formError}
            </p>
          )}
          <Field label="Task" error={errors.title} className="sm:col-span-2">
            {(a) => <TextInput {...a} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Send revised quote" />}
          </Field>
          <div className="sm:col-span-2">
            <span className="block text-[14px] font-medium text-ink-2 mb-1.5">Priority</span>
            <Segmented
              label="Priority"
              value={form.priority}
              options={TASK_PRIORITIES.map((p) => ({ value: p, label: taskPriorityLabel[p] }))}
              onChange={(v) => set('priority', v)}
            />
          </div>
          <Field label="Deadline" error={errors.dueDate}>
            {(a) => <TextInput {...a} type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />}
          </Field>
          <Field label="Assigned to" error={errors.assignedTo}>
            {(a) => (
              <Select {...a} value={form.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
                <option value="">Unassigned</option>
                {members?.items.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Status">
            {(a) => (
              <Select {...a} value={form.status} onChange={(e) => set('status', e.target.value as TaskStatus)}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {taskStatusLabel[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div>
            <span className="block text-[14px] font-medium text-ink-2 mb-1.5">Related customer</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPicking(true)}
                className={cx('grow min-w-0 flex items-center gap-2 h-11 md:h-9 px-3 rounded-sm border bg-bg text-left cursor-pointer hover:bg-surface-1', errors.customerId ? 'border-danger' : 'border-line-strong')}
              >
                {form.customer ? (
                  <>
                    <Avatar name={form.customer.name} size="sm" />
                    <span className="truncate">{form.customer.name}</span>
                  </>
                ) : (
                  <span className="text-ink-3">None</span>
                )}
              </button>
              {form.customer && (
                <Button variant="ghost" aria-label="Remove customer" className="max-md:size-11 w-9 px-0" onClick={() => set('customer', null)}>
                  <Icon name="close" size={16} />
                </Button>
              )}
            </div>
          </div>
          <Field label="Notes" className="sm:col-span-2">
            {(a) => <TextArea {...a} rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />}
          </Field>
        </form>
      </Dialog>

      <CustomerPicker open={open && picking} onClose={() => setPicking(false)} onPick={(c) => set('customer', { id: c.id, name: c.name })} />

      <Dialog
        open={open && confirmDelete}
        size="sm"
        title="Delete task?"
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <div className="grow" />
            <Button onClick={() => setConfirmDelete(false)} className="max-md:h-11 max-md:grow">
              Keep it
            </Button>
            <Button variant="danger" onClick={remove} disabled={del.isPending} className="max-md:h-11 max-md:grow">
              {del.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-ink-2 leading-relaxed">
          <strong className="font-semibold">{task?.title}</strong> will be removed. To keep a record, mark it Done instead.
        </p>
      </Dialog>
    </>
  );
}
