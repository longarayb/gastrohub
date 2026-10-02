import { type DynamicModule, Module, type Type } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { HealthModule } from './modules/health/index.js';
import { IdentityModule } from './modules/identity/index.js';
import { ConfigModule } from './shared/config/config.module.js';
import { type AppConfig } from './shared/config/config.schema.js';
import { DatabaseModule } from './shared/database/database.module.js';
import { ProblemDetailsFilter } from './shared/http/problem-details.filter.js';
import { LoggingModule } from './shared/logging/logging.module.js';

@Module({})
export class AppModule {
  static register(config: AppConfig, extraModules: (Type | DynamicModule)[] = []): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.register(config),
        LoggingModule,
        DatabaseModule,
        IdentityModule,
        HealthModule,
        ...extraModules,
      ],
      providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
    };
  }
}
