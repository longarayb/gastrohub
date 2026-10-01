import { describe, expect, it } from 'vitest';

import { assertSafeRuntimeRole, UnsafeDatabaseRoleError } from './runtime-role.js';

describe('assertSafeRuntimeRole', () => {
  it('aceita papel sem SUPERUSER e sem BYPASSRLS', () => {
    expect(() =>
      assertSafeRuntimeRole({ rolname: 'gastrohub_app', rolsuper: false, rolbypassrls: false }),
    ).not.toThrow();
  });

  it('recusa SUPERUSER', () => {
    expect(() =>
      assertSafeRuntimeRole({ rolname: 'postgres', rolsuper: true, rolbypassrls: false }),
    ).toThrow(UnsafeDatabaseRoleError);
  });

  it('recusa BYPASSRLS', () => {
    expect(() =>
      assertSafeRuntimeRole({ rolname: 'bypass', rolsuper: false, rolbypassrls: true }),
    ).toThrow(/BYPASSRLS/);
  });

  it('informa os dois motivos quando ambos se aplicam', () => {
    expect(() =>
      assertSafeRuntimeRole({ rolname: 'postgres', rolsuper: true, rolbypassrls: true }),
    ).toThrow(/SUPERUSER e possui BYPASSRLS/);
  });
});
