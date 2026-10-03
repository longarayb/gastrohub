import { type FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';

import { ApiError, NetworkError } from './api-client';
import { safeNext, sessionEndedMessage } from './safe-next';
import { useLogin, useSession } from './session';

const INVALID_CREDENTIALS =
  'E-mail ou senha inválidos. Após várias tentativas, aguarde alguns minutos antes de tentar novamente.';

/** Mensagem de erro de login; nunca indica se o e-mail existe (M02 §8.4). */
function loginErrorMessage(error: unknown): string {
  if (error instanceof NetworkError) return 'Não foi possível conectar ao servidor.';
  if (error instanceof ApiError) {
    if (error.status === 401) return error.detail ?? INVALID_CREDENTIALS;
    if (error.status === 429) return 'Muitas requisições. Tente novamente mais tarde.';
    if (error.status === 400) return 'Verifique os campos informados.';
  }
  return 'Não foi possível entrar. Tente novamente.';
}

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const next = safeNext(searchParams.get('next'));
  const reason = (location.state as { reason?: string } | null)?.reason;
  const notice = sessionEndedMessage(reason);

  if (session.data?.status === 'authenticated' && !login.isPending) {
    return <Navigate to={next} replace />;
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate(
      { email, password },
      {
        onSuccess: () => {
          setPassword('');
          void navigate(next, { replace: true });
        },
        onError: () => setPassword(''),
      },
    );
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-bold text-slate-900">GastroHub</h1>
      <p className="mt-1 text-slate-600">Entre com seu e-mail e senha</p>

      {notice && !login.isError ? (
        <p className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-900" role="status">
          {notice}
        </p>
      ) : null}

      <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">E-mail</span>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Senha</span>
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {login.isError ? (
          <p className="text-sm text-red-700" role="alert">
            {loginErrorMessage(login.error)}
          </p>
        ) : null}

        <button
          className="w-full rounded bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-60"
          type="submit"
          disabled={login.isPending}
        >
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
