import { createBrowserRouter } from 'react-router';
import { AppShell } from './layout/AppShell';
import { LoginPage, SignupPage } from './features/auth/AuthPages';
import { RequireAuth } from './features/auth/RequireAuth';
import { CustomersPage } from './features/customers/CustomersPage';
import { CustomerProfile } from './features/customers/CustomerProfile';
import { QuotationsPage } from './features/quotations/QuotationsPage';
import { QuotationBuilder } from './features/quotations/QuotationBuilder';
import { CalendarPage } from './features/calendar/CalendarPage';
import { TasksPage } from './features/tasks/TasksPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { InvitePage, ResetPage } from './features/auth/LinkPages';
import { Dashboard } from './pages/Dashboard';
import { More } from './pages/More';
import { Placeholder } from './pages/Placeholder';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/invite/:token', element: <InvitePage /> },
  { path: '/reset/:token', element: <ResetPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'customers', element: <CustomersPage /> },
      { path: 'customers/:id', element: <CustomerProfile /> },
      { path: 'quotations', element: <QuotationsPage /> },
      { path: 'quotations/new', element: <QuotationBuilder /> },
      { path: 'quotations/:id', element: <QuotationBuilder /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'documents', element: <Placeholder title="Documents" body="Docs, tables, notes and files for your business." /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/:section', element: <SettingsPage /> },
      { path: 'more', element: <More /> },
      { path: '*', element: <Placeholder title="Page not found" emptyTitle="Page not found" body="This page does not exist. Use the menu to go back." /> },
    ],
  },
]);
