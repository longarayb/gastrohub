import {
  activeCompanySwitchedSchema,
  branchListSchema,
  companySchema,
  currentSessionSchema,
  myCompaniesSchema,
} from '@gastrohub/contracts';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  BrowserClient,
  createUser,
  problemWithoutRequestId,
  startAuthApp,
} from './support/auth-kit.ts';
import { createCompany, withOrgAdmin } from './support/tenancy-kit.ts';

// M03 §4, §5, §8, §12: empresa ativa, troca, revalidação e isolamento via API.
describe('organização via API', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await startAuthApp();
  });
  afterAll(async () => {
    await app?.close();
  });

  async function loggedIn(email: string, password: string) {
    const client = new BrowserClient(app);
    const response = await client.login(email, password);
    return { client, body: response.body as { activeCompany: unknown } };
  }

  describe('seleção automática no login (D5)', () => {
    it('com exatamente uma empresa, ela já vem ativa', async () => {
      const user = await createUser();
      const company = await createCompany('Burger Uno', [user.email]);
      const { client, body } = await loggedIn(user.email, user.password);
      expect(body.activeCompany).toEqual({ id: company.id, tradeName: 'Burger Uno' });
      const session = currentSessionSchema.parse((await client.get('/api/v1/auth/session')).body);
      expect(session.activeCompany?.id).toBe(company.id);
    });

    it('sem empresa ou com duas ou mais, nenhuma vem ativa', async () => {
      const lonely = await createUser();
      expect((await loggedIn(lonely.email, lonely.password)).body.activeCompany).toBeNull();

      const multi = await createUser();
      await createCompany('Rede A', [multi.email]);
      await createCompany('Rede B', [multi.email]);
      expect((await loggedIn(multi.email, multi.password)).body.activeCompany).toBeNull();
    });
  });

  describe('minhas empresas e troca de empresa ativa (§4.1)', () => {
    it('lista só as empresas com vínculo ativo, marcando a ativa', async () => {
      const user = await createUser();
      const a = await createCompany('Lista A', [user.email]);
      const b = await createCompany('Lista B', [user.email]);
      await createCompany('Lista C (alheia)');
      const { client } = await loggedIn(user.email, user.password);

      const list = myCompaniesSchema.parse((await client.get('/api/v1/companies')).body);
      expect(list.data.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
      expect(list.data.every((c) => !c.active)).toBe(true);

      await client.post('/api/v1/session/active-company', { companyId: b.id });
      const after = myCompaniesSchema.parse((await client.get('/api/v1/companies')).body);
      expect(after.data.find((c) => c.active)?.id).toBe(b.id);
    });

    it('troca rotaciona o token: cookie e CSRF novos, sessão antiga revogada', async () => {
      const user = await createUser();
      const a = await createCompany('Rot A', [user.email]);
      const b = await createCompany('Rot B', [user.email]);
      const { client } = await loggedIn(user.email, user.password);
      await client.post('/api/v1/session/active-company', { companyId: a.id });
      const oldCookie = client.cookie;
      const oldCsrf = client.csrfToken;

      const response = await client.post('/api/v1/session/active-company', { companyId: b.id });
      expect(response.status).toBe(200);
      const body = activeCompanySwitchedSchema.parse(response.body);
      expect(body.activeCompany).toEqual({ id: b.id, tradeName: 'Rot B' });
      expect(client.cookie).not.toBe(oldCookie);
      expect(body.csrfToken).not.toBe(oldCsrf);

      const stale = new BrowserClient(app);
      stale.cookie = oldCookie;
      expect((await stale.get('/api/v1/auth/session')).body).toMatchObject({
        code: 'session_revoked',
      });
      expect(companySchema.parse((await client.get('/api/v1/company')).body).id).toBe(b.id);
    });

    it('empresa sem vínculo, inexistente ou suspensa: 404 idênticos', async () => {
      const user = await createUser();
      await createCompany('Minha', [user.email]);
      const foreign = await createCompany('Alheia');
      const suspended = await createCompany('Suspensa', [user.email]);
      await withOrgAdmin((admin) => admin.setCompanyStatus(suspended.id, 'suspended'));
      const { client } = await loggedIn(user.email, user.password);

      const responses = await Promise.all(
        [foreign.id, '01a0f904-550e-7054-ac7c-b7a61c0a0b3d', suspended.id].map((companyId) =>
          client.post('/api/v1/session/active-company', { companyId }),
        ),
      );
      for (const response of responses) {
        expect(response.status).toBe(404);
        expect(problemWithoutRequestId(response)).toEqual(problemWithoutRequestId(responses[0]!));
      }
      expect(responses[0]!.body).toMatchObject({ code: 'company_not_found' });
    });

    it('troca exige CSRF e corpo válido', async () => {
      const user = await createUser();
      const company = await createCompany('Csrf', [user.email]);
      const { client } = await loggedIn(user.email, user.password);
      expect(
        (await client.post('/api/v1/session/active-company', { companyId: company.id }, false))
          .status,
      ).toBe(403);
      expect(
        (await client.post('/api/v1/session/active-company', { companyId: 'x' })).body,
      ).toMatchObject({ code: 'validation_failed' });
    });
  });

  describe('rotas de tenant (@RequiresCompany)', () => {
    it('sem empresa ativa: 403 active_company_required', async () => {
      const user = await createUser();
      const { client } = await loggedIn(user.email, user.password);
      for (const path of ['/api/v1/company', '/api/v1/branches']) {
        const response = await client.get(path);
        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ code: 'active_company_required' });
      }
    });

    it('empresa ativa e filiais: só dados da empresa ativa (isolamento via API)', async () => {
      const alice = await createUser();
      const bob = await createUser();
      const a = await createCompany('Iso A', [alice.email]);
      const b = await createCompany('Iso B', [bob.email]);
      const { client } = await loggedIn(alice.email, alice.password);

      const company = companySchema.parse((await client.get('/api/v1/company')).body);
      expect(company).toMatchObject({ id: a.id, tradeName: 'Iso A', taxId: a.taxId });
      const branches = branchListSchema.parse((await client.get('/api/v1/branches')).body);
      expect(branches.data.map((x) => x.id)).toEqual([a.branchId]);
      expect(branches.data[0]).toMatchObject({
        timezone: 'America/Sao_Paulo',
        businessDayCutoff: '04:00',
        address: { city: 'São Paulo', state: 'SP', postalCode: '01310100' },
      });

      // Tentar entrar na empresa de Bob não é possível, e nada de B aparece em lugar algum.
      expect(
        (await client.post('/api/v1/session/active-company', { companyId: b.id })).status,
      ).toBe(404);
      const all = JSON.stringify([
        (await client.get('/api/v1/companies')).body,
        (await client.get('/api/v1/company')).body,
        (await client.get('/api/v1/branches')).body,
      ]);
      expect(all).not.toContain(b.id);
      expect(all).not.toContain(b.branchId);
    });

    it('vínculo revogado durante o uso: 403 company_access_revoked e empresa ativa limpa', async () => {
      const user = await createUser();
      const company = await createCompany('Revoga', [user.email]);
      const { client } = await loggedIn(user.email, user.password);
      expect((await client.get('/api/v1/company')).status).toBe(200);

      await withOrgAdmin((admin) => admin.removeMember(company.id, user.email));
      const response = await client.get('/api/v1/company');
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'company_access_revoked' });

      // A sessão continua válida, agora sem empresa.
      const session = currentSessionSchema.parse((await client.get('/api/v1/auth/session')).body);
      expect(session.activeCompany).toBeNull();
      expect((await client.get('/api/v1/company')).body).toMatchObject({
        code: 'active_company_required',
      });
    });

    it('empresa suspensa durante o uso: 403 company_access_revoked', async () => {
      const user = await createUser();
      const company = await createCompany('Suspende', [user.email]);
      const { client } = await loggedIn(user.email, user.password);
      await withOrgAdmin((admin) => admin.setCompanyStatus(company.id, 'suspended'));
      expect((await client.get('/api/v1/branches')).body).toMatchObject({
        code: 'company_access_revoked',
      });
    });

    it('troca de senha mantém a empresa ativa', async () => {
      const user = await createUser();
      const company = await createCompany('Senha', [user.email]);
      const { client } = await loggedIn(user.email, user.password);
      const response = await client.post('/api/v1/auth/password', {
        currentPassword: user.password,
        newPassword: 'nova frase do tenant 2026',
      });
      expect(response.status).toBe(200);
      expect(companySchema.parse((await client.get('/api/v1/company')).body).id).toBe(company.id);
    });

    it('sem sessão: 401 (o guard de autenticação vem antes)', async () => {
      expect((await new BrowserClient(app).get('/api/v1/company')).status).toBe(401);
    });
  });
});
