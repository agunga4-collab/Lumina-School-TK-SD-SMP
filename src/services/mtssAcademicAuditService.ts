import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MTSSAcademicAuditRecord, MTSSAcademicAuditAction } from '../types';

const AUDIT_COLLECTION = 'mtss_academic_audits';

export async function logMTSSAcademicAction(params: {
  caseId: string;
  action: MTSSAcademicAuditAction;
  entityType: MTSSAcademicAuditRecord['entityType'];
  entityId: string;
  performedBy: string;
  performedByRole: string;
  beforeSnapshot?: any;
  afterSnapshot?: any;
  note?: string;
}): Promise<void> {
  try {
    await addDoc(collection(db, AUDIT_COLLECTION), {
      ...params,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Failed to log audit record:', error);
    // Non-blocking for UI, but could be sent to some error monitoring
  }
}

export async function getMTSSAcademicAuditLogs(caseId: string, constraints: {
  entityType?: MTSSAcademicAuditRecord['entityType'];
  limitCount?: number;
} = {}): Promise<MTSSAcademicAuditRecord[]> {
  let q = query(
    collection(db, AUDIT_COLLECTION),
    where('caseId', '==', caseId),
    orderBy('timestamp', 'desc')
  );

  if (constraints.entityType) {
    q = query(q, where('entityType', '==', constraints.entityType));
  }

  if (constraints.limitCount) {
    q = query(q, limit(constraints.limitCount));
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MTSSAcademicAuditRecord));
}
