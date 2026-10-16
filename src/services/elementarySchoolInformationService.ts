import { db, auth } from '../lib/firebase';
import { 
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, 
  query, where, orderBy, serverTimestamp, Timestamp 
} from 'firebase/firestore';

export type SchoolInfoStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type SchoolInfoCategory = 
  | 'Pengumuman' 
  | 'Agenda' 
  | 'Surat Edaran' 
  | 'Kegiatan Sekolah' 
  | 'Prestasi' 
  | 'Akademik'
  | 'Lainnya';

export interface ElementarySchoolInfoAttachment {
  fileName: string;
  fileSize?: number;
  fileUrl: string;
  driveFileId?: string;
  driveViewUrl?: string;
  uploadedAt?: number;
  mimeType?: string;
}

export interface ElementarySchoolInformation {
  id: string;
  title: string;
  category: SchoolInfoCategory | string;
  content: string; // Teks / artikel berparagraf
  summary?: string;
  unit: 'ELEMENTARY';
  targetAudience: string[]; // ['ALL'] atau daftar tingkat kelas ['1', '2', ...] atau nama kelas
  targetGradeNames?: string[]; // Label tampilan target audiens
  status: SchoolInfoStatus;
  isPinned: boolean;
  publishDate: string; // YYYY-MM-DD
  hasPdf: boolean;
  pdfAttachment?: ElementarySchoolInfoAttachment | null;
  authorUid: string;
  authorName: string;
  authorRole?: string;
  authorEmail?: string;
  createdAt?: any;
  updatedAt?: any;
  publishedAt?: any;
}

const COLLECTION_NAME = 'elementary_school_information';

/**
 * Helper to convert file to base64
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Upload PDF attachment via server backend or fallback to data URL
 */
export async function uploadSchoolInformationPdf(file: File): Promise<ElementarySchoolInfoAttachment> {
  if (file.type !== 'application/pdf') {
    throw new Error('File harus berformat PDF (.pdf)');
  }

  // Max 10MB
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Ukuran file PDF maksimal 10MB');
  }

  const base64Data = await fileToBase64(file);

  try {
    const res = await fetch('/api/elementary/school-information/upload-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pdfBase64: base64Data,
        fileName: file.name,
        fileSize: file.size,
        mimeType: 'application/pdf'
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return {
        fileName: data.fileName || file.name,
        fileSize: data.fileSize || file.size,
        fileUrl: data.fileUrl,
        driveFileId: data.driveFileId,
        driveViewUrl: data.driveViewUrl,
        uploadedAt: Date.now(),
        mimeType: 'application/pdf'
      };
    }
    console.warn('[uploadSchoolInformationPdf] Backend drive upload returned error, falling back:', data.error);
  } catch (err: any) {
    console.warn('[uploadSchoolInformationPdf] Backend upload request failed, falling back:', err.message);
  }

  // Fallback: If under 1MB, store data URL directly
  if (file.size <= 1024 * 1024) {
    return {
      fileName: file.name,
      fileSize: file.size,
      fileUrl: base64Data,
      uploadedAt: Date.now(),
      mimeType: 'application/pdf'
    };
  }

  throw new Error('Upload PDF ke penyimpanan gagal. Pastikan koneksi server tersedia atau ukuran file lebih kecil dari 1MB untuk mode lokal.');
}

/**
 * Get all information for elementary staff manager
 */
export async function getElementarySchoolInformationList(filterStatus?: SchoolInfoStatus | 'ALL'): Promise<ElementarySchoolInformation[]> {
  try {
    let q;
    if (filterStatus && filterStatus !== 'ALL') {
      q = query(
        collection(db, COLLECTION_NAME),
        where('unit', '==', 'ELEMENTARY'),
        where('status', '==', filterStatus)
      );
    } else {
      q = query(
        collection(db, COLLECTION_NAME),
        where('unit', '==', 'ELEMENTARY')
      );
    }

    const snap = await getDocs(q);
    const items: ElementarySchoolInformation[] = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : data.createdAt || 0,
        updatedAt: data.updatedAt?.toMillis ? data.updatedAt.toMillis() : data.updatedAt || 0,
        publishedAt: data.publishedAt?.toMillis ? data.publishedAt.toMillis() : data.publishedAt || 0,
      } as ElementarySchoolInformation;
    });

    // Sort: isPinned first, then publishDate/createdAt descending
    items.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const dateA = a.publishDate || (typeof a.createdAt === 'number' ? new Date(a.createdAt).toISOString() : '');
      const dateB = b.publishDate || (typeof b.createdAt === 'number' ? new Date(b.createdAt).toISOString() : '');
      return dateB.localeCompare(dateA);
    });

    return items;
  } catch (err) {
    console.error('Error in getElementarySchoolInformationList:', err);
    throw err;
  }
}

/**
 * Get published information for students, filtered by class/grade
 */
export async function getPublishedElementarySchoolInformationForStudent(options?: {
  classId?: string;
  className?: string;
  grade?: string | number;
}): Promise<ElementarySchoolInformation[]> {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('unit', '==', 'ELEMENTARY'),
      where('status', '==', 'PUBLISHED')
    );

    const snap = await getDocs(q);
    const allPublished: ElementarySchoolInformation[] = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : data.createdAt || 0,
        updatedAt: data.updatedAt?.toMillis ? data.updatedAt.toMillis() : data.updatedAt || 0,
        publishedAt: data.publishedAt?.toMillis ? data.publishedAt.toMillis() : data.publishedAt || 0,
      } as ElementarySchoolInformation;
    });

    // Extract student grade/level
    const gradeStr = options?.grade ? String(options.grade).trim() : '';
    let extractedGrade = '';
    if (options?.className) {
      const m = options.className.match(/^([1-6])/);
      if (m) extractedGrade = m[1];
    }

    // Filter by audience
    const filtered = allPublished.filter(item => {
      const audience = item.targetAudience || ['ALL'];
      if (audience.includes('ALL') || audience.includes('Semua Kelas') || audience.length === 0) {
        return true;
      }
      if (options?.classId && audience.includes(options.classId)) {
        return true;
      }
      if (options?.className && audience.includes(options.className)) {
        return true;
      }
      if (gradeStr && audience.includes(gradeStr)) {
        return true;
      }
      if (extractedGrade && audience.includes(extractedGrade)) {
        return true;
      }
      return false;
    });

    // Sort: isPinned first, then by publishDate descending
    filtered.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const dateA = a.publishDate || (typeof a.createdAt === 'number' ? new Date(a.createdAt).toISOString() : '');
      const dateB = b.publishDate || (typeof b.createdAt === 'number' ? new Date(b.createdAt).toISOString() : '');
      return dateB.localeCompare(dateA);
    });

    return filtered;
  } catch (err) {
    console.error('Error in getPublishedElementarySchoolInformationForStudent:', err);
    return [];
  }
}

/**
 * Create new school information
 */
export async function createElementarySchoolInformation(
  payload: Omit<ElementarySchoolInformation, 'id' | 'createdAt' | 'updatedAt' | 'publishedAt'>
): Promise<string> {
  const colRef = collection(db, COLLECTION_NAME);
  const newDocRef = doc(colRef);

  const cleanData: Record<string, any> = {
    title: payload.title.trim(),
    category: payload.category || 'Pengumuman',
    content: (payload.content || '').trim(),
    unit: 'ELEMENTARY',
    targetAudience: payload.targetAudience && payload.targetAudience.length > 0 ? payload.targetAudience : ['ALL'],
    targetGradeNames: payload.targetGradeNames || ['Semua Kelas Elementary'],
    status: payload.status || 'DRAFT',
    isPinned: Boolean(payload.isPinned),
    publishDate: payload.publishDate || new Date().toISOString().split('T')[0],
    hasPdf: Boolean(payload.hasPdf),
    pdfAttachment: payload.hasPdf && payload.pdfAttachment ? payload.pdfAttachment : null,
    authorUid: payload.authorUid,
    authorName: payload.authorName || 'Staff Elementary',
    authorRole: payload.authorRole || 'Guru',
    authorEmail: payload.authorEmail || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    publishedAt: payload.status === 'PUBLISHED' ? serverTimestamp() : null
  };

  if (payload.summary) {
    cleanData.summary = payload.summary.trim();
  } else if (cleanData.content) {
    // Generate automatic excerpt
    cleanData.summary = cleanData.content.slice(0, 160).trim() + (cleanData.content.length > 160 ? '...' : '');
  }

  await setDoc(newDocRef, cleanData);
  return newDocRef.id;
}

/**
 * Update school information
 */
export async function updateElementarySchoolInformation(
  id: string,
  updates: Partial<ElementarySchoolInformation>
): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, id);
  const updateData: Record<string, any> = {
    ...updates,
    updatedAt: serverTimestamp()
  };

  if (updates.status === 'PUBLISHED' && !updates.publishedAt) {
    updateData.publishedAt = serverTimestamp();
  }

  if (updates.content && !updates.summary) {
    updateData.summary = updates.content.slice(0, 160).trim() + (updates.content.length > 160 ? '...' : '');
  }

  // Don't overwrite id or unit
  delete updateData.id;
  updateData.unit = 'ELEMENTARY';

  await updateDoc(docRef, updateData);
}

/**
 * Delete school information
 */
export async function deleteElementarySchoolInformation(id: string): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, id);
  await deleteDoc(docRef);
}
