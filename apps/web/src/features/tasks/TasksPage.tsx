import { useState, type DragEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import {
  TASK_DUE_FILTERS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  addDays,
  isoToDisplay,
  taskPriorityLabel,
  taskStatusLabel,
  todayInSingapore,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '@mybusiness/shared';
import { Segmented } from '../../components/form';
import { Icon } from '../../components/Icon';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, cx, type BadgeTone } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useMembers } from '../calendar/api';
import { useCustomer } from '../customers/api';
import { useSetTaskStatus, useTasks, type TaskFilters } from './api';
import { TaskDialog } from './TaskDialog';

const priorityTone: Record<TaskPriority, BadgeTone> = { high: 'red', medium: 'amber', low: 'grey' };
const statusTone: Record<TaskStatus, BadgeTone> = { todo: 'grey', in_progress: 'blue', done: 'green' };
const dueLabels = { overdue: 'Overdue', today: 'Due today', week: 'Next 7 days', none: 'No deadline' } as const;

/** "Today", "Tomorrow", "09/11/2026 · overdue"… */
function dueText(t: Task, today: string): { text: string; tone: 'danger' | 'normal' | 'muted' } {
  if (!t.dueDate) return { text: 'No deadline', tone: 'muted' };
  if (t.overdue) return { text: `${isoToDisplay(t.dueDate)} · overdue`, tone: 'danger' };
  if (t.status === 'done') return { text: isoToDisplay(t.dueDate), tone: 'muted' };
  if (t.dueDate === today) return { text: 'Today', tone: 'normal' };
  if (t.dueDate === addDays(today, 1)) return { text: 'Tomorrow', tone: 'normal' };
  return { text: isoToDisplay(t.dueDate), tone: 'normal' };
}
const dueClass = { danger: 'text-danger font-medium', normal: 'text-ink-2', muted: 'text-ink-3' };

/** Tick box. 44px tap area on phones; ticking marks the task done, unticking reopens it. */
function Check({ t, onToggle }: { t: Task; onToggle: (t: Task) => void }) {
  const done = t.status === 'done';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Reopen “${t.title}”` : `Mark “${t.title}” done`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(t);
      }}
      className="size-11 md:size-8 -m-2.5 md:-m-1.5 shrink-0 flex items-center justify-center rounded-md cursor-pointer hover:bg-surface-2"
    >
      <span className={cx('size-[22px] md:size-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center', done ? 'bg-accent border-accent text-white' : 'border-ink-4 bg-bg')}>
        {done && (
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
      </span>
    </button>
  );
}

/** Filter control styled as a chip: dashed when unset, solid when set. */
function ChipSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cx(
        'h-[30px] pl-3 pr-7 rounded-full text-[14px] font-medium cursor-pointer appearance-none bg-no-repeat bg-[length:12px] bg-[right_10px_center]',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235B6474' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")]",
        value ? 'border border-accent bg-accent-soft text-accent-ink' : 'border border-dashed border-line-strong bg-bg text-ink-2',
      )}
    >
      {children}
    </select>
  );
}

export function TasksPage() {
  const [params, setParams] = useSearchParams();
  const { user } = useSession();
  const today = todayInSingapore();
  const view = params.get('view') === 'board' ? 'board' : 'list';
  const status = ['open', 'done', 'all'].includes(params.get('status') ?? '') ? params.get('status')! : 'open';
  const assignee = params.get('assignee') ?? '';
  const priority = (TASK_PRIORITIES as readonly string[]).includes(params.get('priority') ?? '') ? params.get('priority')! : '';
  const due = (TASK_DUE_FILTERS as readonly string[]).includes(params.get('due') ?? '') ? params.get('due')! : '';
  const editId = params.get('task');
  const creating = params.get('new') === '1';

  const update = (changes: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v === null || v === '') next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );

  // The board always shows all three columns, so it ignores the Open/Done filter.
  const filters: TaskFilters = { status: view === 'board' ? 'all' : status, assignee, priority, due };
  const { data, isLoading, isError, error, refetch, isFetching } = useTasks(filters);
  const { data: members } = useMembers();
  const setStatus = useSetTaskStatus();
  const toggle = (t: Task) => setStatus.mutate({ id: t.id, status: t.status === 'done' ? 'todo' : 'done' });
  const open = (t: Task) => update({ task: t.id });
  const prefill = useCustomer(creating ? (params.get('customer') ?? '') : '');

  const items = data?.items ?? [];
  const editing = items.find((t) => t.id === editId);
  const counts = data?.counts;
  const filtered = !!(assignee || priority || due);

  // Phone shortcuts from the design: My tasks / All / High priority / Done.
  const pill =
    status === 'done' && !assignee && !priority && !due
      ? 'done'
      : status === 'open' && assignee === 'me' && !priority && !due
        ? 'mine'
        : status === 'open' && priority === 'high' && !assignee && !due
          ? 'high'
          : status === 'open' && !filtered
            ? 'all'
            : '';
  const pills: [string, string, Record<string, string | null>][] = [
    ['mine', 'My tasks', { status: null, assignee: 'me', priority: null, due: null }],
    ['all', 'All', { status: null, assignee: null, priority: null, due: null }],
    ['high', 'High priority', { status: null, assignee: null, priority: 'high', due: null }],
    ['done', 'Done', { status: 'done', assignee: null, priority: null, due: null }],
  ];

  const newTask = () => update({ new: '1' });
  const subtitle = counts ? `${counts.open} open${counts.overdue ? ` · ${counts.overdue} overdue` : ''}` : undefined;

  const body = isError ? (
    <EmptyState title="Could not load tasks" body={errorMessage(error)} action={<Button onClick={() => refetch()}>Try again</Button>} />
  ) : isLoading ? (
    <Card className="p-6 text-ink-3">Loading tasks…</Card>
  ) : null;

  return (
    <>
      <div className="hidden md:block">
        <PageHeader
          title="Tasks"
          subtitle={subtitle}
          actions={
            <>
              <Segmented label="View" value={view} options={[{ value: 'list', label: 'List' }, { value: 'board', label: 'Board' }]} onChange={(v) => update({ view: v === 'list' ? null : v })} />
              <Button variant="primary" onClick={newTask}>
                <Icon name="plus" />
                New task
              </Button>
            </>
          }
        />
      </div>

      {/* Filters: desktop chips */}
      <div className="hidden md:flex flex-wrap items-center gap-2">
        {view === 'list' && (
          <Segmented
            label="Show"
            value={status}
            options={[
              { value: 'open', label: `Open${counts ? ` ${counts.open}` : ''}` },
              { value: 'done', label: `Done${counts ? ` ${counts.done}` : ''}` },
              { value: 'all', label: 'All' },
            ]}
            onChange={(v) => update({ status: v === 'open' ? null : v })}
          />
        )}
        <ChipSelect label="Assignee" value={assignee} onChange={(v) => update({ assignee: v })}>
          <option value="">+ Assignee</option>
          <option value="me">Assigned to me</option>
          <option value="none">Unassigned</option>
          {members?.items
            .filter((m) => m.id !== user.id)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </ChipSelect>
        <ChipSelect label="Priority" value={priority} onChange={(v) => update({ priority: v })}>
          <option value="">+ Priority</option>
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {taskPriorityLabel[p]} priority
            </option>
          ))}
        </ChipSelect>
        <ChipSelect label="Due date" value={due} onChange={(v) => update({ due: v })}>
          <option value="">+ Due date</option>
          {TASK_DUE_FILTERS.map((d) => (
            <option key={d} value={d}>
              {dueLabels[d]}
            </option>
          ))}
        </ChipSelect>
        {filtered && (
          <button type="button" onClick={() => update({ assignee: null, priority: null, due: null })} className="h-[30px] px-2 text-[14px] text-ink-3 hover:text-ink cursor-pointer">
            Clear filters
          </button>
        )}
      </div>

      {/* Filters: phone pills */}
      <div className="md:hidden -mx-4 px-4 flex gap-2 overflow-x-auto">
        {pills.map(([key, label, changes]) => (
          <button
            key={key}
            type="button"
            aria-pressed={pill === key}
            onClick={() => update({ ...changes, view: null })}
            className={cx('h-9 px-3.5 rounded-full text-sm font-medium whitespace-nowrap border cursor-pointer', pill === key ? 'bg-ink text-bg border-ink' : 'bg-bg text-ink border-line-strong')}
          >
            {label}
          </button>
        ))}
      </div>

      {body ??
        (items.length === 0 ? (
          <EmptyState
            title={filtered || status !== 'open' ? 'No matching tasks' : 'Nothing to do'}
            body={filtered || status !== 'open' ? 'Try a different filter.' : 'Add a task to keep track of follow-ups, orders and errands.'}
            action={
              <Button variant="primary" onClick={newTask}>
                New task
              </Button>
            }
          />
        ) : (
          <div className={cx(isFetching && 'opacity-70 transition-opacity')}>
            {view === 'board' ? (
              <div className="hidden md:block">
                <Board items={items} today={today} onOpen={open} onMove={(t, s) => setStatus.mutate({ id: t.id, status: s })} />
              </div>
            ) : (
              <Card className="hidden md:block overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-sm border-collapse">
                    <thead>
                      <tr className="bg-row-hover border-b border-line text-left text-xs text-ink-3">
                        <th className="w-11 px-3 py-2.5" aria-label="Done" />
                        <th className="px-3 py-2.5 font-medium">Task</th>
                        <th className="px-3 py-2.5 font-medium">Priority</th>
                        <th className="px-3 py-2.5 font-medium">Deadline</th>
                        <th className="px-3 py-2.5 font-medium">Assignee</th>
                        <th className="px-3 py-2.5 font-medium">Related</th>
                        <th className="px-3 py-2.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((t) => {
                        const d = dueText(t, today);
                        return (
                          <tr key={t.id} onClick={() => open(t)} className="border-b border-line-soft last:border-0 hover:bg-row-hover cursor-pointer">
                            <td className="px-3 py-3">
                              <Check t={t} onToggle={toggle} />
                            </td>
                            <td className={cx('px-3 py-3 font-medium', t.status === 'done' && 'text-ink-3 line-through')}>
                              <button type="button" onClick={(e) => (e.stopPropagation(), open(t))} className="text-left hover:underline cursor-pointer">
                                {t.title}
                              </button>
                            </td>
                            <td className="px-3 py-3">
                              <Badge tone={priorityTone[t.priority]}>{taskPriorityLabel[t.priority]}</Badge>
                            </td>
                            <td className={cx('px-3 py-3 whitespace-nowrap', dueClass[d.tone])}>{d.text}</td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              {t.assignee ? (
                                <span className="flex items-center gap-2">
                                  <Avatar name={t.assignee.name} size="sm" />
                                  {t.assignee.name}
                                </span>
                              ) : (
                                <span className="text-ink-3">Unassigned</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-ink-3 whitespace-nowrap">{t.customer?.name ?? '—'}</td>
                            <td className="px-3 py-3">
                              <Badge tone={statusTone[t.status]}>{taskStatusLabel[t.status]}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Phone: rows (board isn't offered on phones) */}
            <div className="md:hidden -mx-4 border-t border-line-soft">
              {items
                .filter((t) => view === 'list' || status === 'all' || (status === 'done' ? t.status === 'done' : t.status !== 'done'))
                .map((t) => {
                  const d = dueText(t, today);
                  return (
                    <div key={t.id} className="flex items-start gap-3 min-h-[72px] px-4 py-3.5 border-b border-line-soft">
                      <Check t={t} onToggle={toggle} />
                      <button type="button" onClick={() => open(t)} className="grow min-w-0 flex flex-col gap-1.5 text-left cursor-pointer">
                        <span className={cx('text-[16px] font-medium', t.status === 'done' && 'line-through text-ink-3')}>{t.title}</span>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Badge tone={priorityTone[t.priority]}>{taskPriorityLabel[t.priority]}</Badge>
                          <span className={cx('text-[14px]', dueClass[d.tone])}>{d.text}</span>
                          {t.assignee && <span className="text-[14px] text-ink-3">· {t.assignee.name}</span>}
                          {t.status === 'in_progress' && <span className="text-[14px] text-info">· In progress</span>}
                        </span>
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}

      {view === 'board' && !body && items.length > 0 && <p className="hidden md:block text-[14px] text-ink-3">Drag a card to another column to change its status.</p>}

      <TaskDialog open={!!editing} task={editing} myId={user.id} onClose={() => update({ task: null })} />
      <TaskDialog
        open={creating && (!params.get('customer') || !prefill.isLoading)}
        myId={user.id}
        defaultCustomer={prefill.data ?? null}
        onClose={() => update({ new: null, customer: null })}
      />
    </>
  );
}

/** Kanban board: To do / In progress / Done. Drag cards between columns (mouse); click a card to edit. */
function Board({ items, today, onOpen, onMove }: { items: Task[]; today: string; onOpen: (t: Task) => void; onMove: (t: Task, s: TaskStatus) => void }) {
  const [over, setOver] = useState<TaskStatus | null>(null);
  const drop = (e: DragEvent, s: TaskStatus) => {
    e.preventDefault();
    setOver(null);
    const t = items.find((x) => x.id === e.dataTransfer.getData('text/plain'));
    if (t && t.status !== s) onMove(t, s);
  };
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4 items-start">
      {TASK_STATUSES.map((s) => {
        const list = items.filter((t) => t.status === s);
        return (
          <section
            key={s}
            aria-label={taskStatusLabel[s]}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(s);
            }}
            onDragLeave={() => setOver((o) => (o === s ? null : o))}
            onDrop={(e) => drop(e, s)}
            className={cx('rounded-md p-3 flex flex-col gap-2.5 min-h-40 transition-colors', over === s ? 'bg-accent-soft' : 'bg-surface-1')}
          >
            <div className="flex items-center gap-2 px-1">
              <h2 className="text-sm font-semibold">{taskStatusLabel[s]}</h2>
              <span className="text-[14px] text-ink-3">{list.length}</span>
            </div>
            {list.map((t) => {
              const d = dueText(t, today);
              return (
                <button
                  key={t.id}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', t.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={() => onOpen(t)}
                  className="bg-bg border border-line rounded-md p-3 flex flex-col gap-2.5 text-left cursor-grab active:cursor-grabbing hover:border-line-strong"
                >
                  <span className={cx('text-sm font-medium', t.status === 'done' && 'line-through text-ink-3')}>{t.title}</span>
                  {t.customer && <span className="text-xs text-ink-3 -mt-1.5">{t.customer.name}</span>}
                  <span className="flex items-center gap-2">
                    <Badge tone={priorityTone[t.priority]}>{taskPriorityLabel[t.priority]}</Badge>
                    <span className={cx('grow text-xs', dueClass[d.tone])}>{d.text}</span>
                    {t.assignee && <Avatar name={t.assignee.name} size="sm" />}
                  </span>
                </button>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
