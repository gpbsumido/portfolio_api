import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { processVideo } from './mediaProcessor.js';

/**
 * The only test in this repo that actually runs ffprobe and ffmpeg.
 *
 * Everything else mocks the media pipeline away, which is why nobody noticed
 * that the ffmpeg binary was never arriving: pnpm 10 refuses to run a
 * dependency's build scripts unless the package is listed in
 * pnpm.onlyBuiltDependencies, and ffmpeg-static downloads its binary in a
 * postinstall hook. So ffmpeg-static resolved to a path that did not exist, and
 * the one code path that shells out to it was the one path no test touched.
 *
 * A mock cannot catch that class of fault, because the thing that broke is
 * whether the binary is on disk and executable. This test uses a real 1 second
 * clip and asserts on values that only a working probe can produce.
 */

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../testing/fixtures/tiny-video.mp4',
);

/**
 * A 64x48 solid colour clip, 1 second at 10fps, H.264 in MP4. Deliberately
 * non-square so a width and height that got swapped somewhere would show up as
 * a failure rather than passing by symmetry.
 */
function tinyVideo(): Buffer {
  return fs.readFileSync(fixturePath);
}

describe('processVideo', () => {
  test('reports the dimensions and duration ffprobe reads off a real clip', async () => {
    const result = await processVideo(tinyVideo());

    expect(result.width).toBe(64);
    expect(result.height).toBe(48);
    expect(result.duration).toBeCloseTo(1, 1);
  });

  test('extracts a frame and returns it as a WebP thumbnail', async () => {
    const result = await processVideo(tinyVideo());

    const meta = await sharp(result.thumbBuffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(64);
    expect(meta.height).toBe(48);
  });
});
