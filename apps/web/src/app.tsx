import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, type RouteObject, RouterProvider } from 'react-router';

import { AppLayout, HomePage } from './features/auth/app-layout';
import { ChangePasswordPage } from './features/auth/change-password-page';
import { LoginPage } from './features/auth/login-page';
import { SessionsPage } from './features/auth/sessions-page';
import { CompanyPage } from './features/organization/company-page';
import { RequireCompany } from './features/organization/require-company';
import { SelectCompanyPage } from './features/organization/select-company-page';
import { SystemStatusPage } from './pages/system-status-page';

/** Rotas (M02 §8 / D12; M03 §10). Compartilhadas com os testes (createMemoryRouter). */
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/status', element: <SystemStatusPage /> },
  {
    element: <AppLayout />,
    children: [
      // Rotas de tenant: exigem empresa ativa.
      {
        path: '/',
        element: (
          <RequireCompany>
            <HomePage />
          </RequireCompany>
        ),
      },
      {
        path: '/empresa',
        element: (
          <RequireCompany>
            <CompanyPage />
          </RequireCompany>
        ),
      },
      // Rotas da conta e seleção: não exigem empresa.
      { path: '/selecionar-empresa', element: <SelectCompanyPage /> },
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
