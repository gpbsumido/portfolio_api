import type { Request, Response, NextFunction } from 'express';
import sharp from 'sharp';
import { createModuleLogger } from '../../shared/utils/logger.js';

const log = createModuleLogger('gallery');
import { Upload } from '@aws-sdk/lib-storage';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3, S3_BUCKET, CDN_BASE } from '../../config/s3.js';
import { GalleryRepository } from './repository.js';
import type { GalleryItem } from './types.js';

/** Extract a single string param (Express 5 params can be string | string[]). */
function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

const repo = new GalleryRepository();

export class GalleryController {
  async create(req: Request, res: Response, _next: NextFunction): Promise<void> {
    if (!req.is('multipart/form-data')) {
      res.status(400).json({ error: 'Content-Type must be multipart/form-data.' });
      return;
    }

    const { text, description, date } = req.body as Record<string, string>;
    const file = req.file;

    if (!file || !text || !description || !date) {
      res.status(400).json({ error: 'All fields are required.' });
      return;
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      res.status(400).json({ error: 'Invalid date format.' });
      return;
    }

    try {
      const userSub = (req as any).auth?.payload?.sub as string | undefined;
      const mimetype = file.mimetype;
      const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');

      let optimizedBuffer: Buffer;
      let outputFormat: string;
      let contentType: string;

      const transformer = sharp(file.buffer)
        .rotate()
        .resize({ width: 1024, withoutEnlargement: true });

      if (mimetype === 'image/jpeg' || mimetype === 'image/jpg') {
        optimizedBuffer = await transformer.jpeg({ quality: 80 }).toBuffer();
        outputFormat = 'jpg';
        contentType = 'image/jpeg';
      } else if (mimetype === 'image/png') {
        optimizedBuffer = await transformer.png({ compressionLevel: 9 }).toBuffer();
        outputFormat = 'png';
        contentType = 'image/png';
      } else if (mimetype === 'image/webp') {
        optimizedBuffer = await transformer.webp({ quality: 80 }).toBuffer();
        outputFormat = 'webp';
        contentType = 'image/webp';
      } else {
        res.status(400).json({ error: 'Unsupported image format.' });
        return;
      }

      const key = `gallery/${Date.now()}_${sanitizedFilename.replace(/\.[^/.]+$/, '')}.${outputFormat}`;
      const upload = new Upload({
        client: s3,
        params: {
          Bucket: S3_BUCKET!,
          Key: key,
          Body: optimizedBuffer,
          ContentType: contentType,
        },
      });
      await upload.done();
      const imageUrl = `${CDN_BASE}/${key}`;

      const savedData = await repo.add({
        text,
        description,
        imageUrl,
        date: parsedDate,
        user_sub: userSub,
      });

      res.status(201).json(savedData);
    } catch (error) {
      log.error({ err: error }, 'failed to upload image or save data');
      res.status(500).json({ error: 'Failed to upload image or save data.' });
    }
  }

  async list(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const { page = '1', limit = '10' } = req.query as Record<string, string>;

    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);

    if (isNaN(pageNumber) || isNaN(limitNumber) || pageNumber <= 0 || limitNumber <= 0) {
      res.status(400).json({ error: 'Invalid page or limit parameters.' });
      return;
    }

    try {
      const galleryItems = await repo.findAll(pageNumber, limitNumber);

      const images: GalleryItem[] = galleryItems.map((item) => ({
        id: item.id,
        text: item.title,
        description: item.description,
        imageUrl: item.image_url,
        date: item.date,
        user_sub: item.user_sub,
      }));

      res.status(200).json(images);
    } catch (error) {
      log.error({ err: error }, 'failed to fetch gallery items');
      res.status(500).json({ error: 'Failed to fetch gallery items from database.' });
    }
  }

  async remove(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const id = param(req.params.id);
    const userSub = (req as any).auth?.payload?.sub as string | undefined;

    try {
      const record = await repo.findById(id);

      if (!record) {
        res.status(404).json({ error: 'Record not found.' });
        return;
      }

      if (!userSub || record.user_sub !== userSub) {
        res.status(403).json({ error: 'Unauthorized to delete this record.' });
        return;
      }

      await repo.deleteById(id);

      const key = new URL(record.image_url).pathname.slice(1);
      await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET!, Key: key }));

      res.status(200).json({ message: 'Record and image deleted successfully.' });
    } catch (error) {
      log.error({ err: error }, 'failed to delete gallery item');
      res.status(500).json({ error: 'Failed to delete record.' });
    }
  }
}
