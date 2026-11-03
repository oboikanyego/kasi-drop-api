import { randomUUID } from 'node:crypto';
import { ImageModel } from './models.js';
import { demo, memImages } from './state.js';

/** Store an uploaded photo and return its id. */
export async function saveImage(bytes: Buffer, mime: string): Promise<string> {
  const id = randomUUID();
  if (demo) memImages.set(id, { mime, bytes: Buffer.from(bytes) });
  else await ImageModel.create({ id, mime, data: bytes });
  return id;
}
export async function getImage(id: string): Promise<{ mime: string; bytes: Buffer } | null> {
  if (demo) return memImages.get(id) ?? null;
  const image = await ImageModel.findOne({ id });
  return image ? { mime: image.mime, bytes: image.data } : null;
}
export async function imageExists(id: string): Promise<boolean> {
  if (demo) return memImages.has(id);
  return Boolean(await ImageModel.exists({ id }));
}
