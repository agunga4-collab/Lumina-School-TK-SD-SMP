import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  deleteDoc, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MTSSAcademicDraft } from '../types';

const DRAFTS_COLLECTION = 'mtss_academic_drafts';

export async function saveMTSSAcademicDraft(draft: Omit<MTSSAcademicDraft, 'lastSavedAt'>): Promise<void> {
  const draftId = `${draft.userId}_${draft.type}_${draft.caseId || 'new'}`;
  await setDoc(doc(db, DRAFTS_COLLECTION, draftId), {
    ...draft,
    id: draftId,
    lastSavedAt: Date.now()
  });
}

export async function getMTSSAcademicDraft(userId: string, type: MTSSAcademicDraft['type'], caseId?: string): Promise<MTSSAcademicDraft | null> {
  const draftId = `${userId}_${type}_${caseId || 'new'}`;
  const snap = await getDoc(doc(db, DRAFTS_COLLECTION, draftId));
  if (snap.exists()) {
    return snap.data() as MTSSAcademicDraft;
  }
  return null;
}

export async function deleteMTSSAcademicDraft(userId: string, type: MTSSAcademicDraft['type'], caseId?: string): Promise<void> {
  const draftId = `${userId}_${type}_${caseId || 'new'}`;
  await deleteDoc(doc(db, DRAFTS_COLLECTION, draftId));
}

export async function cleanupOldDrafts(userId: string): Promise<void> {
  const q = query(collection(db, DRAFTS_COLLECTION), where('userId', '==', userId));
  const snap = await getDocs(q);
  const now = Date.now();
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  
  const deletions = snap.docs
    .filter(doc => (now - doc.data().lastSavedAt) > ONE_WEEK)
    .map(doc => deleteDoc(doc.ref));
    
  await Promise.all(deletions);
}
