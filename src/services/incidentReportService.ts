import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { IncidentReport } from '../types/incidentReport';

const COLLECTION_NAME = 'incidentReports';

/**
 * Fetch all Junior High Incident Reports
 */
export async function getJHIncidentReports(): Promise<IncidentReport[]> {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('unit', '==', 'JUNIOR_HIGH')
    );
    const snap = await getDocs(q);
    const reports: IncidentReport[] = [];
    
    snap.docs.forEach(d => {
      reports.push({
        id: d.id,
        ...d.data()
      } as IncidentReport);
    });

    // Sort client-side by createdAt desc
    reports.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return reports;
  } catch (err) {
    console.error('Error fetching Junior High incident reports:', err);
    throw err;
  }
}

/**
 * Fetch a user's signature URL from their user profile or reportConfigs
 */
export async function getUserSignatureUrl(userId: string): Promise<string | null> {
  try {
    if (!userId) return null;
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists() && userDoc.data().signatureUrl) {
      return userDoc.data().signatureUrl;
    }
    
    // Check reportConfigs fallback for Junior High Principal
    const jhConfigDoc = await getDoc(doc(db, 'reportConfigs', 'JUNIOR_HIGH_MIDTERM'));
    if (jhConfigDoc.exists() && jhConfigDoc.data().principalSignatureUrl) {
      return jhConfigDoc.data().principalSignatureUrl;
    }

    const jhGeneralDoc = await getDoc(doc(db, 'reportConfigs', 'JUNIOR_HIGH'));
    if (jhGeneralDoc.exists() && jhGeneralDoc.data().principalSignatureUrl) {
      return jhGeneralDoc.data().principalSignatureUrl;
    }

    return null;
  } catch (err) {
    console.error('Error fetching user signature:', err);
    return null;
  }
}

/**
 * Save a new Incident Report (Draft or Submitted)
 */
export async function createJHIncidentReport(reportData: Omit<IncidentReport, 'id'>): Promise<string> {
  try {
    // Try fetching teacher signature URL if available
    let teacherSigUrl = reportData.teacherSignatureUrl;
    if (!teacherSigUrl && reportData.teacherId) {
      teacherSigUrl = await getUserSignatureUrl(reportData.teacherId);
    }

    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...reportData,
      unit: 'JUNIOR_HIGH',
      teacherSignatureUrl: teacherSigUrl || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return docRef.id;
  } catch (err) {
    console.error('Error creating incident report:', err);
    throw err;
  }
}

/**
 * Update an existing Incident Report
 */
export async function updateJHIncidentReport(id: string, reportData: Partial<IncidentReport>): Promise<void> {
  try {
    const ref = doc(db, COLLECTION_NAME, id);
    await updateDoc(ref, {
      ...reportData,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('Error updating incident report:', err);
    throw err;
  }
}

/**
 * Delete an Incident Report (Draft status only)
 */
export async function deleteJHIncidentReport(id: string): Promise<void> {
  try {
    const ref = doc(db, COLLECTION_NAME, id);
    await deleteDoc(ref);
  } catch (err) {
    console.error('Error deleting incident report:', err);
    throw err;
  }
}

/**
 * Submit Incident Report for Approval
 */
export async function submitJHIncidentReport(id: string): Promise<void> {
  try {
    const ref = doc(db, COLLECTION_NAME, id);
    await updateDoc(ref, {
      status: 'MENUNGGU_APPROVAL',
      submittedAt: Date.now(),
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('Error submitting incident report:', err);
    throw err;
  }
}

/**
 * Approve Incident Report (Head Unit)
 */
export async function approveJHIncidentReport(
  id: string, 
  approverUid: string, 
  approverName: string
): Promise<void> {
  try {
    const principalSignatureUrl = await getUserSignatureUrl(approverUid);
    const ref = doc(db, COLLECTION_NAME, id);
    
    await updateDoc(ref, {
      status: 'APPROVED',
      approvedBy: approverUid,
      approvedByName: approverName,
      approvedAt: Date.now(),
      principalSignatureUrl: principalSignatureUrl || null,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('Error approving incident report:', err);
    throw err;
  }
}
