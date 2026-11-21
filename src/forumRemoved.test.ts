import { describe, expect, test } from 'vitest';
import request from 'supertest';
import { app } from './app.js';
import './shared/openapi/registerRoutes.js';
import { generateOpenAPIDocument } from './shared/openapi/generator.js';

/**
 * Forum posts and map markers were anonymous-adjacent writes with no live
 * caller: the only client was the archived paul-portfolio, and `GET /markers`
 * read the whole table with no limit. They're gone, not just hidden.
 */
describe('the forum and markers endpoints are gone', () => {
  test.each([
    ['get', '/api/postforum'],
    ['post', '/api/postforum'],
    ['get', '/api/markers'],
    ['post', '/api/markers'],
  ] as const)('%s %s is a 404', async (method, path) => {
    const res = await request(app)[method](path).send({});

    expect(res.status).toBe(404);
  });

  test('the OpenAPI document no longer lists them', () => {
    const paths = Object.keys(generateOpenAPIDocument().paths ?? {});

    expect(paths.filter((path) => /postforum|markers/.test(path))).toEqual([]);
  });
});
