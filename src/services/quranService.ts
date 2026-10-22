import { db, auth } from '../lib/firebase';
import { 
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp, increment 
} from 'firebase/firestore';
import { getActiveStudents, getClasses } from '../lib/firebase';

export interface QuranParticipant {
  studentUid: string;
  studentName: string;
  classId: string;
  className: string;
  unit: 'ELEMENTARY';
  status: 'active' | 'inactive';
  registeredByUid: string;
  registeredAt?: any;
  updatedByUid?: string;
  updatedAt?: any;
}

export interface QuranReadingLog {
  id?: string;
  studentUid: string;
  studentName: string;
  classId: string;
  className: string;
  unit: 'ELEMENTARY';
  readDate: string; // YYYY-MM-DD
  juz: number; // 1-30
  surahNumber: number;
  surahName: string;
  ayat: number;
  note?: string;
  createdAt?: any;
  updatedAt?: any;
  editCount: number;
  source: 'app';
}

export interface QuranReadingLogHistory {
  id?: string;
  readDate: string;
  juz: number;
  surahNumber: number;
  surahName: string;
  ayat: number;
  note?: string;
  changedAt?: any;
  changedByUid: string;
}

// Service helper functions for Sahabat Quran Phase 2
export async function getQuranParticipant(studentUid: string): Promise<QuranParticipant | null> {
  try {
    const docRef = doc(db, 'elementary_quran_participants', studentUid);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as QuranParticipant;
    }
    return null;
  } catch (err) {
    console.error('Error fetching quran participant:', err);
    return null;
  }
}

export async function registerQuranParticipant(
  studentUid: string, 
  studentName: string, 
  classId: string, 
  className: string,
  currentUserId: string
): Promise<void> {
  const docRef = doc(db, 'elementary_quran_participants', studentUid);
  await setDoc(docRef, {
    studentUid,
    studentName,
    classId: classId || '',
    className: className || '',
    unit: 'ELEMENTARY',
    status: 'active',
    registeredByUid: currentUserId,
    registeredAt: serverTimestamp(),
    updatedByUid: currentUserId,
    updatedAt: serverTimestamp()
  });
}

export async function updateQuranParticipantStatus(
  studentUid: string, 
  status: 'active' | 'inactive', 
  currentUserId: string
): Promise<void> {
  const docRef = doc(db, 'elementary_quran_participants', studentUid);
  await updateDoc(docRef, {
    status,
    updatedByUid: currentUserId,
    updatedAt: serverTimestamp()
  });
}

export async function getQuranReadingLogs(): Promise<QuranReadingLog[]> {
  try {
    const snap = await getDocs(collection(db, 'elementary_quran_reading_logs'));
    const list: QuranReadingLog[] = [];
    snap.forEach(docSnap => {
      list.push({ id: docSnap.id, ...(docSnap.data() as any) });
    });
    return list;
  } catch (err) {
    console.error('Error fetching quran reading logs:', err);
    throw err;
  }
}

export async function deleteQuranReadingLog(logId: string): Promise<void> {
  const docRef = doc(db, 'elementary_quran_reading_logs', logId);
  await deleteDoc(docRef);
}
