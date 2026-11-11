import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Button } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { useMe } from '../../lib/session';

/** Shows its children only to a signed-in user; otherwise sends them to sign in and back. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isLoading, error, refetch } = useMe();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-surface-1" aria-busy="true">
        <span className="size-9 rounded-[9px] bg-accent text-white text-sm font-bold flex items-center justify-center">MB</span>
      </div>
    );
  }
  if (error instanceof ApiError && error.status === 401) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  if (!data) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 bg-surface-1 px-4 text-center">
        <p className="font-semibold">Can’t reach the server</p>
        <p className="text-ink-3">Check your connection and try again.</p>
        <Button onClick={() => refetch()}>Try again</Button>
      </div>
    );
  }
  return <>{children}</>;
}
