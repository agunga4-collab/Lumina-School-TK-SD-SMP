import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db, getStudentById } from '../lib/firebase';
import { threeWayConferenceService as original } from './threeWayConferenceService';
import type { StudentConferenceResponse } from '../types';

type ResolvedResponse = StudentConferenceResponse & { documentId: string };

function identity(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function resolveResponse(
  periodId: string,
  studentId: string,
): Promise<ResolvedResponse | null> {
  if (!identity(periodId) || !identity(studentId)) {
    throw new Error('Periode atau identitas siswa tidak valid.');
  }

  const identities = new Set<string>([studentId]);
  const master = await getStudentById(studentId);
  if (master) {
    for (const value of [master.id, master.nis]) {
      const normalized = identity(value);
      if (normalized) identities.add(normalized);
    }
  }

  const candidates = new Map<string, ResolvedResponse>();
  const accept = (documentId: string, data: StudentConferenceResponse) => {
    if (data.periodId !== periodId) {
      throw new Error('Konflik periode pada dokumen respons. Pembacaan dihentikan.');
    }
    const storedIdentities = [data.studentId, data.studentLuminaId]
      .map(identity).filter(Boolean);
    if (!storedIdentities.some(value => identities.has(value))) {
      throw new Error('Konflik identitas siswa pada dokumen respons. Pembacaan dihentikan.');
    }
    candidates.set(documentId, { ...data, documentId });
  };

  for (const value of identities) {
    const snapshot = await getDoc(doc(db, 'studentConferenceResponses', `${periodId}_${value}`));
    if (snapshot.exists()) {
      accept(snapshot.id, snapshot.data() as StudentConferenceResponse);
    }
  }

  // Also check field-based matches, so conflicting duplicate documents are not silently selected.
  for (const value of identities) {
    for (const field of ['studentId', 'studentLuminaId']) {
      const snapshots = await getDocs(query(
        collection(db, 'studentConferenceResponses'),
        where('periodId', '==', periodId),
        where(field, '==', value),
      ));
      snapshots.forEach(snapshot => accept(
        snapshot.id,
        snapshot.data() as StudentConferenceResponse,
      ));
    }
  }

  if (candidates.size > 1) {
    throw new Error('Ditemukan beberapa dokumen respons untuk siswa dan periode yang sama. Perlu rekonsiliasi data; dokumen tidak dipilih otomatis.');
  }
  return candidates.values().next().value ?? null;
}

async function assertSafeWrite(periodId: string, studentId: string): Promise<void> {
  const response = await resolveResponse(periodId, studentId);
  if (!response) throw new Error('Respons tidak ditemukan. Tidak ada perubahan yang disimpan.');
  if (response.documentId !== `${periodId}_${studentId}`) {
    throw new Error('Respons lama berhasil dibaca, tetapi ID dokumennya berbeda dari target penyimpanan. Review/Return diblokir agar tidak membuat duplikat atau mengubah dokumen yang salah. Tidak ada data yang diubah.');
  }
}

export const conferenceDetailSafeService = {
  ...original,

  async getStudentConferenceResponse(periodId: string, studentId: string) {
    return resolveResponse(periodId, studentId);
  },

  async saveTeacherConferenceReview(
    ...args: Parameters<typeof original.saveTeacherConferenceReview>
  ) {
    await assertSafeWrite(args[0], args[1]);
    return original.saveTeacherConferenceReview(...args);
  },

  async respondToRevisionRequest(
    ...args: Parameters<typeof original.respondToRevisionRequest>
  ) {
    await assertSafeWrite(args[0], args[1]);
    return original.respondToRevisionRequest(...args);
  },
};
