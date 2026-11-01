import { createHash } from 'node:crypto';

export const MONTHLY_PHOTO_ROOT = '18HrRf50BaVoID2zUJBkgu7Okn6huBhlP';
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_SLOTS = ['profile', 'activity1', 'activity2', 'activity3'] as const;
export type MonthlyPhotoSlot = typeof PHOTO_SLOTS[number];

export class PhotoHttpError extends Error {
  readonly httpStatus: number;
  constructor(readonly status: number, readonly code: string, message: string, readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'PhotoHttpError';
    this.httpStatus = status;
  }
}

export function requireText(value: unknown, label: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) {
    throw new PhotoHttpError(400, 'INVALID_INPUT', `${label} tidak valid.`);
  }
  return value.trim();
}

export function requireDocumentId(value: unknown, label: string): string {
  const id = requireText(value, label);
  if (id.includes('/') || id === '.' || id === '..') throw new PhotoHttpError(400, 'INVALID_INPUT', `${label} tidak valid.`);
  return id;
}

export function normalizedPhotoYear(value: unknown): string {
  const year = requireText(value, 'Tahun ajaran', 9);
  const match = /^(\d{4})[\/_-](\d{4})$/.exec(year);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) throw new PhotoHttpError(400, 'INVALID_PERIOD', 'Tahun ajaran tidak valid.');
  return `${match[1]}-${match[2]}`;
}

export function validatePhotoPeriod(input: Record<string, any>) {
  const academicYear = requireText(input.academicYear, 'Tahun ajaran', 9);
  const normalizedYear = normalizedPhotoYear(academicYear);
  const month = requireText(input.month, 'Bulan', 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new PhotoHttpError(400, 'INVALID_PERIOD', 'Bulan harus berformat YYYY-MM.');
  const semester = String(input.semester ?? '');
  const monthNumber = Number(month.slice(5));
  const expectedSemester = monthNumber >= 7 ? '1' : '2';
  const expectedYear = Number(normalizedYear.slice(0, 4)) + (expectedSemester === '2' ? 1 : 0);
  if (semester !== expectedSemester || Number(month.slice(0, 4)) !== expectedYear) {
    throw new PhotoHttpError(400, 'INVALID_PERIOD', 'Bulan, semester, dan tahun ajaran tidak cocok.');
  }
  return { academicYear, normalizedYear, semester, month };
}

export function photoDocumentId(scope: { studentId: string; classId: string; academicYear: string; semester: string; month: string }): string {
  return `${scope.studentId}_${scope.classId}_${scope.academicYear.replace(/\//g, '_')}_S${scope.semester}_M${scope.month}`;
}

export function photoReportId(scope: { studentId: string; classId: string; academicYear: string; semester: string; month: string }): string {
  return `${scope.academicYear.replace(/\//g, '_')}_S${scope.semester}_M${scope.month}_${scope.classId}_${scope.studentId}`;
}

export function requirePhotoSlot(value: unknown): MonthlyPhotoSlot {
  if (!PHOTO_SLOTS.includes(value as MonthlyPhotoSlot)) throw new PhotoHttpError(400, 'INVALID_SLOT', 'Slot foto tidak valid.');
  return value as MonthlyPhotoSlot;
}

export function photoRevision(value: unknown, label = 'Revisi foto'): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new PhotoHttpError(400, 'INVALID_REVISION', `${label} tidak valid. Muat ulang data foto.`);
  return value as number;
}

export function currentPhotoRevision(document: Record<string, any> | undefined): number {
  return Number.isSafeInteger(document?.revision) && document!.revision >= 0 ? document!.revision : 0;
}

export function requireOperationId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,160}$/.test(value)) throw new PhotoHttpError(400, 'INVALID_OPERATION', 'ID operasi upload tidak valid.');
  return value;
}

export function photoHash(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function stablePhotoJson(value: unknown): string {
  const normalize = (item: any): any => Array.isArray(item)
    ? item.map(normalize)
    : item && typeof item === 'object'
      ? Object.fromEntries(Object.keys(item).sort().filter(key => item[key] !== undefined).map(key => [key, normalize(item[key])]))
      : item;
  return JSON.stringify(normalize(value));
}

export function photoCaption(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > 3000) throw new PhotoHttpError(400, 'INVALID_CAPTION', 'Caption harus berupa teks, maksimal 3.000 karakter.');
  return value;
}

export function photoAlbumLink(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  const text = requireText(value, 'Link album', 2048);
  try {
    const url = new URL(text);
    if (url.protocol === 'https:' && !url.username && !url.password) return text;
  } catch { /* Report one consistent validation error below. */ }
  throw new PhotoHttpError(400, 'INVALID_ALBUM_LINK', 'Link album harus berupa alamat HTTPS yang valid.');
}

export interface MonthlyPhotoCrop {
  fit: 'contain' | 'cover';
  x: number;
  y: number;
  zoom: number;
  aspectRatio?: number;
}

export function validatePhotoCrop(value: unknown, defaultFit: 'contain' | 'cover' = 'cover'): MonthlyPhotoCrop {
  if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value))) {
    throw new PhotoHttpError(400, 'INVALID_CROP', 'Pengaturan posisi foto tidak valid.');
  }
  const input = (value || {}) as Record<string, any>;
  // Historical controls wrote x/y/zoom without defining their units and the old renderer
  // ignored them. Preserve its centered cover until a teacher explicitly selects a fit.
  if (input.fit === undefined || input.fit === null) return { fit: defaultFit, x: 50, y: 50, zoom: 1 };
  const fit = input.fit;
  const x = input.x ?? 50;
  const y = input.y ?? 50;
  const zoom = input.zoom ?? 1;
  if (!['contain', 'cover'].includes(fit) || ![x, y, zoom].every(n => typeof n === 'number' && Number.isFinite(n)) || x < 0 || x > 100 || y < 0 || y > 100 || zoom < 1 || zoom > 3) {
    throw new PhotoHttpError(400, 'INVALID_CROP', 'Posisi foto harus 0–100 dan zoom harus 1–3.');
  }
  const output: MonthlyPhotoCrop = { fit, x, y, zoom };
  if (input.aspectRatio !== undefined) {
    if (typeof input.aspectRatio !== 'number' || !Number.isFinite(input.aspectRatio) || input.aspectRatio < 0.125 || input.aspectRatio > 8) {
      throw new PhotoHttpError(400, 'INVALID_CROP', 'Rasio foto tidak valid.');
    }
    output.aspectRatio = input.aspectRatio;
  }
  return output;
}

export function extractMonthlyPhotoFileId(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value.startsWith('data:') || value.startsWith('blob:')) return null;
  try {
    const url = new URL(value, 'https://lumina.invalid');
    let id: string | null = null;
    if (url.origin === 'https://lumina.invalid') {
      id = /^\/api\/elementary-monthly\/(?:photo-stream|reports\/assets)\/([A-Za-z0-9_-]+)$/.exec(url.pathname)?.[1] || null;
    } else if (['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com', 'lh3.googleusercontent.com'].includes(url.hostname)) {
      id = /\/(?:file\/)?d\/([A-Za-z0-9_-]+)/.exec(url.pathname)?.[1] || url.searchParams.get('id');
    }
    return id && /^[A-Za-z0-9_-]{5,200}$/.test(id) ? id : null;
  } catch { return null; }
}

export function photoReferenceId(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return extractMonthlyPhotoFileId(value);
  const urlId = extractMonthlyPhotoFileId(value.url);
  const id = typeof value.driveFileId === 'string' && /^[A-Za-z0-9_-]{5,200}$/.test(value.driveFileId) ? value.driveFileId : null;
  if (value.driveFileId && !id) throw new PhotoHttpError(400, 'INVALID_FILE_ID', 'Referensi file foto tidak valid.');
  if (id && urlId && id !== urlId) throw new PhotoHttpError(409, 'PHOTO_REFERENCE_MISMATCH', 'URL dan ID file foto tidak cocok. Muat ulang foto.');
  return id || urlId;
}

export function photoReferences(photos: any): string[] {
  const entries = [photos?.identityPhoto, photos?.identityPhotoUrl, ...(Array.isArray(photos?.snapshots) ? photos.snapshots : [])];
  return Array.from(new Set(entries.map(photoReferenceId).filter((id): id is string => !!id)));
}

export function validatePhotoImage(buffer: Buffer, declaredMime?: string) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > PHOTO_MAX_BYTES) throw new PhotoHttpError(400, 'INVALID_IMAGE_SIZE', 'Foto kosong atau melebihi batas 10 MB.');
  let mimeType = '';
  let width = 0;
  let height = 0;
  if (buffer.length >= 45 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    if (buffer.readUInt32BE(8) !== 13 || buffer.toString('ascii', 12, 16) !== 'IHDR' || buffer.toString('ascii', buffer.length - 8, buffer.length - 4) !== 'IEND') {
      throw new PhotoHttpError(400, 'INVALID_IMAGE', 'Struktur gambar PNG tidak valid.');
    }
    mimeType = 'image/png'; width = buffer.readUInt32BE(16); height = buffer.readUInt32BE(20);
  } else if (buffer.length >= 12 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9) {
    let offset = 2;
    while (offset < buffer.length - 4) {
      if (buffer[offset++] !== 0xff) break;
      while (buffer[offset] === 0xff) offset++;
      const marker = buffer[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (offset + 2 > buffer.length) break;
      const size = buffer.readUInt16BE(offset);
      if (size < 2 || offset + size > buffer.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && size >= 8) {
        height = buffer.readUInt16BE(offset + 3); width = buffer.readUInt16BE(offset + 5); mimeType = 'image/jpeg'; break;
      }
      offset += size;
    }
  } else if (buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' && buffer.readUInt32LE(4) + 8 === buffer.length) {
    const kind = buffer.toString('ascii', 12, 16);
    if (kind === 'VP8X' && buffer.readUInt32LE(16) === 10) {
      width = 1 + buffer.readUIntLE(24, 3); height = 1 + buffer.readUIntLE(27, 3);
    } else if (kind === 'VP8 ' && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
      width = buffer.readUInt16LE(26) & 0x3fff; height = buffer.readUInt16LE(28) & 0x3fff;
    } else if (kind === 'VP8L' && buffer[20] === 0x2f) {
      const dimensions = buffer.readUInt32LE(21); width = (dimensions & 0x3fff) + 1; height = ((dimensions >>> 14) & 0x3fff) + 1;
    }
    if (width && height) mimeType = 'image/webp';
  }
  if (!mimeType || !width || !height || width > 10000 || height > 10000 || width * height > 40000000) throw new PhotoHttpError(400, 'INVALID_IMAGE', 'Format atau dimensi gambar tidak valid. Gunakan JPG, PNG, atau WebP hingga 40 megapiksel.');
  if (declaredMime && declaredMime.toLowerCase() !== mimeType) throw new PhotoHttpError(400, 'IMAGE_MIME_MISMATCH', 'Isi file tidak sesuai dengan format gambar yang dikirim.');
  return { mimeType, width, height, byteSize: buffer.length, sha256: photoHash(buffer), md5Checksum: createHash('md5').update(buffer).digest('hex') };
}

export function decodeMonthlyPhotoDataUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > Math.ceil(PHOTO_MAX_BYTES * 4 / 3) + 100) throw new PhotoHttpError(400, 'INVALID_IMAGE_SIZE', 'Data foto kosong atau terlalu besar.');
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) throw new PhotoHttpError(400, 'INVALID_IMAGE', 'Data foto harus berupa JPG, PNG, atau WebP yang valid.');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.toString('base64') !== match[2]) throw new PhotoHttpError(400, 'INVALID_IMAGE', 'Encoding foto tidak valid.');
  return { buffer, ...validatePhotoImage(buffer, match[1]) };
}
