import { Link, Outlet, useNavigate } from 'react-router';

import { useMyCompanies } from '../organization/organization-api';
import { RequireAuth } from './require-auth';
import { useLogout, useSession } from './session';

/** Moldura mínima da área autenticada: nome, links da conta e "Sair". Sem dashboard. */
export function AppLayout() {
  return (
    <RequireAuth>
      <Shell />
    </RequireAuth>
  );
}

function Shell() {
  const session = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const companies = useMyCompanies();
  const data = session.data?.status === 'authenticated' ? session.data.data : undefined;
  const user = data?.user;
  const activeCompany = data?.activeCompany ?? null;
  const canSwitch = (companies.data?.data.length ?? 0) >= 2;

  const onLogout = () =>
    logout.mutate(undefined, { onSettled: () => void navigate('/login', { replace: true }) });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="font-bold text-slate-900">
            GastroHub
          </Link>
          {activeCompany ? (
            <Link
              to="/empresa"
              className="rounded bg-slate-100 px-2 py-1 text-sm text-slate-800"
              data-testid="active-company"
            >
              {activeCompany.tradeName}
            </Link>
          ) : null}
          {canSwitch ? (
            <Link to="/selecionar-empresa" className="text-sm text-slate-600 hover:underline">
              Trocar empresa
            </Link>
          ) : null}
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/conta/senha" className="text-slate-700 hover:underline">
            Trocar senha
          </Link>
          <Link to="/conta/sessoes" className="text-slate-700 hover:underline">
            Sessões
          </Link>
          <span className="text-slate-500">{user?.name}</span>
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1 text-slate-800"
            onClick={onLogout}
            disabled={logout.isPending}
          >
            Sair
          </button>
        </nav>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

export function HomePage() {
  const session = useSession();
  const data = session.data?.status === 'authenticated' ? session.data.data : undefined;
  return (
    <section>
      <h1 className="text-2xl font-bold text-slate-900">Olá, {data?.user.name}</h1>
      <p className="mt-2 text-slate-600">
        {data?.activeCompany
          ? `Você está em ${data.activeCompany.tradeName}.`
          : 'Use o menu acima para gerenciar sua conta.'}
      </p>
    </section>
  );
}
