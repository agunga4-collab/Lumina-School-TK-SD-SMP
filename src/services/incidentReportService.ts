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
    
    // Check reportConfig fallback for Junior High Principal
    const jhConfigDoc = await getDoc(doc(db, 'reportConfig', 'JUNIOR_HIGH'));
    if (jhConfigDoc.exists() && jhConfigDoc.data().principalSignatureUrl) {
      return jhConfigDoc.data().principalSignatureUrl;
    }

    const jhMidtermDoc = await getDoc(doc(db, 'reportConfigs', 'JUNIOR_HIGH_MIDTERM'));
    if (jhMidtermDoc.exists() && jhMidtermDoc.data().principalSignatureUrl) {
      return jhMidtermDoc.data().principalSignatureUrl;
    }

    return null;
  } catch (err) {
    console.error('Error fetching user signature:', err);
    return null;
  }
}

/**
 * Fetch Junior High Signatory Config from Report Config (JH Signatory)
 */
export async function getJHSignatoryConfig(): Promise<{
  principalName: string;
  principalTitle: string;
  principalNIY?: string;
  principalSignatureUrl: string | null;
}> {
  try {
    const jhGeneralDoc = await getDoc(doc(db, 'reportConfig', 'JUNIOR_HIGH'));
    if (jhGeneralDoc.exists()) {
      const data = jhGeneralDoc.data();
      if (data.principalSignatureUrl || data.principalName) {
        return {
          principalName: data.principalName || '',
          principalTitle: data.principalTitle || 'Principal',
          principalNIY: data.principalNIY || '',
          principalSignatureUrl: data.principalSignatureUrl || null,
        };
      }
    }

    const jhMidtermDoc = await getDoc(doc(db, 'reportConfigs', 'JUNIOR_HIGH_MIDTERM'));
    if (jhMidtermDoc.exists()) {
      const data = jhMidtermDoc.data();
      return {
        principalName: data.principalName || '',
        principalTitle: data.principalTitle || 'Principal',
        principalNIY: data.principalNIY || '',
        principalSignatureUrl: data.principalSignatureUrl || null,
      };
    }

    return {
      principalName: '',
      principalTitle: 'Principal',
      principalNIY: '',
      principalSignatureUrl: null,
    };
  } catch (err) {
    console.error('Error fetching JH Signatory Config:', err);
    return {
      principalName: '',
      principalTitle: 'Principal',
      principalNIY: '',
      principalSignatureUrl: null,
    };
  }
}

/**
 * Fetch Junior High official logo from Lumina Admin -> Logo (settings/logos)
 */
export async function getJHLogoUrl(): Promise<string | null> {
  try {
    const logoDoc = await getDoc(doc(db, 'settings', 'logos'));
    if (logoDoc.exists()) {
      const data = logoDoc.data();
      const jhLogo = data?.JUNIOR_HIGH?.rectangular || data?.JUNIOR_HIGH?.square || null;
      if (jhLogo) return jhLogo;
    }

    const local = typeof window !== 'undefined' ? localStorage.getItem('lumina_school_logos') : null;
    if (local) {
      try {
        const parsed = JSON.parse(local);
        const jhLogo = parsed?.JUNIOR_HIGH?.rectangular || parsed?.JUNIOR_HIGH?.square || null;
        if (jhLogo) return jhLogo;
      } catch (e) {
        // ignore JSON parse error
      }
    }

    return null;
  } catch (err) {
    console.error('Error fetching JH Logo:', err);
    return null;
  }
}

/**
 * Fetch Homeroom Teacher (Wali Kelas) name and digital signature for a given class
 */
export async function getHomeroomTeacherForClass(
  classId: string, 
  classNameSnapshot?: string
): Promise<{ name: string; signatureUrl: string | null }> {
  try {
    let classData: any = null;

    // 1. Try fetching class by classId directly
    if (classId) {
      try {
        const classDoc = await getDoc(doc(db, 'classes', classId));
        if (classDoc.exists()) {
          classData = classDoc.data();
        }
      } catch (err) {
        console.warn('Error fetching class by classId:', err);
      }
    }

    // 2. Fallback: Search all classes if classData not found or missing signature
    if ((!classData || !classData.teacherSignatureUrl) && (classNameSnapshot || classId)) {
      try {
        const classesSnap = await getDocs(collection(db, 'classes'));
        const targetSearch = (classNameSnapshot || classId).trim().toLowerCase();

        const matchedDoc = classesSnap.docs.find(d => {
          const cData = d.data();
          const docId = d.id.toLowerCase();
          const cName = (cData.name || cData.className || '').trim().toLowerCase();
          return docId === targetSearch || cName === targetSearch;
        });

        if (matchedDoc) {
          classData = matchedDoc.data();
        }
      } catch (err) {
        console.warn('Error querying classes fallback:', err);
      }
    }

    if (!classData) {
      return { name: '', signatureUrl: null };
    }

    let homeroomTeacherName = classData.homeroomTeacherName || '';
    const homeroomTeacherId = classData.homeroomTeacherId || null;

    // Fallback for homeroom teacher name from assignments if needed
    if (!homeroomTeacherName && Array.isArray(classData.teacherAssignments)) {
      const htAssignment = classData.teacherAssignments.find(
        (ta: any) => ta.role === 'HOMEROOM_TEACHER' || ta.isPrimary
      );
      if (htAssignment) {
        homeroomTeacherName = htAssignment.displayName || htAssignment.name || htAssignment.email || '';
      }
    }

    // If homeroomTeacherName is still empty, get display name ONLY from user doc (NEVER signature!)
    if (!homeroomTeacherName && homeroomTeacherId) {
      try {
        const userDoc = await getDoc(doc(db, 'users', homeroomTeacherId));
        if (userDoc.exists()) {
          const uData = userDoc.data();
          homeroomTeacherName = uData.displayName || uData.name || '';
        }
      } catch (e) {
        console.warn('Error fetching user doc for homeroom teacher name:', e);
      }
    }

    // Get signature URL directly from class data (Manajemen Kelas -> Data Kelas -> Edit Kelas -> Tanda Tangan Digital Guru)
    // NEVER fetch or override with user profile signature.
    const signatureUrl = classData.teacherSignatureUrl || classData.signatureUrl || null;

    return {
      name: (homeroomTeacherName || '').trim(),
      signatureUrl: signatureUrl || null
    };
  } catch (err) {
    console.error('Error fetching homeroom teacher info:', err);
    return { name: '', signatureUrl: null };
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
 * Approve Incident Report (Head Unit / Principal)
 */
export async function approveJHIncidentReport(
  id: string, 
  approverUid: string, 
  approverFallbackName: string
): Promise<void> {
  try {
    const signatory = await getJHSignatoryConfig();
    const ref = doc(db, COLLECTION_NAME, id);

    let finalPrincipalName = signatory.principalName.trim();
    if (!finalPrincipalName && approverUid) {
      const uDoc = await getDoc(doc(db, 'users', approverUid));
      if (uDoc.exists()) {
        finalPrincipalName = uDoc.data().name || uDoc.data().displayName || approverFallbackName;
      } else {
        finalPrincipalName = approverFallbackName;
      }
    }

    let finalSignatureUrl = signatory.principalSignatureUrl;
    if (!finalSignatureUrl && approverUid) {
      finalSignatureUrl = await getUserSignatureUrl(approverUid);
    }
    
    await updateDoc(ref, {
      status: 'APPROVED',
      approvedBy: approverUid,
      approvedByName: finalPrincipalName || 'Kepala Unit Junior High',
      approvedAt: Date.now(),
      principalTitle: signatory.principalTitle || 'Principal',
      principalSignatureUrl: finalSignatureUrl || null,
      principalNIY: signatory.principalNIY || '',
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('Error approving incident report:', err);
    throw err;
  }
}
