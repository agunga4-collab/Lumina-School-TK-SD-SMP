import { 
  collection, 
  doc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  updateDoc, 
  Timestamp,
  getDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  MTSSAcademicDocumentRecord, 
  MTSSAcademicDocumentType 
} from '../types';

const DOCUMENTS_COLLECTION = 'juniorhigh_mtss_academic_documents';

export async function getMTSSAcademicDocuments(caseId: string): Promise<MTSSAcademicDocumentRecord[]> {
  const q = query(
    collection(db, DOCUMENTS_COLLECTION),
    where('caseId', '==', caseId),
    orderBy('generatedAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MTSSAcademicDocumentRecord));
}

export async function saveMTSSAcademicDocumentRecord(
  record: Omit<MTSSAcademicDocumentRecord, 'id' | 'version' | 'status'>
): Promise<string> {
  // Check for existing documents of same type to handle versioning
  const q = query(
    collection(db, DOCUMENTS_COLLECTION),
    where('caseId', '==', record.caseId),
    where('type', '==', record.type)
  );
  
  const snapshot = await getDocs(q);
  let nextVersion = 1;
  const updates: Promise<void>[] = [];
  
  snapshot.docs.forEach(doc => {
    const data = doc.data() as MTSSAcademicDocumentRecord;
    if (data.version >= nextVersion) {
      nextVersion = data.version + 1;
    }
    // Supersede previous "GENERATED" ones
    if (data.status === 'GENERATED') {
      updates.push(updateDoc(doc.ref, { status: 'SUPERSEDED' }));
    }
  });
  
  await Promise.all(updates);
  
  const docRef = await addDoc(collection(db, DOCUMENTS_COLLECTION), {
    ...record,
    version: nextVersion,
    status: 'GENERATED'
  });
  
  return docRef.id;
}
