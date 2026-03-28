import { buildTestApp } from '../../helpers/buildTestApp';
import { container } from '../../../../src/container';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildTestApp();
});

afterEach(async () => {
  await app.close();
  container._reset();
});

describe('GET /api/v1/health', () => {
  it('returns status ok', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
  });
});
