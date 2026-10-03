import { type ReactNode } from 'react';
import { Navigate } from 'react-router';

import { useSession } from '../auth/session';

/** Rotas de tenant: sem empresa ativa, vai para o seletor (M03 §10). Usado dentro de RequireAuth. */
export function RequireCompany({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.data?.status !== 'authenticated') return null;
  if (!session.data.data.activeCompany) {
    return (
      <Navigate
        to="/selecionar-empresa"
        replace
        state={{ revoked: session.data.companyRevoked === true }}
      />
    );
  }
  return <>{children}</>;
}
