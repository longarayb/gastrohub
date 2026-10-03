import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, type RouteObject, RouterProvider } from 'react-router';

import { AppLayout, HomePage } from './features/auth/app-layout';
import { ChangePasswordPage } from './features/auth/change-password-page';
import { LoginPage } from './features/auth/login-page';
import { SessionsPage } from './features/auth/sessions-page';
import { SystemStatusPage } from './pages/system-status-page';

/** Rotas (M02 §8, D12). Compartilhadas com os testes (createMemoryRouter). */
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/status', element: <SystemStatusPage /> },
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/conta/senha', element: <ChangePasswordPage /> },
      { path: '/conta/sessoes', element: <SessionsPage /> },
    ],
  },
];

const router = createBrowserRouter(routes);

export function App({ queryClient = new QueryClient() }: { queryClient?: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
