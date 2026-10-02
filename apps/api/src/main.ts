import 'reflect-metadata';

import { createApp } from './app.factory.js';
import { loadLocalEnv } from './shared/config/load-env.js';
import { parseConfig } from './shared/config/config.schema.js';

async function bootstrap(): Promise<void> {
  loadLocalEnv();
  const config = parseConfig(process.env);
  const app = await createApp(config);
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
}

bootstrap().catch((error: unknown) => {
  // Mensagem curta e sem valores de configuração; o processo encerra com erro.
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`GastroHub API não iniciou — ${message}`);
  process.exit(1);
});
