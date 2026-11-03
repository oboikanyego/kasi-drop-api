import express, { type Express } from 'express';
import { guard } from '../accounts.js';
import { HttpError } from '../http-error.js';
import { imageLimiter, safe, uploadLimiter } from '../http.js';
import { imageIdPattern, imagePath, maxProductImageBytes } from '../image-rules.js';
import { getImage, saveImage } from '../image-store.js';
// Magic-byte check shared with avatars: only PNG, JPEG and WebP (never SVG or HTML) get through.
import { detectAvatarMime as detectImageMime } from '../profile-rules.js';

// An upload over the limit is rejected by the parser; the error handler turns that into a 413.
const readImage = express.raw({
  type: ['image/png', 'image/jpeg', 'image/webp'],
  limit: maxProductImageBytes,
});

export function registerImageRoutes(app: Express) {
  app.post(
    '/api/admin/images',
    guard('admin'),
    uploadLimiter,
    readImage,
    safe(async (req, res) => {
      const bytes: unknown = req.body;
      if (!Buffer.isBuffer(bytes) || bytes.length === 0)
        throw new HttpError(415, 'Upload a JPEG, PNG or WebP image.');
      const mime = detectImageMime(bytes);
      // The declared type must match the actual bytes, so a renamed file cannot slip through.
      if (!mime || req.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== mime)
        throw new HttpError(415, 'Unsupported image. Upload a JPEG, PNG or WebP photo.');
      res.status(201).json({ url: imagePath(await saveImage(bytes, mime)) });
    }),
  );
  // Public: shoppers load product photos without signing in.
  app.get(
    '/api/images/:id',
    imageLimiter,
    safe(async (req, res) => {
      const id = String(req.params.id);
      const image = imageIdPattern.test(id) ? await getImage(id) : null;
      if (!image) return res.sendStatus(404);
      res.setHeader('Content-Type', image.mime);
      // A photo never changes once uploaded, so browsers and CDNs may keep it for good.
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Product photos may be embedded by other sites (e.g. link previews).
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.send(image.bytes);
    }),
  );
}
