import {
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { registry } from './registry.js';

// Extend Zod globally so .openapi() is available on all schemas
extendZodWithOpenApi(z);

export function generateOpenAPIDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Portfolio API',
      version: '2.4.2',
      description:
        'Backend API for the Portfolio platform. Provides endpoints for NBA stats, calendar management, social features, media galleries, and more.',
    },
    servers: [{ url: '/api', description: 'API base path' }],
    security: [{ bearerAuth: [] }],
  });
}
