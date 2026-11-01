import { auth } from './firebase';

export const ELEMENTARY_MONTHLY_PAGE_WIDTH = 794;
export const ELEMENTARY_MONTHLY_PAGE_HEIGHT = 1123;
export const ELEMENTARY_MONTHLY_RENDER_TIMEOUT = 45000;

export interface ElementaryMonthlyAssetScope {
  classId: string;
  studentId: string;
  academicYear: string;
  semester: string;
  month: string;
}

export function extractElementaryMonthlyDriveFileId(source: string): string | null {
  try {
    const url = new URL(source, window.location.origin);
    if (url.origin === window.location.origin) {
      const match = url.pathname.match(/^\/api\/elementary-monthly\/(?:photo-stream|reports\/assets)\/([\w-]+)$/);
      return match?.[1] || null;
    }
    if (!['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com', 'lh3.googleusercontent.com'].includes(url.hostname)) {
      return null;
    }
    const fileId = url.pathname.match(/\/(?:file\/)?d\/([\w-]+)/)?.[1] || url.searchParams.get('id');
    return fileId && /^[\w-]+$/.test(fileId) ? fileId : null;
  } catch {
    return null;
  }
}

function abortError(): Error {
  return new Error('Pemuatan laporan dibatalkan.');
}

export function withMonthlyRenderTimeout<T>(promise: Promise<T>, label: string, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (error: unknown, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve(value as T);
    };
    const onAbort = () => finish(abortError());
    const timer = setTimeout(() => finish(new Error(`${label} melewati batas waktu. Muat ulang lalu coba lagi.`)), ELEMENTARY_MONTHLY_RENDER_TIMEOUT);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    promise.then(value => finish(null, value), error => finish(error));
  });
}

function blobAsDataUrl(blob: Blob, signal?: AbortSignal): Promise<string> {
  return withMonthlyRenderTimeout(new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Berkas gambar tidak dapat dibaca.'));
    reader.readAsDataURL(blob);
  }), 'Pembacaan gambar', signal);
}

/**
 * Fetches bytes before capture. Firebase credentials are sent only to this app;
 * private Drive references use the scoped, authenticated report asset endpoint.
 * No permissions or Drive objects are changed by this read operation.
 */
export async function resolveElementaryMonthlyImage(
  source: string,
  scope: ElementaryMonthlyAssetScope,
  signal?: AbortSignal
): Promise<string> {
  if (!source) return '';
  if (source.startsWith('data:')) {
    if (!/^data:image\/[a-z0-9.+-]+[;,]/i.test(source)) throw new Error('Sumber gambar bukan gambar yang valid.');
    return source;
  }

  const fileId = extractElementaryMonthlyDriveFileId(source);
  let url: URL;
  const headers: Record<string, string> = {};
  if (fileId) {
    if (Object.values(scope).some(value => !value)) {
      throw new Error('Konteks kelas, siswa, dan periode diperlukan untuk memuat foto Drive privat.');
    }
    const query = new URLSearchParams(scope as unknown as Record<string, string>);
    url = new URL(`/api/elementary-monthly/reports/assets/${encodeURIComponent(fileId)}?${query}`, window.location.origin);
  } else {
    url = new URL(source, window.location.origin);
  }

  if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
    const user = auth.currentUser;
    if (!user) throw new Error('Sesi login diperlukan untuk memuat gambar laporan privat.');
    headers.Authorization = `Bearer ${await user.getIdToken()}`;
  } else if (url.protocol !== 'https:' && url.protocol !== 'blob:' && url.origin !== window.location.origin) {
    throw new Error('Alamat gambar harus menggunakan HTTPS atau sumber lokal yang valid.');
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), ELEMENTARY_MONTHLY_RENDER_TIMEOUT);
  try {
    if (signal?.aborted) throw abortError();
    const response = await fetch(url.href, {
      headers,
      credentials: url.origin === window.location.origin ? 'same-origin' : 'omit',
      signal: controller.signal,
      cache: 'no-store'
    });
    if (!response.ok) {
      throw new Error(`Gambar laporan tidak dapat diakses (HTTP ${response.status}). Periksa izin akun dan sumber gambar.`);
    }
    const blob = await response.blob();
    if (!blob.type.toLowerCase().startsWith('image/') || blob.size === 0) {
      throw new Error('Sumber gambar mengembalikan berkas kosong atau bukan gambar.');
    }
    return await blobAsDataUrl(blob, signal);
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error('Pemuatan gambar melewati batas waktu. Gambar belum siap untuk PDF.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function waitForImage(image: HTMLImageElement, signal?: AbortSignal): Promise<void> {
  const label = image.alt || 'Gambar laporan';
  await withMonthlyRenderTimeout(new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
      signal?.removeEventListener('abort', aborted);
    };
    const loaded = () => {
      cleanup();
      if (image.naturalWidth > 0 && image.naturalHeight > 0) resolve();
      else reject(new Error(`${label} tidak memiliki data gambar yang valid.`));
    };
    const failed = () => { cleanup(); reject(new Error(`${label} gagal dimuat. PDF belum dapat dibuat.`)); };
    const aborted = () => { cleanup(); reject(abortError()); };
    image.addEventListener('load', loaded, { once: true });
    image.addEventListener('error', failed, { once: true });
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
    else if (image.complete) loaded();
  }), `Pemuatan ${label}`, signal);
  if (typeof image.decode === 'function') {
    await withMonthlyRenderTimeout(image.decode(), `Decode ${label}`, signal);
  }
}

export function assertElementaryMonthlyPageLayout(pages: HTMLElement[]): void {
  if (pages.length === 0) throw new Error('Halaman laporan tidak ditemukan.');
  pages.forEach((page, index) => {
    const rect = page.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) throw new Error('Renderer laporan harus terpasang dan terlihat saat PDF dibuat.');
    if (Math.abs(rect.width - ELEMENTARY_MONTHLY_PAGE_WIDTH) > 1) {
      throw new Error(`Lebar halaman ${index + 1} tidak sesuai A4. Muat ulang pratinjau.`);
    }
    if (rect.height > ELEMENTARY_MONTHLY_PAGE_HEIGHT + 1 || page.scrollHeight > ELEMENTARY_MONTHLY_PAGE_HEIGHT + 1) {
      throw new Error(`Konten halaman ${index + 1} melebihi A4 (${Math.ceil(rect.height)} px). Konten tetap ditampilkan utuh. Penataan halaman atau panjang narasi/caption perlu disesuaikan sebelum membuat PDF dua halaman.`);
    }
    if (page.scrollWidth > page.clientWidth + 1) {
      throw new Error(`Konten halaman ${index + 1} melewati batas kanan A4. Periksa teks atau tautan yang terlalu panjang.`);
    }
  });
}

/** Readiness is successful font loading, image loading/decoding, and measured layout. */
export async function waitForElementaryMonthlyPages(pages: HTMLElement[], signal?: AbortSignal): Promise<void> {
  if (pages.length === 0) throw new Error('Halaman laporan tidak ditemukan.');
  const document = pages[0].ownerDocument;
  if (document.fonts) {
    const fonts = new Set<string>();
    pages.forEach(page => {
      [page, ...Array.from(page.querySelectorAll<HTMLElement>('*'))].forEach(element => {
        const style = window.getComputedStyle(element);
        if (style.fontFamily && style.fontSize) fonts.add(`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`);
      });
    });
    await withMonthlyRenderTimeout(Promise.all(Array.from(fonts, font => document.fonts.load(font))), 'Pemuatan font', signal);
    await withMonthlyRenderTimeout(document.fonts.ready, 'Pemuatan font', signal);
    if (Array.from(fonts).some(font => !document.fonts.check(font))) {
      throw new Error('Font laporan belum selesai dimuat. PDF belum dapat dibuat.');
    }
  }
  await Promise.all(pages.flatMap(page => Array.from(page.querySelectorAll('img'))).map(image => waitForImage(image, signal)));
  await withMonthlyRenderTimeout(new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))), 'Penataan halaman', signal);
  if (signal?.aborted) throw abortError();
  assertElementaryMonthlyPageLayout(pages);
}
