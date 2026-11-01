import type { CSSProperties } from 'react';
import type {
  ElementaryMonthlyCropSettings,
  ElementaryMonthlyIdentityPhoto,
  ElementaryMonthlyStudentPhotoDoc,
} from '../types/elementaryMonthlyReport';

export const DEFAULT_ELEMENTARY_MONTHLY_CROP: Required<Omit<ElementaryMonthlyCropSettings, 'aspectRatio'>> = {
  fit: 'contain', x: 50, y: 50, zoom: 1,
};
// Inner image areas of the existing report frames; use the same ratios in the crop editor.
export const ELEMENTARY_MONTHLY_IDENTITY_ASPECT_RATIO = 4 / 5;
export const ELEMENTARY_MONTHLY_SNAPSHOT_ASPECT_RATIO = 19 / 12;

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value)) : fallback;
}

/** Older reports used centered cover. Do not reinterpret their unused crop fields. */
export function normalizeElementaryMonthlyCrop(crop?: ElementaryMonthlyCropSettings | null): Required<Omit<ElementaryMonthlyCropSettings, 'aspectRatio'>> {
  if (crop?.fit !== 'contain' && crop?.fit !== 'cover') {
    return { fit: 'cover', x: 50, y: 50, zoom: 1 };
  }
  return {
    fit: crop.fit,
    x: bounded(crop.x, 50, 0, 100),
    y: bounded(crop.y, 50, 0, 100),
    zoom: crop.fit === 'contain' ? 1 : bounded(crop.zoom, 1, 1, 3),
  };
}

/** Shared by the editor, draft Preview, and the PDF document. */
export function getElementaryMonthlyPhotoStyle(crop?: ElementaryMonthlyCropSettings | null): CSSProperties {
  const value = normalizeElementaryMonthlyCrop(crop);
  return {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: value.fit,
    objectPosition: `${value.x}% ${value.y}%`,
    transform: value.zoom === 1 ? 'none' : `scale(${value.zoom})`,
    transformOrigin: `${value.x}% ${value.y}%`,
  };
}

/** Use monthly override metadata first, then legacy URL, then the assigned student's master photo. */
export function resolveElementaryMonthlyIdentityPhoto(
  photoDoc: Pick<ElementaryMonthlyStudentPhotoDoc, 'identityPhoto' | 'identityPhotoUrl'> | null | undefined,
  masterPhotoUrl?: string | null,
): ElementaryMonthlyIdentityPhoto | null {
  if (photoDoc?.identityPhoto?.url?.trim()) return { ...photoDoc.identityPhoto, url: photoDoc.identityPhoto.url.trim() };
  if (photoDoc?.identityPhotoUrl?.trim()) return { url: photoDoc.identityPhotoUrl.trim() };
  if (masterPhotoUrl?.trim()) return { url: masterPhotoUrl.trim(), cropSettings: { ...DEFAULT_ELEMENTARY_MONTHLY_CROP } };
  return null;
}
