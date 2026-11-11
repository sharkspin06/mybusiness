import type { ReactNode } from 'react';
import { EmptyState, PageHeader } from '../components/ui';

/** Stand-in for sections that are built one at a time in later steps. */
export function Placeholder({
  title,
  subtitle,
  body,
  actions,
  emptyTitle,
}: {
  title: string;
  subtitle?: string;
  body: string;
  actions?: ReactNode;
  emptyTitle?: string;
}) {
  return (
    <>
      <div className="hidden md:block">
        <PageHeader title={title} subtitle={subtitle} actions={actions} />
      </div>
      <EmptyState title={emptyTitle ?? `${title} is coming next`} body={body} />
    </>
  );
}
