import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';

import { useSession } from './session';

/** Protege rotas: sem sessão, redireciona para /login?next=<rota atual> (M02 §8.2). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) {
    return (
      <p className="p-6 text-slate-500" role="status">
        Carregando…
      </p>
    );
  }
  if (session.isError) {
    return (
      <p className="p-6 text-red-700" role="alert">
        Não foi possível conectar ao servidor.
      </p>
    );
  }
  if (session.data.status !== 'authenticated') {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    const reason = session.data.code;
    return <Navigate to={`/login?next=${next}`} replace state={{ reason }} />;
  }
  return <>{children}</>;
}
