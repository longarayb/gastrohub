import { useLocation, useNavigate } from 'react-router';

import { useCsrfRecovery } from '../auth/session';
import { useMyCompanies, useSwitchCompany } from './organization-api';

export function SelectCompanyPage() {
  const companies = useMyCompanies();
  const switchCompany = useSwitchCompany();
  const recoverCsrf = useCsrfRecovery();
  const navigate = useNavigate();
  const location = useLocation();
  const revoked = (location.state as { revoked?: boolean } | null)?.revoked === true;

  const choose = (companyId: string) =>
    switchCompany.mutate(companyId, {
      onSuccess: () => void navigate('/', { replace: true }),
      onError: recoverCsrf,
    });

  return (
    <section>
      <h1 className="text-2xl font-bold text-slate-900">Selecionar empresa</h1>

      {revoked ? (
        <p className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-900" role="status">
          Seu acesso a esta empresa foi encerrado.
        </p>
      ) : null}

      {companies.isPending ? (
        <p className="mt-6 text-slate-500" role="status">
          Carregando…
        </p>
      ) : companies.isError ? (
        <p className="mt-6 text-red-700" role="alert">
          Não foi possível carregar suas empresas.
        </p>
      ) : companies.data.data.length === 0 ? (
        <p className="mt-6 text-slate-700" role="status">
          Você ainda não está vinculado a nenhuma empresa. Fale com o responsável.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-200 rounded border border-slate-200 bg-white">
          {companies.data.data.map((company) => (
            <li key={company.id} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium text-slate-900">{company.tradeName}</p>
                <p className="text-sm text-slate-500">{company.legalName}</p>
              </div>
              {company.active ? (
                <span className="rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-800">
                  Empresa ativa
                </span>
              ) : (
                <button
                  type="button"
                  className="rounded bg-slate-900 px-3 py-1 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={switchCompany.isPending}
                  onClick={() => choose(company.id)}
                >
                  Entrar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {switchCompany.isError ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          Não foi possível entrar nesta empresa.
        </p>
      ) : null}
    </section>
  );
}
