import { useQuery } from '@tanstack/react-query';

import { type ComponentStatus, fetchSystemStatus } from '../lib/system-status';

const LABELS: Record<ComponentStatus, string> = {
  ok: 'Operacional',
  down: 'Indisponível',
  unknown: 'Desconhecido',
};

const BADGE_CLASSES: Record<ComponentStatus, string> = {
  ok: 'bg-emerald-100 text-emerald-800',
  down: 'bg-red-100 text-red-800',
  unknown: 'bg-slate-200 text-slate-700',
};

function StatusRow({ name, status }: { name: string; status: ComponentStatus }) {
  return (
    <li className="flex items-center justify-between py-3">
      <span className="font-medium text-slate-800">{name}</span>
      <span
        className={`rounded-full px-3 py-1 text-sm font-semibold ${BADGE_CLASSES[status]}`}
        data-testid={`status-${name}`}
      >
        {LABELS[status]}
      </span>
    </li>
  );
}

export function SystemStatusPage() {
  const { data, isPending } = useQuery({
    queryKey: ['system-status'],
    queryFn: () => fetchSystemStatus(),
    refetchInterval: 10_000,
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4">
      <h1 className="text-2xl font-bold text-slate-900">GastroHub</h1>
      <p className="mt-1 text-slate-600">Status do sistema</p>

      {isPending || !data ? (
        <p className="mt-6 text-slate-500" role="status">
          Verificando…
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white px-4">
          <StatusRow name="API" status={data.api} />
          <StatusRow name="Banco de dados" status={data.database} />
        </ul>
      )}
    </main>
  );
}
