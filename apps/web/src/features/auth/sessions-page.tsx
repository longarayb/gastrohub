import { useCsrfRecovery, useRevokeOtherSessions, useRevokeSession, useSessions } from './session';

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function SessionsPage() {
  const sessions = useSessions();
  const revokeOne = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const recoverCsrf = useCsrfRecovery();

  const failed = revokeOne.isError || revokeOthers.isError;

  return (
    <section>
      <h1 className="text-2xl font-bold text-slate-900">Sessões ativas</h1>
      <p className="mt-1 text-sm text-slate-600">
        Dispositivos conectados à sua conta. Encerre os que você não reconhece.
      </p>

      {sessions.isPending ? (
        <p className="mt-6 text-slate-500" role="status">
          Carregando…
        </p>
      ) : sessions.isError ? (
        <p className="mt-6 text-red-700" role="alert">
          Não foi possível carregar as sessões.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-200 rounded border border-slate-200 bg-white">
          {sessions.data.data.map((session) => (
            <li key={session.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium text-slate-800">
                  {session.userAgent ?? 'Dispositivo desconhecido'}
                  {session.current ? (
                    <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                      Esta sessão
                    </span>
                  ) : null}
                </p>
                <p className="text-slate-500">
                  {session.ip ?? 'IP desconhecido'} · último uso{' '}
                  {dateTime.format(new Date(session.lastSeenAt))}
                </p>
              </div>
              {session.current ? null : (
                <button
                  type="button"
                  className="shrink-0 rounded border border-slate-300 px-3 py-1 text-sm"
                  disabled={revokeOne.isPending}
                  onClick={() => revokeOne.mutate(session.id, { onError: recoverCsrf })}
                >
                  Encerrar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {failed ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          Não foi possível encerrar. Tente novamente.
        </p>
      ) : null}

      <button
        type="button"
        className="mt-6 rounded bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-60"
        disabled={revokeOthers.isPending}
        onClick={() => revokeOthers.mutate(undefined, { onError: recoverCsrf })}
      >
        Encerrar todas as outras sessões
      </button>
    </section>
  );
}
