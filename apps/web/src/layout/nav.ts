import type { IconName } from '../components/Icon';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

/** Main sections, in sidebar order. */
export const mainNav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/customers', label: 'Customers', icon: 'customers' },
  { to: '/quotations', label: 'Quotations', icon: 'quotations' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/tasks', label: 'Tasks', icon: 'tasks' },
  { to: '/documents', label: 'Documents', icon: 'documents' },
];

export const settingsNav: NavItem = { to: '/settings', label: 'Settings', icon: 'settings' };

/** Phone bottom tab bar: 4 sections + More (Tasks, Documents, Settings live under More). */
export const mobileTabs: (NavItem & { matches: string[] })[] = [
  { to: '/', label: 'Home', icon: 'dashboard', matches: ['/'] },
  { to: '/customers', label: 'Customers', icon: 'customers', matches: ['/customers'] },
  { to: '/quotations', label: 'Quotes', icon: 'quotations', matches: ['/quotations'] },
  { to: '/calendar', label: 'Calendar', icon: 'calendar', matches: ['/calendar'] },
  { to: '/more', label: 'More', icon: 'menu', matches: ['/more', '/tasks', '/documents', '/settings'] },
];

export const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/customers': 'Customers',
  '/quotations': 'Quotations',
  '/calendar': 'Calendar',
  '/tasks': 'Tasks',
  '/documents': 'Documents',
  '/settings': 'Settings',
  '/more': 'More',
};

/** On phones, these pages show a back arrow to their parent instead of the logo. */
export const mobileParents: Record<string, string> = {
  '/tasks': '/more',
  '/documents': '/more',
  '/settings': '/more',
};

/** Phone top bar "+" button: where it goes in each section (hidden where there is nothing to add yet). */
export const mobileAddLinks: Record<string, string> = {
  '/customers': '/customers?new=1',
  '/quotations': '/quotations/new',
  '/calendar': '/calendar?new=1',
  '/tasks': '/tasks?new=1',
};

/** Singular titles for detail pages on phones (e.g. /customers/:id). */
export const detailTitles: Record<string, string> = {
  '/customers': 'Customer',
  '/quotations': 'Quotation',
  '/settings': 'Settings',
};

/** Detail pages whose phone title is the page's own name (e.g. "Your account") rather than a fixed word. */
export const crumbTitleOnPhone = ['/settings'];

/** Detail pages that bring their own bottom action bar on phones, so the tab bar is hidden. */
export const hideTabBarOnDetail = ['/quotations'];
