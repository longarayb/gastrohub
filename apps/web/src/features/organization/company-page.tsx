import { formatCnpj, useBranches, useCompany } from './organization-api';

/** Empresa ativa e filiais, somente leitura (M03 §10; edição depende de permissões, M04). */
export function CompanyPage() {
  const company = useCompany();
  const branches = useBranches();

  if (company.isPending || branches.isPending) {
    return (
      <p className="text-slate-500" role="status">
        Carregando…
      </p>
    );
  }
  if (company.isError || branches.isError) {
    return (
      <p className="text-red-700" role="alert">
        Não foi possível carregar os dados da empresa.
      </p>
    );
  }

  return (
    <section>
      <h1 className="text-2xl font-bold text-slate-900">{company.data.tradeName}</h1>
      <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-slate-500">Razão social</dt>
        <dd className="text-slate-900">{company.data.legalName}</dd>
        <dt className="text-slate-500">CNPJ</dt>
        <dd className="text-slate-900" data-testid="company-cnpj">
          {formatCnpj(company.data.taxId)}
        </dd>
      </dl>

      <h2 className="mt-8 text-lg font-semibold text-slate-900">Filiais</h2>
      <ul className="mt-3 divide-y divide-slate-200 rounded border border-slate-200 bg-white">
        {branches.data.data.map((branch) => (
          <li key={branch.id} className="p-4 text-sm">
            <p className="font-medium text-slate-900">
              {branch.name}
              {branch.status === 'inactive' ? (
                <span className="ml-2 text-xs text-slate-500">(inativa)</span>
              ) : null}
            </p>
            <p className="text-slate-500">
              {[branch.address.city, branch.address.state].filter(Boolean).join('/') ||
                'Endereço não informado'}{' '}
              · fuso {branch.timezone} · virada do dia às {branch.businessDayCutoff}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
