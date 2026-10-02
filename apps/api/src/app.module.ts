import { type Writable } from 'node:stream';

import { type DynamicModule, Module, type Type } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { HealthModule } from './modules/health/index.js';
import { IdentityModule } from './modules/identity/index.js';
import { ConfigModule } from './shared/config/config.module.js';
import { type AppConfig } from './shared/config/config.schema.js';
import { DatabaseModule } from './shared/database/database.module.js';
import { ProblemDetailsFilter } from './shared/http/problem-details.filter.js';
import { LoggingModule } from './shared/logging/logging.module.js';

export interface AppModuleOptions {
  /** Módulos adicionais (somente testes). */
  extraModules?: (Type | DynamicModule)[];
  /** Destino alternativo dos logs (somente testes). */
  logDestination?: Writable;
}

@Module({})
export class AppModule {
  static register(config: AppConfig, options: AppModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.register(config),
        LoggingModule.register(options.logDestination),
        DatabaseModule,
        IdentityModule,
        HealthModule,
        ...(options.extraModules ?? []),
      ],
      providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
    };
  }
}
