/** Uploaded product photos are stored by the API and referenced by their path, e.g. /api/images/<id>. */
export const maxProductImageBytes = 1024 * 1024;
export const imageIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ownImagePath = /^\/api\/images\/([0-9a-f-]{36})$/;
export const imagePath = (id: string) => '/api/images/' + id;

/** The id inside an uploaded image's path, or null for anything else (such as an external link). */
export function uploadedImageId(reference: string): string | null {
  const id = ownImagePath.exec(reference)?.[1];
  return id && imageIdPattern.test(id) ? id : null;
}
/** A product's image is either one of our uploads or an http(s) link (the seeded catalogue uses links). */
export function isImageReference(value: string): boolean {
  if (uploadedImageId(value)) return true;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}
