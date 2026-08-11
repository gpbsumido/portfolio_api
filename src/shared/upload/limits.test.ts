import { describe, test, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import multer from 'multer';
import { IMAGE_UPLOAD_LIMITS, VIDEO_UPLOAD_LIMITS } from './limits.js';
import { errorHandler } from '../../middleware/errorHandler.js';

/**
 * The guard in mediaProcessor runs after multer has already buffered the whole
 * body into memory, so it cannot protect the process. These tests pin the limit
 * at the multer layer, where rejection happens before the allocation.
 */
function makeApp(limits: multer.Options['limits']) {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits });
  app.post('/upload', upload.any(), (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

describe('upload limits', () => {
  test('every limit that bounds memory is set, not just fileSize', () => {
    for (const limits of [IMAGE_UPLOAD_LIMITS, VIDEO_UPLOAD_LIMITS]) {
      expect(limits.fileSize).toBeGreaterThan(0);
      expect(limits.files).toBeGreaterThan(0);
      expect(limits.fields).toBeGreaterThan(0);
      expect(limits.parts).toBeGreaterThan(0);
    }
  });

  test('image uploads stay well under the 512mb container', () => {
    const worstCase = IMAGE_UPLOAD_LIMITS.fileSize * IMAGE_UPLOAD_LIMITS.files;
    expect(worstCase).toBeLessThan(256 * 1024 * 1024);
  });

  test('video uploads stay well under the 512mb container', () => {
    const worstCase = VIDEO_UPLOAD_LIMITS.fileSize * VIDEO_UPLOAD_LIMITS.files;
    expect(worstCase).toBeLessThan(256 * 1024 * 1024);
  });

  test('a file over the limit is rejected with 413, not accepted', async () => {
    const oversized = Buffer.alloc(IMAGE_UPLOAD_LIMITS.fileSize + 1024, 0x41);

    const res = await request(makeApp(IMAGE_UPLOAD_LIMITS))
      .post('/upload')
      .attach('photo', oversized, 'big.jpg');

    expect(res.status).toBe(413);
  });

  test('more files than allowed is rejected with 413', async () => {
    const small = Buffer.alloc(64, 0x41);
    let req = request(makeApp(IMAGE_UPLOAD_LIMITS)).post('/upload');
    for (let i = 0; i <= IMAGE_UPLOAD_LIMITS.files; i++) {
      req = req.attach(`photo${i}`, small, `f${i}.jpg`);
    }

    const res = await req;

    expect(res.status).toBe(413);
  });
});
