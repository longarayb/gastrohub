import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { json, mockFetch, problem, renderApp, SESSION } from '../../test/render-app';

const GENERIC_401 =
  'E-mail ou senha inválidos. Após várias tentativas, aguarde alguns minutos antes de tentar novamente.';

function fillLogin(email = 'ana@teste.local', password = 'frase segura de teste') {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('fluxos de autenticação no frontend (§8, §14.4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('rota protegida sem sessão redireciona para /login?next=<rota>', async () => {
    mockFetch({ 'GET /api/v1/auth/session': () => problem(401, 'unauthenticated') });
    const { router } = renderApp('/conta/senha');
    await screen.findByRole('button', { name: 'Entrar' });
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/conta/senha')}`);
  });

  it('login com sucesso volta para o next e mostra a área autenticada', async () => {
    let loggedIn = false;
    mockFetch({
      'GET /api/v1/auth/session': () =>
        loggedIn ? json(200, SESSION) : problem(401, 'unauthenticated'),
      'POST /api/v1/auth/login': () => {
        loggedIn = true;
        return json(200, SESSION);
      },
    });
    const { router } = renderApp('/conta/senha');
    await screen.findByRole('button', { name: 'Entrar' });
    fillLogin();
    await screen.findByRole('heading', { name: 'Trocar senha' });
    expect(router.state.location.pathname).toBe('/conta/senha');
    expect(screen.getByText('Ana')).toBeInTheDocument();
  });

  it('401 no login mostra a mensagem genérica, sem indicar se o e-mail existe', async () => {
    mockFetch({
      'GET /api/v1/auth/session': () => problem(401, 'unauthenticated'),
      'POST /api/v1/auth/login': () => problem(401, 'invalid_credentials', GENERIC_401),
    });
    renderApp('/login');
    await screen.findByRole('button', { name: 'Entrar' });
    fillLogin();
    expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC_401);
    expect(screen.queryByText(/não existe|não encontrado/i)).toBeNull();
  });

  it('429 no login mostra mensagem genérica sem mencionar a conta', async () => {
    mockFetch({
      'GET /api/v1/auth/session': () => problem(401, 'unauthenticated'),
      'POST /api/v1/auth/login': () => problem(429, 'rate_limited', 'x', { 'Retry-After': '300' }),
    });
    renderApp('/login');
    await screen.findByRole('button', { name: 'Entrar' });
    fillLogin();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Muitas requisições. Tente novamente mais tarde.',
    );
  });

  it('falha de rede no login', async () => {
    mockFetch({
      'GET /api/v1/auth/session': () => problem(401, 'unauthenticated'),
      'POST /api/v1/auth/login': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    renderApp('/login');
    await screen.findByRole('button', { name: 'Entrar' });
    fillLogin();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível conectar ao servidor.',
    );
  });

  it('401 durante o uso (sessão expirada) redireciona para o login com a mensagem', async () => {
    mockFetch({
      'GET /api/v1/auth/session': () => json(200, SESSION),
      'GET /api/v1/auth/sessions': () => problem(401, 'session_expired'),
    });
    const { router } = renderApp('/conta/sessoes');
    expect(await screen.findByText('Sua sessão expirou. Entre novamente.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toContain(encodeURIComponent('/conta/sessoes'));
  });

  it('logout envia CSRF, limpa o estado e volta ao login', async () => {
    const { calls } = mockFetch({
      'GET /api/v1/auth/session': () => json(200, SESSION),
      'POST /api/v1/auth/logout': () => new Response(null, { status: 204 }),
    });
    const { router, queryClient } = renderApp('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    await screen.findByRole('button', { name: 'Entrar' });
    expect(router.state.location.pathname).toBe('/login');
    const logout = calls.find((c) => c.url === '/api/v1/auth/logout')!;
    expect(logout.headers['X-CSRF-Token']).toBe(SESSION.csrfToken);
    expect(queryClient.getQueryData(['auth', 'session'])).toEqual({ status: 'anonymous' });
  });

  it('o token CSRF nunca é gravado em localStorage nem sessionStorage', async () => {
    mockFetch({
      'GET /api/v1/auth/session': () => problem(401, 'unauthenticated'),
      'POST /api/v1/auth/login': () => json(200, SESSION),
    });
    renderApp('/login');
    await screen.findByRole('button', { name: 'Entrar' });
    fillLogin();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Entrar' })).toBeNull());
    const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(stored).not.toContain(SESSION.csrfToken);
  });

  it('/status continua público', async () => {
    mockFetch({ 'GET /health/ready': () => json(200, { status: 'ok', database: 'ok' }) });
    renderApp('/status');
    expect(await screen.findByTestId('status-API')).toHaveTextContent('Operacional');
  });
});
