import { PASSWORD_MIN_LENGTH } from '@gastrohub/contracts';
import { type FormEvent, useState } from 'react';

import { ApiError, NetworkError } from './api-client';
import { useChangePassword, useCsrfRecovery } from './session';

function errorMessage(error: unknown): string {
  if (error instanceof NetworkError) return 'Não foi possível conectar ao servidor.';
  if (error instanceof ApiError) {
    if (error.code === 'invalid_current_password') return 'Senha atual incorreta.';
    if (error.code === 'password_reused') return 'A nova senha deve ser diferente da atual.';
    if (error.code === 'csrf_failed') return 'Tente novamente.';
    if (error.status === 429) return 'Muitas requisições. Tente novamente mais tarde.';
    if (error.fieldErrors.length > 0) return error.fieldErrors.map((e) => e.message).join(' ');
  }
  return 'Não foi possível alterar a senha.';
}

export function ChangePasswordPage() {
  const change = useChangePassword();
  const recoverCsrf = useCsrfRecovery();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [localError, setLocalError] = useState<string>();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setLocalError(undefined);
    if (next !== confirmation) {
      setLocalError('A confirmação não confere com a nova senha.');
      return;
    }
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setCurrent('');
          setNext('');
          setConfirmation('');
        },
        onError: (error) => {
          recoverCsrf(error);
          setCurrent('');
        },
      },
    );
  };

  return (
    <section>
      <h1 className="text-2xl font-bold text-slate-900">Trocar senha</h1>
      <p className="mt-1 text-sm text-slate-600">
        Mínimo de {PASSWORD_MIN_LENGTH} caracteres. Frases longas são bem-vindas.
      </p>

      {change.isSuccess ? (
        <p className="mt-4 rounded bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
          Senha alterada. As outras sessões foram encerradas.
        </p>
      ) : null}

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Senha atual</span>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Nova senha</span>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            type="password"
            autoComplete="new-password"
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Confirme a nova senha</span>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </label>

        {localError || change.isError ? (
          <p className="text-sm text-red-700" role="alert">
            {localError ?? errorMessage(change.error)}
          </p>
        ) : null}

        <button
          className="rounded bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-60"
          type="submit"
          disabled={change.isPending}
        >
          {change.isPending ? 'Salvando…' : 'Alterar senha'}
        </button>
      </form>
    </section>
  );
}
