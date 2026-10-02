import { Module, type OnModuleInit, Inject } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { APP_CONFIG } from '../../shared/config/config.module.js';
import { type AppConfig } from '../../shared/config/config.schema.js';
import { AUTH_SETTINGS, authSettingsFrom } from './application/auth-settings.js';
import { LoginService } from './application/login.service.js';
import { PasswordService } from './application/password.service.js';
import { SessionService } from './application/session.service.js';
import { UserAdminService } from './application/user-admin.service.js';
import { AuthController } from './http/auth.controller.js';
import { AuthGuard } from './http/auth.guard.js';
import { SessionsController } from './http/sessions.controller.js';
import { AuthEventsRepository } from './infrastructure/auth-events.repository.js';
import { IdentityRepository } from './infrastructure/identity.repository.js';
import { PasswordHasher } from './infrastructure/password-hasher.js';

@Module({
  controllers: [AuthController, SessionsController],
  providers: [
    {
      provide: AUTH_SETTINGS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => authSettingsFrom(config),
    },
    PasswordHasher,
    IdentityRepository,
    AuthEventsRepository,
    SessionService,
    LoginService,
    PasswordService,
    UserAdminService,
    AuthGuard,
    // Guard global de autenticação: toda rota exige sessão, salvo @Public().
    { provide: APP_GUARD, useExisting: AuthGuard },
  ],
  exports: [SessionService, UserAdminService],
})
export class IdentityModule implements OnModuleInit {
  constructor(@Inject(PasswordHasher) private readonly hasher: PasswordHasher) {}

  /** Pré-computa o hash fictício usado para igualar o tempo de resposta (§9.1). */
  async onModuleInit(): Promise<void> {
    await this.hasher.warmUp();
  }
}
