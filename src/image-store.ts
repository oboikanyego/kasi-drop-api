import { randomUUID } from 'node:crypto';
import { ImageModel } from './models.js';
import { demo, memImages } from './state.js';
import { r2Config, r2Write, r2Read, r2Exists } from './r2-store.js';

/** Store an uploaded photo and return its id. */
export async function saveImage(bytes: Buffer, mime: string): Promise<string> {
  const id = randomUUID();
  if (demo) memImages.set(id, { mime, bytes: Buffer.from(bytes) });
  else if (r2Config()) await r2Write(id, bytes, mime);
  else await ImageModel.create({ id, mime, data: bytes });
  return id;
}
export async function getImage(id: string): Promise<{ mime: string; bytes: Buffer } | null> {
  if (demo) return memImages.get(id) ?? null;
  if (r2Config()) {
    const image = await r2Read(id);
    if (image) return image;
  }
  const image = await ImageModel.findOne({ id });
  return image ? { mime: image.mime, bytes: image.data } : null;
}
export async function imageExists(id: string): Promise<boolean> {
  if (demo) return memImages.has(id);
  if (r2Config() && (await r2Exists(id))) return true;
  return Boolean(await ImageModel.exists({ id }));
}
