import { SetMetadata } from '@nestjs/common';

/** Metadado lido pelo guard global de autenticação (módulo identity). */
export const IS_PUBLIC_ROUTE = 'gastrohub:isPublicRoute';

/**
 * Marca uma rota (ou controller) como pública. Sem este decorator, toda rota exige
 * sessão válida: o guard global nega por padrão (M02 §2, item 6).
 */
export const Public = () => SetMetadata(IS_PUBLIC_ROUTE, true);
