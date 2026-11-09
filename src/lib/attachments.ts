import type { ImageAttachment } from '../types';
import { uid } from './defaults';

export const MAX_IMAGES = 6;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

const ACCEPTED_MIMES = new Set(Object.values(MIME_BY_EXTENSION));

function resolveMime(file: File): string | null {
  if (file.type === 'image/jpg') return 'image/jpeg';
  if (ACCEPTED_MIMES.has(file.type)) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? null;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Could not read the image.'));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Reads image files into base64 payloads for Ollama's native `images` field.
 * `existing` is the number of images already attached to the draft.
 */
export async function readImageAttachments(
  files: FileList | File[],
  existing: number,
): Promise<{ images: ImageAttachment[]; errors: string[] }> {
  const images: ImageAttachment[] = [];
  const errors: string[] = [];
  let remaining = Math.max(0, MAX_IMAGES - existing);

  for (const file of Array.from(files)) {
    const mime = resolveMime(file);
    if (!mime) {
      errors.push(`${file.name}: only PNG, JPEG, WebP and GIF images can be attached.`);
      continue;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      errors.push(`${file.name}: images must be under 8 MB.`);
      continue;
    }
    if (remaining <= 0) {
      errors.push(`You can attach up to ${MAX_IMAGES} images per message.`);
      break;
    }

    try {
      const dataUrl = await readAsDataUrl(file);
      const comma = dataUrl.indexOf(',');
      if (comma < 0) throw new Error('Could not read the image.');
      images.push({
        id: uid(),
        name: file.name,
        mime,
        size: file.size,
        data: dataUrl.slice(comma + 1),
      });
      remaining -= 1;
    } catch (error) {
      errors.push(`${file.name}: ${error instanceof Error ? error.message : 'Could not read the image.'}`);
    }
  }

  return { images, errors };
}
