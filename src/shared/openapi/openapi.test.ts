import { describe, expect, test } from 'vitest';

// registerRoutes populates the registry as an import side effect; the docs
// module is what pulls it in at runtime.
import './registerRoutes.js';
import { generateOpenAPIDocument } from './generator.js';

type Doc = { paths: Record<string, Record<string, unknown>> };

describe('the OpenAPI document', () => {
  test('generates without throwing', () => {
    // Worth pinning: zod-to-openapi throws on some schema shapes, and the only
    // symptom is /api/docs going down at runtime, long after CI went green.
    expect(() => generateOpenAPIDocument()).not.toThrow();
  });

  test('documents the operator endpoints', () => {
    const doc = generateOpenAPIDocument() as unknown as Doc;
    const operatorOps = Object.entries(doc.paths)
      .filter(([path]) => path.includes('/operator/'))
      .flatMap(([, methods]) => Object.keys(methods));

    expect(operatorOps.length).toBeGreaterThanOrEqual(12);
  });

  test('covers the endpoints that change stock or prices', () => {
    const doc = generateOpenAPIDocument() as unknown as Doc;

    expect(
      doc.paths['/api/operator/restock-sessions/{sessionId}/complete'],
    ).toHaveProperty('post');
    expect(doc.paths['/api/operator/stores/{storeId}/promotions']).toHaveProperty(
      'post',
    );
    expect(
      doc.paths['/api/operator/promotions/{promotionId}/performance'],
    ).toHaveProperty('get');
  });
});
