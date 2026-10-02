import { type HealthLiveResponse, type HealthReadyResponse } from '@gastrohub/contracts';
import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../../shared/http/public.decorator.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  /** O processo está de pé. Não acessa o banco. */
  @Get('live')
  @ApiOkResponse({ description: 'Processo em execução' })
  live(): HealthLiveResponse {
    return { status: 'ok' };
  }

  /** A API está pronta para atender: o banco responde. */
  @Get('ready')
  @ApiOkResponse({ description: 'API e banco disponíveis' })
  @ApiServiceUnavailableResponse({ description: 'Banco indisponível (Problem Details)' })
  async ready(): Promise<HealthReadyResponse> {
    await this.health.assertDatabaseReady();
    return { status: 'ok', database: 'ok' };
  }
}
