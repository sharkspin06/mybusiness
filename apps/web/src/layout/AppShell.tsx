import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Icon } from '../components/Icon';
import { Button, cx } from '../components/ui';
import { useSession } from '../lib/session';
import { type Theme, useTheme } from '../lib/theme';
import { CrumbProvider, useCrumbValue } from './crumb';
import { Sidebar } from './Sidebar';
import { crumbTitleOnPhone, detailTitles, hideTabBarOnDetail, mobileAddLinks, mobileParents, mobileTabs, pageTitles } from './nav';

/** "/customers/abc" -> { section: "/customers", isDetail: true } */
function parsePath(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  const section = '/' + (parts[0] ?? '');
  return { section, isDetail: parts.length > 1, title: pageTitles[section] ?? 'My Business' };
}

/**
 * App frame from the approved design:
 * - Desktop (≥1024px): 240px sidebar + 56px top bar + work area (centred, max 1440px).
 * - Tablet (768–1023px): 64px icon rail that opens the full sidebar as an overlay.
 * - Phone (<768px): compact top bar + bottom tab bar (Home, Customers, Quotes, Calendar, More).
 */
export function AppShell() {
  return (
    <CrumbProvider>
      <Frame />
    </CrumbProvider>
  );
}

function Frame() {
  const { pathname } = useLocation();
  const path = parsePath(pathname);
  const crumb = useCrumbValue();
  const [overlayOpen, setOverlayOpen] = useState(false);
  const themeCtl = useTheme();
  const pageRef = useRef<HTMLDivElement>(null);

  // Smooth page change: fade the work area in on every route change (no remount, so page state is kept).
  // Opacity only — a transform here would re-anchor fixed-position dialogs opened during navigation.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    pageRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
  }, [pathname]);

  useEffect(() => {
    document.title = `${path.isDetail && crumb ? crumb : path.title} · My Business`;
  }, [path.title, path.isDetail, crumb]);

  useEffect(() => {
    if (!overlayOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOverlayOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlayOpen]);

  return (
    <div className="h-dvh flex bg-bg">
      {/* Desktop sidebar */}
      <div className="hidden lg:block shrink-0">
        <Sidebar />
      </div>
      {/* Tablet rail */}
      <div className="hidden md:block lg:hidden shrink-0">
        <Sidebar compact onExpand={() => setOverlayOpen(true)} />
      </div>
      {/* Tablet overlay */}
      {overlayOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="no-fx backdrop-in absolute inset-0 bg-black/40" onClick={() => setOverlayOpen(false)} />
          <div className="absolute inset-y-0 left-0 shadow-pop">
            <Sidebar onNavigate={() => setOverlayOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <DesktopTopBar section={path.section} title={path.title} isDetail={path.isDetail} crumb={crumb} themeCtl={themeCtl} />
        <MobileTopBar section={path.section} title={path.title} isDetail={path.isDetail} crumb={crumb} themeCtl={themeCtl} />
        <main className="flex-1 min-h-0 overflow-y-auto">
          <div ref={pageRef} className="w-full max-w-[1440px] mx-auto px-4 py-4 md:px-8 md:pt-7 md:pb-12 flex flex-col gap-5 md:gap-6">
            <Outlet />
          </div>
        </main>
        {!(path.isDetail && hideTabBarOnDetail.includes(path.section)) && <MobileTabBar section={path.section} />}
      </div>
    </div>
  );
}

interface BarProps {
  section: string;
  title: string;
  isDetail: boolean;
  crumb: string | null;
  themeCtl: ReturnType<typeof useTheme>;
}

function themeLabel(theme: Theme) {
  return theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
}

function DesktopTopBar({ section, title, isDetail, crumb, themeCtl }: BarProps) {
  const navigate = useNavigate();
  return (
    <header className="hidden md:flex h-14 shrink-0 items-center gap-3 px-6 border-b border-line">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0">
        {isDetail ? (
          <>
            <Link to={section} className="text-ink-3 hover:text-ink">
              {title}
            </Link>
            <span className="text-ink-4" aria-hidden="true">
              /
            </span>
            <span className="font-semibold truncate">{crumb ?? '…'}</span>
          </>
        ) : (
          <span className="font-semibold">{title}</span>
        )}
      </nav>
      <div className="grow" />
      <label className="relative w-80 max-w-[40vw]">
        <span className="absolute left-2.5 top-[9px] text-ink-3">
          <Icon name="search" />
        </span>
        <input
          type="search"
          placeholder="Search customers, quotes, tasks…"
          aria-label="Search"
          className="w-full h-9 pl-9 pr-14 rounded-sm border border-line bg-surface-1 text-sm placeholder:text-ink-3 focus:bg-bg focus:border-accent"
        />
        <kbd className="absolute right-2 top-2 text-[12px] text-ink-3 border border-line rounded px-1.5 py-0.5 bg-bg font-sans">Ctrl K</kbd>
      </label>
      <Button variant="primary" onClick={() => navigate('/customers?new=1')}>
        <Icon name="plus" />
        New
      </Button>
      <Button variant="ghost" className="w-9 px-0" aria-label={themeLabel(themeCtl.theme)} title={themeLabel(themeCtl.theme)} onClick={themeCtl.toggle}>
        <Icon name={themeCtl.theme === 'dark' ? 'sun' : 'moon'} />
      </Button>
      <Button variant="ghost" className="w-9 px-0" aria-label="Notifications">
        <Icon name="bell" />
      </Button>
    </header>
  );
}

function MobileTopBar({ section, title, isDetail, crumb, themeCtl }: BarProps) {
  const { business } = useSession();
  const parent = isDetail ? section : mobileParents[section];
  const addLink = isDetail ? undefined : mobileAddLinks[section];
  return (
    <header className="md:hidden h-14 shrink-0 flex items-center gap-1 px-1.5 border-b border-line-soft bg-bg">
      {parent ? (
        <Link to={parent} aria-label="Back" className="size-11 rounded-md flex items-center justify-center hover:bg-surface-2">
          <Icon name="back" size={22} />
        </Link>
      ) : (
        <span className="size-11 flex items-center justify-center" aria-hidden="true">
          <span className="size-[30px] rounded-lg bg-accent text-white text-xs font-bold flex items-center justify-center">
            {business.name
              .split(/\s+/)
              .map((w) => w[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </span>
        </span>
      )}
      <h1 className="grow pl-1 text-[18px] font-semibold truncate">{isDetail ? ((crumbTitleOnPhone.includes(section) && crumb) || detailTitles[section] || title) : title}</h1>
      <button type="button" aria-label="Search" className="size-11 rounded-md flex items-center justify-center hover:bg-surface-2 cursor-pointer">
        <Icon name="search" size={22} />
      </button>
      <button
        type="button"
        aria-label={themeLabel(themeCtl.theme)}
        onClick={themeCtl.toggle}
        className="size-11 rounded-md flex items-center justify-center hover:bg-surface-2 cursor-pointer"
      >
        <Icon name={themeCtl.theme === 'dark' ? 'sun' : 'moon'} size={22} />
      </button>
      {addLink && (
        <Link to={addLink} aria-label="Add" className="size-11 rounded-md flex items-center justify-center text-accent hover:bg-surface-2">
          <Icon name="plus" size={22} />
        </Link>
      )}
    </header>
  );
}

function MobileTabBar({ section }: { section: string }) {
  return (
    <nav
      aria-label="Main"
      className="md:hidden shrink-0 flex border-t border-line bg-bg px-1 pt-1"
      style={{ paddingBottom: 'max(4px, env(safe-area-inset-bottom))' }}
    >
      {mobileTabs.map((tab) => {
        const active = tab.matches.includes(section);
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'flex-1 h-14 flex flex-col items-center justify-center gap-1 text-[12px] font-medium',
              active ? 'text-accent' : 'text-ink-3',
            )}
          >
            <Icon name={tab.icon} size={22} />
            {tab.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
