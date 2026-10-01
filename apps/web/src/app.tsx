import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';

import { SystemStatusPage } from './pages/system-status-page';

const router = createBrowserRouter([{ path: '/', element: <SystemStatusPage /> }]);

export function App({ queryClient = new QueryClient() }: { queryClient?: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
