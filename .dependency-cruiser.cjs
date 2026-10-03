// Fronteiras entre módulos (ADR-001), verificadas por `pnpm deps:check` no lint e no CI.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-module-internals',
      comment:
        'Um módulo só pode usar outro módulo pela interface pública (modules/<modulo>/index.ts). ' +
        'Ver docs/01-ARQUITETURA.md §2.',
      severity: 'error',
      from: { path: '^apps/api/src/modules/([^/]+)/' },
      to: {
        path: '^apps/api/src/modules/([^/]+)/',
        pathNot: ['^apps/api/src/modules/$1/', '^apps/api/src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'shared-does-not-depend-on-modules',
      comment: 'A infraestrutura compartilhada não pode depender de módulos de negócio.',
      severity: 'error',
      from: { path: '^apps/api/src/shared/' },
      to: { path: '^apps/api/src/modules/' },
    },
    {
      name: 'tenant-data-only-via-tenant-db',
      comment:
        'Tabelas de tenant só são acessadas pelo TenantDb (shared/tenancy), que aplica app.company_id. ' +
        'O acesso direto ao pool fica restrito ao identity (tabelas globais) e ao health ' +
        '(verificação técnica de conexão, sem tabelas). Ver M03 §7.',
      severity: 'error',
      from: {
        path: '^apps/api/src/modules/',
        pathNot: '^apps/api/src/modules/(identity|health)/',
      },
      to: { path: '^apps/api/src/shared/database/' },
    },
    {
      name: 'apps-are-isolated',
      comment: 'API e web só compartilham código via packages/*.',
      severity: 'error',
      from: { path: '^apps/(api|web)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
    {
      name: 'packages-do-not-depend-on-apps',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'no-circular',
      comment: 'Dependências circulares são proibidas (ADR-001).',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage|node_modules)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
