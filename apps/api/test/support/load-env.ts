// Executado em cada worker do Vitest antes dos testes de integração.
import { loadLocalEnv } from '../../src/shared/config/load-env.js';

loadLocalEnv();
