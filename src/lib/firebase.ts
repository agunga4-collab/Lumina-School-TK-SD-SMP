import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, doc, getDoc, setDoc, updateDoc, getDocFromServer, collection, query, where, getDocs, limit, writeBatch, deleteDoc, orderBy, documentId } from 'firebase/firestore';
export { doc, writeBatch };
import { mtssSnapshotTriggerService } from '../services/mtssSnapshotTriggerService.ts';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };
import type { 
  User as AppUser, 
  UserRole, 
  UserStatus, 
  RoleInvite, 
  LearningGoal, 
  LXD, 
  Enrollment, 
  Student, 
  Class,
  Assessment, 
  ReportCard, 
  ReportConfig, 
  ParentStudentLink, 
  ParentReportView, 
  AppNotification, 
  SEPeriod, 
  SEActivity, 
  SEEnrollment, 
  SESessionLog, 
  SESelfAssessment, 
  MTSSCase, 
  MTSSConcern, 
  CICOGoalConfig, 
  CICODailyReport, 
  CICOWeeklyReflection, 
  BIPPlan, 
  BehaviorNotification, 
  BehaviorAnalyticsFilters,
  MTSSAcademicCase,
  MTSSAcademicGoal,
  MTSSAcademicSession,
  MTSSAcademicMeeting,
  MTSSAcademicPlan,
  MTSSAcademicEvaluation,
  MTSSAcademicParentDocument,
  MTSSAcademicTimelinePhase,
  MTSSAcademicTier,
  MTSSAcademicStatus,
  MTSSAcademicDecision,
  MTSSAcademicScreeningResult,
  MTSSAcademicDomain,
  MTSSAcademicAlert,
  UnitType
} from '../types.ts';

const app = initializeApp(firebaseConfig);

const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
const dbId = (firebaseConfig as any).firestoreDatabaseId;

// Initialize Firestore with long polling to avoid idle stream disconnection errors and timeouts in sandboxed environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  host: 'firestore.googleapis.com',
  ssl: true,
  ignoreUndefinedProperties: true,
}, dbId && dbId !== '(default)' ? dbId : undefined);
export const auth = getAuth(app);
export { analytics };
export const googleProvider = new GoogleAuthProvider();

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string; }[];
  }
}

export function handleFirestoreError(error: any, operationType: FirestoreErrorInfo['operationType'], path: string | null = null): never {
  const authInfo = auth.currentUser ? {
    userId: auth.currentUser.uid,
    email: auth.currentUser.email || '',
    emailVerified: auth.currentUser.emailVerified,
    isAnonymous: auth.currentUser.isAnonymous,
    providerInfo: auth.currentUser.providerData.map(p => ({
      providerId: p.providerId,
      displayName: p.displayName || '',
      email: p.email || ''
    }))
  } : {
    userId: 'unauthenticated',
    email: '',
    emailVerified: false,
    isAnonymous: true,
    providerInfo: []
  };

  const errorInfo: FirestoreErrorInfo = {
    error: error.message || String(error),
    operationType,
    path,
    authInfo
  };

  throw new Error(JSON.stringify(errorInfo));
}

// CRITICAL: Validate Connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, '_connection_test_', 'ping'));
  } catch (error: any) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

export async function getUserProfile(uid: string): Promise<AppUser | null> {
  try {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as AppUser;
    }
    return null;
  } catch (err: any) {
    handleFirestoreError(err, 'get', `users/${uid}`);
  }
}

export async function checkRoleInvite(email: string): Promise<RoleInvite | null> {
  const normalizedEmail = email.toLowerCase().trim();
  try {
    const q = query(
      collection(db, 'roleInvites'),
      where('email', '==', normalizedEmail),
      where('status', '==', 'ready'),
      limit(1)
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return { id: doc.id, ...doc.data() } as RoleInvite & { id: string };
    }
    return null;
  } catch (err: any) {
    console.error("[checkRoleInvite] Firestore Error:", err);
    handleFirestoreError(err, 'list', 'roleInvites');
  }
}

export async function createUserOnboarding(user: any): Promise<AppUser> {
  const email = user.email?.toLowerCase().trim() || '';
  
  // First, check if profile exists
  let existingProfile = await getUserProfile(user.uid);
  
  // CRITICAL MAP: If the existing pre-user record has status = "ready", map it safely to "active" (usable immediately)
  if (existingProfile && existingProfile.status === ('ready' as any)) {
    console.log(`[createUserOnboarding] Pre-user record exists with status 'ready' for UID: ${user.uid}. Mapping 'ready' -> 'active' to satisfy Firestore rules.`);
    const updatedProfile: AppUser = {
      ...existingProfile,
      status: 'active' as const
    };
    try {
      console.log(`[createUserOnboarding] [FIRESTORE WRITE] Setting updated profile to users/${user.uid}:`, updatedProfile);
      await setDoc(doc(db, 'users', user.uid), updatedProfile);
      existingProfile = updatedProfile;
    } catch (err: any) {
      console.error(`[createUserOnboarding] Failed to upgrade 'ready' profile to 'active':`, err);
      handleFirestoreError(err, 'create', `users/${user.uid}`);
    }
  }

  // If profile exists AND is already active, return it
  if (existingProfile && existingProfile.status === 'active') {
    return existingProfile;
  }

  // Check for invitation
  const invite = await checkRoleInvite(email);

  if (invite) {
    const inviteWithId = invite as RoleInvite & { id: string };
    const batch = writeBatch(db);

    const profile: AppUser = {
      uid: user.uid,
      email: email,
      displayName: user.displayName || 'User',
      photoURL: user.photoURL || null,
      role: invite.role as UserRole,
      jobTitle: invite.jobTitle || null,
      unitId: invite.unitId,
      luminaId: invite.luminaId || null,
      nickname: invite.nickname || null,
      linkedStudents: invite.linkedStudents || [],
      classId: (invite as any).classId ?? null,
      academicYear: (invite as any).academicYear ?? null,
      status: 'active', // Safely map any invitation status 'ready' -> 'active'
      createdAt: existingProfile?.createdAt || Date.now()
    };

    console.log(`[createUserOnboarding] [FIRESTORE BATCH WRITE] Preparing set users/${user.uid} with status 'active':`, profile);
    batch.set(doc(db, 'users', user.uid), profile);
    
    console.log(`[createUserOnboarding] [FIRESTORE BATCH WRITE] Preparing update roleInvites/${inviteWithId.id} with status 'used'`);
    batch.update(doc(db, 'roleInvites', inviteWithId.id), { status: 'used' });

    // Link newly created UID to any class that was previously assigned using the invite placeholder
    try {
      const classesQuery = query(collection(db, 'classes'), where('homeroomTeacherId', '==', `INVITE_${inviteWithId.id}`));
      const classesSnap = await getDocs(classesQuery);
      classesSnap.docs.forEach(d => {
        console.log(`[createUserOnboarding] [FIRESTORE BATCH WRITE] Preparing update classes/${d.id} homeroomTeacherId -> ${user.uid}`);
        batch.update(d.ref, { 
          homeroomTeacherId: user.uid,
          homeroomTeacherName: profile.displayName // Update to real name without "(UNDANGAN)"
        });
      });
    } catch (err) {
      console.warn("[Onboarding] Failed to link classes to new user UID:", err);
    }

    try {
      console.log(`[createUserOnboarding] [FIRESTORE COMMIT] Executing onboarding batch for user: ${email}`);
      await batch.commit();
      return profile;
    } catch (err: any) {
      handleFirestoreError(err, 'write', `onboarding/${user.uid}`);
    }
  } else {
    // Also check if they are linked via parentStudentLinks directly!
    let directLink: any = null;
    try {
      const linkSnap = await getDoc(doc(db, 'parentStudentLinks', email));
      if (linkSnap.exists()) {
        directLink = linkSnap.data();
      }
    } catch (linkErr) {
      console.warn("[Onboarding] Failed to check direct parent student links:", linkErr);
    }

    if (directLink && Array.isArray(directLink.studentIds) && directLink.studentIds.length > 0) {
      const profile: AppUser = {
        uid: user.uid,
        email: email,
        displayName: user.displayName || 'User',
        photoURL: user.photoURL || null,
        role: 'PARENT',
        unitId: 'JUNIOR_HIGH',
        classId: null,
        academicYear: '2025/2026',
        linkedStudents: directLink.studentIds,
        status: 'active',
        createdAt: existingProfile?.createdAt || Date.now()
      };
      try {
        console.log(`[createUserOnboarding] [FIRESTORE WRITE] Creating direct parent link user profile users/${user.uid} as 'active':`, profile);
        await setDoc(doc(db, 'users', user.uid), profile);
        return profile;
      } catch (err: any) {
        handleFirestoreError(err, 'create', `users/${user.uid}`);
      }
    } else {
      // If no invite found, but profile exists without status, update it to pending
      // If profile doesn't exist, create it as pending
      const profile: AppUser = {
        uid: user.uid,
        email: email,
        displayName: user.displayName || 'User',
        photoURL: user.photoURL || null,
        role: existingProfile?.role || 'GUEST',
        unitId: existingProfile?.unitId || 'JUNIOR_HIGH',
        classId: existingProfile?.classId ?? null,
        academicYear: existingProfile?.academicYear ?? null,
        status: 'pending',
        createdAt: existingProfile?.createdAt || Date.now()
      };

      try {
        console.log(`[createUserOnboarding] [FIRESTORE WRITE] Creating fallback pending user profile users/${user.uid} as 'pending':`, profile);
        await setDoc(doc(db, 'users', user.uid), profile);
        return profile;
      } catch (err: any) {
        handleFirestoreError(err, 'create', `users/${user.uid}`);
      }
    }
  }
}

// --- Admin Section ---

export async function getAllInvites(): Promise<(RoleInvite & { id: string })[]> {
  try {
    const q = query(collection(db, 'roleInvites'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RoleInvite & { id: string }));
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'roleInvites');
  }
}

export async function getPendingUsers(): Promise<AppUser[]> {
  try {
    const q = query(collection(db, 'users'), where('status', '==', 'pending'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as AppUser);
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'users/pending');
  }
}

export async function addInvite(invite: Omit<RoleInvite, 'createdAt'>): Promise<string> {
  try {
    const docRef = doc(collection(db, 'roleInvites'));
    await setDoc(docRef, { ...invite, createdAt: Date.now() });
    return docRef.id;
  } catch (err: any) {
    handleFirestoreError(err, 'create', 'roleInvites');
  }
}

export async function updateInvite(id: string, updates: Partial<RoleInvite>): Promise<void> {
  try {
    await updateDoc(doc(db, 'roleInvites', id), updates);
  } catch (err: any) {
    handleFirestoreError(err, 'update', `roleInvites/${id}`);
  }
}

export async function deleteInvite(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'roleInvites', id));
  } catch (err: any) {
    handleFirestoreError(err, 'delete', `roleInvites/${id}`);
  }
}

export async function activateUser(uid: string, inviteData?: RoleInvite): Promise<void> {
  try {
    const userRef = doc(db, 'users', uid);
    const updates: any = { status: 'active' };
    
    if (inviteData) {
      updates.role = inviteData.role;
      updates.unitId = inviteData.unitId;
      updates.jobTitle = inviteData.jobTitle || null;
      updates.luminaId = inviteData.luminaId || null;
      updates.nickname = inviteData.nickname || null;
      updates.linkedStudents = inviteData.linkedStudents || [];
      updates.classId = (inviteData as any).classId ?? null;
      updates.academicYear = (inviteData as any).academicYear ?? null;
    }
    
    await updateDoc(userRef, updates);
  } catch (err: any) {
    handleFirestoreError(err, 'update', `users/${uid}/activate`);
  }
}

// --- Learning Goals Section ---

export async function getLearningGoals(filters?: { 
  unitId?: string, 
  grade?: string, 
  subject?: string, 
  academicYear?: string,
  isActive?: boolean 
}): Promise<LearningGoal[]> {
  try {
    let q = query(collection(db, 'learning_goals'));
    
    // Simple client-side filtering or multiple where clauses if needed.
    // For now, let's just fetch all and filter client-side if we want to avoid index issues,
    // or build a clean query.
    if (filters) {
      if (filters.unitId) q = query(q, where('unitId', '==', filters.unitId));
      if (filters.grade) q = query(q, where('grade', '==', filters.grade));
      if (filters.subject) q = query(q, where('subject', '==', filters.subject));
      if (filters.academicYear) q = query(q, where('academicYear', '==', filters.academicYear));
      if (filters.isActive !== undefined) q = query(q, where('isActive', '==', filters.isActive));
    }
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LearningGoal));
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'learning_goals');
  }
}

export async function addLearningGoal(lg: Omit<LearningGoal, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  try {
    // Check for duplicates (unitId + grade + subject + goalText)
    const q = query(
      collection(db, 'learning_goals'),
      where('unitId', '==', lg.unitId),
      where('grade', '==', lg.grade),
      where('subject', '==', lg.subject),
      where('goalText', '==', lg.goalText)
    );
    const dupSnapshot = await getDocs(q);
    if (!dupSnapshot.empty) {
      throw new Error("Tujuan pembelajaran (Learning Goal) ini sudah ada untuk unit, kelas, dan mata pelajaran yang sama.");
    }

    const docRef = doc(collection(db, 'learning_goals'));
    const now = Date.now();
    await setDoc(docRef, {
      ...lg,
      id: docRef.id,
      createdAt: now,
      updatedAt: now
    });
    return docRef.id;
  } catch (err: any) {
    if (err.message && err.message.includes("sudah ada")) throw err;
    handleFirestoreError(err, 'create', 'learning_goals');
  }
}

export async function updateLearningGoal(id: string, updates: Partial<LearningGoal>): Promise<void> {
  try {
    await updateDoc(doc(db, 'learning_goals', id), {
      ...updates,
      updatedAt: Date.now()
    });
  } catch (err: any) {
    handleFirestoreError(err, 'update', `learning_goals/${id}`);
  }
}

export async function deleteLearningGoal(id: string): Promise<void> {
  try {
    // Check if used in LXD (Prompt 2 will introduce LXD)
    // For now, we perform a check against 'lxd' collection
    const q = query(collection(db, 'lxd'), where('learningGoalIds', 'array-contains', id));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const count = snapshot.size;
      throw new Error(`LG ini sudah digunakan di ${count} LXD, tidak dapat dihapus. Gunakan fitur Arsipkan untuk menonaktifkan.`);
    }

    await deleteDoc(doc(db, 'learning_goals', id));
  } catch (err: any) {
    if (err.message && err.message.includes("sudah digunakan")) throw err;
    handleFirestoreError(err, 'delete', `learning_goals/${id}`);
  }
}

export async function getLearningGoalCountBySubject(subject: string, grade: string): Promise<number> {
  try {
    const q = query(
      collection(db, 'learning_goals'),
      where('subject', '==', subject),
      where('grade', '==', grade)
    );
    const snapshot = await getDocs(q);
    return snapshot.size;
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'learning_goals/count');
  }
}

// --- LXD Section ---

export async function getLXDList(filters?: {
  unitId?: string,
  grade?: string,
  subject?: string,
  semester?: string,
  academicYear?: string,
  status?: string,
  type?: string,
  userEmail?: string,
  userRole?: UserRole
}): Promise<LXD[]> {
  try {
    let q = query(collection(db, 'lxd'));

    if (filters) {
      if (filters.unitId) q = query(q, where('unitId', '==', filters.unitId));
      if (filters.grade) q = query(q, where('grade', '==', filters.grade));
      if (filters.subject) q = query(q, where('subject', '==', filters.subject));
      if (filters.semester) q = query(q, where('semester', '==', filters.semester));
      if (filters.academicYear) q = query(q, where('academicYear', '==', filters.academicYear));
      if (filters.status) q = query(q, where('status', '==', filters.status));
      if (filters.type) q = query(q, where('type', '==', filters.type));
    }

    const snapshot = await getDocs(q);
    let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LXD));

    // Client-side filtering for Teacher role
    if (filters?.userRole === 'TEACHER' && filters.userEmail) {
      results = results.filter(lx => {
        const isCreator = lx.createdBy === filters.userEmail;
        const isPublished = lx.status === 'PUBLISHED';
        const isInLJTeam = lx.type === 'LEARNING_JOURNEY' && lx.teachers?.some(t => t.email === filters.userEmail);
        
        return isCreator || isPublished || isInLJTeam;
      });
    }

    return results;
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'lxd');
  }
}

export async function getLXDById(id: string): Promise<LXD | null> {
  try {
    const docSnap = await getDoc(doc(db, 'lxd', id));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as LXD;
    }
    return null;
  } catch (err: any) {
    handleFirestoreError(err, 'get', `lxd/${id}`);
  }
}

export async function addLXD(lxData: Omit<LXD, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  try {
    const docRef = doc(collection(db, 'lxd'));
    const now = Date.now();
    await setDoc(docRef, {
      ...lxData,
      id: docRef.id,
      createdAt: now,
      updatedAt: now
    });
    return docRef.id;
  } catch (err: any) {
    handleFirestoreError(err, 'create', 'lxd');
  }
}

export async function updateLXD(id: string, updates: Partial<LXD>): Promise<void> {
  try {
    await updateDoc(doc(db, 'lxd', id), {
      ...updates,
      updatedAt: Date.now()
    });
  } catch (err: any) {
    handleFirestoreError(err, 'update', `lxd/${id}`);
  }
}

export async function deleteLXD(id: string): Promise<void> {
  try {
    const q = query(collection(db, 'assessments'), where('lxdId', '==', id));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      throw new Error(`LXD ini sudah digunakan dalam asesmen, tidak dapat dihapus. Gunakan fitur Draft untuk menonaktifkan.`);
    }

    await deleteDoc(doc(db, 'lxd', id));
  } catch (err: any) {
    if (err.message && err.message.includes("sudah digunakan")) throw err;
    handleFirestoreError(err, 'delete', `lxd/${id}`);
  }
}

// --- Behavior Notifications Section ---

export async function getBehaviorNotifications(userId: string): Promise<BehaviorNotification[]> {
  try {
    const q = query(
      collection(db, 'behavior_notifications'),
      where('targetUserIds', 'array-contains', userId)
    );
    const snap = await getDocs(q);
    const now = Date.now();
    // Filter out dismissed ones and expired ones client-side
    return snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as BehaviorNotification))
      .filter(n => !n.isDismissed?.[userId] && n.expiresAt > now)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'behavior_notifications');
  }
}

export async function markBehaviorNotificationAsRead(notifId: string, userId: string): Promise<void> {
  try {
    const ref = doc(db, 'behavior_notifications', notifId);
    await updateDoc(ref, {
      [`isRead.${userId}`]: true
    });
  } catch (err: any) {
    handleFirestoreError(err, 'update', `behavior_notifications/${notifId}/read`);
  }
}

export async function dismissBehaviorNotification(notifId: string, userId: string): Promise<void> {
  try {
    const ref = doc(db, 'behavior_notifications', notifId);
    await updateDoc(ref, {
      [`isDismissed.${userId}`]: true
    });
  } catch (err: any) {
    handleFirestoreError(err, 'update', `behavior_notifications/${notifId}/dismiss`);
  }
}

export async function markAllBehaviorNotificationsRead(userId: string, notifIds: string[]): Promise<void> {
  try {
    const batch = writeBatch(db);
    notifIds.forEach(id => {
      batch.update(doc(db, 'behavior_notifications', id), {
        [`isRead.${userId}`]: true
      });
    });
    await batch.commit();
  } catch (err: any) {
    handleFirestoreError(err, 'update', 'behavior_notifications/markAllRead');
  }
}

export async function createBehaviorAlert(alert: Omit<BehaviorNotification, 'id' | 'createdAt' | 'expiresAt' | 'isRead' | 'isDismissed'>): Promise<string> {
  try {
    // Check for existing unread similar alert for same case and type to prevent spam
    const existingQ = query(
      collection(db, 'behavior_notifications'),
      where('caseId', '==', alert.caseId),
      where('type', '==', alert.type),
      where('expiresAt', '>', Date.now())
    );
    const existingSnap = await getDocs(existingQ);
    
    // If there's an existing one created in the last 24 hours, don't recreate
    const recentOne = existingSnap.docs.find(d => {
      const data = d.data();
      return data.createdAt > Date.now() - (24 * 60 * 60 * 1000);
    });
    
    if (recentOne) return recentOne.id;

    const docRef = doc(collection(db, 'behavior_notifications'));
    const now = Date.now();
    
    // Initial isRead/isDismissed
    const isRead: Record<string, boolean> = {};
    const isDismissed: Record<string, boolean> = {};
    alert.targetUserIds.forEach(uid => {
      isRead[uid] = false;
      isDismissed[uid] = false;
    });

    await setDoc(docRef, {
      ...alert,
      id: docRef.id,
      isRead,
      isDismissed,
      createdAt: now,
      expiresAt: now + (30 * 24 * 60 * 60 * 1000) // 30 days
    });
    return docRef.id;
  } catch (err: any) {
    handleFirestoreError(err, 'create', 'behavior_notifications');
  }
}

// --- Assessment Section ---

export async function getAssessments(filters?: {
  classId?: string,
  subject?: string,
  semester?: string,
  academicYear?: string,
  userEmail?: string,
  userRole?: UserRole
}): Promise<Assessment[]> {
  try {
    let q = query(collection(db, 'assessments'));

    if (filters) {
      if (filters.classId) q = query(q, where('classId', '==', filters.classId));
      if (filters.subject) q = query(q, where('subject', '==', filters.subject));
      if (filters.semester) q = query(q, where('semester', '==', filters.semester));
      if (filters.academicYear) q = query(q, where('academicYear', '==', filters.academicYear));
    }

    const snapshot = await getDocs(q);
    let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assessment));

    if (filters?.userRole === 'TEACHER' && filters.userEmail) {
       results = results.filter(a => a.assessedBy === filters.userEmail);
    }

    return results;
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'assessments');
  }
}

export async function getAssessmentById(id: string): Promise<Assessment | null> {
  try {
    const docSnap = await getDoc(doc(db, 'assessments', id));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Assessment;
    }
    return null;
  } catch (err: any) {
    handleFirestoreError(err, 'get', `assessments/${id}`);
  }
}

export async function addAssessment(assessmentData: Omit<Assessment, 'id' | 'assessedAt' | 'updatedAt'>): Promise<string> {
  try {
    const q = query(
      collection(db, 'assessments'),
      where('lxdId', '==', assessmentData.lxdId),
      where('classId', '==', assessmentData.classId),
      where('assessmentLabel', '==', assessmentData.assessmentLabel)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      throw new Error(`Sesi asesmen dengan label "${assessmentData.assessmentLabel}" sudah ada untuk LXD dan kelas ini.`);
    }

    const docRef = doc(collection(db, 'assessments'));
    const now = Date.now();
    await setDoc(docRef, {
      ...assessmentData,
      id: docRef.id,
      assessedAt: now,
      updatedAt: now
    });
    return docRef.id;
  } catch (err: any) {
    if (err.message && err.message.includes("sudah ada")) throw err;
    handleFirestoreError(err, 'create', 'assessments');
  }
}

export async function updateAssessment(id: string, updates: Partial<Assessment>): Promise<void> {
  try {
    await updateDoc(doc(db, 'assessments', id), {
      ...updates,
      updatedAt: Date.now()
    });
  } catch (err: any) {
    handleFirestoreError(err, 'update', `assessments/${id}`);
  }
}

export async function deleteAssessment(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'assessments', id));
  } catch (err: any) {
    handleFirestoreError(err, 'delete', `assessments/${id}`);
  }
}

// --- Student & Enrollment Helpers ---

export async function getEnrollmentsByClass(classId: string, academicYear: string): Promise<Enrollment[]> {
  try {
    const classNames = [classId];
    try {
      const classDoc = await getDoc(doc(db, 'classes', classId));
      if (classDoc.exists()) {
        const cData = classDoc.data();
        if (cData && cData.name && !classNames.includes(cData.name)) {
          classNames.push(cData.name);
        }
      }
    } catch (e) {
      console.warn("Could not fetch class doc or resolve name", e);
    }

    const q = query(
      collection(db, 'enrollments'),
      where('classId', 'in', classNames),
      where('academicYear', '==', academicYear)
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => doc.data() as Enrollment);
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'enrollments');
  }
}

export async function getStudentsByClass(classId: string, academicYear: string): Promise<Student[]> {
  try {
    const enrollments = await getEnrollmentsByClass(classId, academicYear);
    if (enrollments.length === 0) return [];

    const studentIds = enrollments.map(e => e.studentId);
    const students: Student[] = [];
    const chunks = [];
    for (let i = 0; i < studentIds.length; i += 10) {
      chunks.push(studentIds.slice(i, i + 10));
    }

    for (const chunk of chunks) {
      const q = query(collection(db, 'students'), where(documentId(), 'in', chunk));
      const snap = await getDocs(q);
      students.push(...snap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || data.fullName || 'Siswa Tanpa Nama',
          ...data
        } as Student;
      }));
    }

    return students.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'students/byClass');
  }
}

export async function getActiveStudents(classId: string, activeYear: string): Promise<Student[]> {
  try {
    let enrollments: Enrollment[] = [];
    if (classId && classId !== 'ALL' && classId !== 'all') {
      const classKeys = [classId];
      try {
        const classSnap = await getDoc(doc(db, 'classes', classId));
        if (classSnap.exists()) {
          const clsData = classSnap.data();
          if (clsData.name && !classKeys.includes(clsData.name)) classKeys.push(clsData.name);
          if (clsData.classId && !classKeys.includes(clsData.classId)) classKeys.push(clsData.classId);
        }
      } catch (e) {
        console.warn("Could not fetch class doc in active students query:", e);
      }

      // Query enrollments for all potential classId keys (UUIDs or Name strings)
      const queries = classKeys.map(key => 
        query(
          collection(db, 'enrollments'),
          where('academicYear', '==', activeYear),
          where('status', '==', 'active'),
          where('classId', '==', key)
        )
      );

      const snaps = await Promise.all(queries.map(q => getDocs(q)));
      snaps.forEach(snap => {
        snap.docs.forEach(d => {
          const data = d.data() as Enrollment;
          if (!enrollments.some(e => e.studentId === data.studentId)) {
            enrollments.push(data);
          }
        });
      });
    } else {
      const q = query(
        collection(db, 'enrollments'),
        where('academicYear', '==', activeYear),
        where('status', '==', 'active')
      );
      const snap = await getDocs(q);
      enrollments = snap.docs.map(doc => doc.data() as Enrollment);
    }

    if (enrollments.length === 0) return [];

    const studentIds = enrollments.map(e => e.studentId);
    const students: Student[] = [];
    const chunks = [];
    for (let i = 0; i < studentIds.length; i += 10) {
      chunks.push(studentIds.slice(i, i + 10));
    }

    for (const chunk of chunks) {
      const sq = query(collection(db, 'students'), where(documentId(), 'in', chunk));
      const sSnap = await getDocs(sq);
      students.push(...sSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || data.fullName || 'Siswa Tanpa Nama',
          ...data
        } as Student;
      }));
    }

    return students.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'enrollments/active-students');
  }
}

export async function getLearningGoalsByIds(ids: string[]): Promise<LearningGoal[]> {
  if (ids.length === 0) return [];
  try {
    const lgs: LearningGoal[] = [];
    const chunks = [];
    for (let i = 0; i < ids.length; i += 10) {
      chunks.push(ids.slice(i, i + 10));
    }
    for (const chunk of chunks) {
      const q = query(collection(db, 'learning_goals'), where('id', 'in', chunk));
      const snap = await getDocs(q);
      lgs.push(...snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as LearningGoal)));
    }
    return lgs;
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'learning_goals/byIds');
  }
}

// --- Report Card Section ---

export async function getReportCards(filters?: {
  unitId?: string,
  classId?: string,
  academicYear?: string,
  semester?: string,
  status?: string
}): Promise<ReportCard[]> {
  try {
    let q = query(collection(db, 'reportCards'));
    if (filters) {
      if (filters.unitId) q = query(q, where('unitId', '==', filters.unitId));
      if (filters.classId) q = query(q, where('classId', '==', filters.classId));
      if (filters.academicYear) q = query(q, where('academicYear', '==', filters.academicYear));
      if (filters.semester) q = query(q, where('semester', '==', filters.semester));
      if (filters.status) q = query(q, where('status', '==', filters.status));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReportCard));
  } catch (err: any) {
    const isPermissionError = err.message && (
      err.message.includes('permission') || 
      err.message.includes('Permission') || 
      err.message.includes('PERMISSION_DENIED') ||
      err.code === 'permission-denied'
    );
    if (isPermissionError) {
      console.warn("[getReportCards] Query list permission denied, falling back to direct getDoc of specifically allowed/notified reports.");
      try {
        const allowedReportIds = new Set<string>();
        
        // 1. Get IDs from parentReportViews
        const userEmail = auth.currentUser?.email;
        if (userEmail) {
          const views = await getParentReportViews(userEmail).catch(() => []);
          for (const v of views) {
            if (v.reportId) allowedReportIds.add(v.reportId);
            if (Array.isArray(v.reportIds)) {
              v.reportIds.forEach((id: string) => id && allowedReportIds.add(id));
            }
            if (Array.isArray((v as any).items)) {
              (v as any).items.forEach((item: any) => {
                if (item && item.reportId) allowedReportIds.add(item.reportId);
              });
            }
          }
        }
        
        // 2. Scan notifications
        const userId = auth.currentUser?.email || auth.currentUser?.uid;
        if (userId) {
          const notifications = await getNotifications(userId).catch(() => []);
          if (notifications) {
            for (const n of notifications) {
              if (n.link) {
                const match = n.link.match(/\/academic\/rapor\/([a-zA-Z0-9_\-]+)/);
                if (match && match[1]) {
                  allowedReportIds.add(match[1]);
                }
              }
            }
          }
        }
        
        if (allowedReportIds.size > 0) {
          const docSnaps = await Promise.all(
            Array.from(allowedReportIds).map(id => getDoc(doc(db, 'reportCards', id)).catch(() => null))
          );
          const reports = docSnaps
            .filter(s => s && s.exists())
            .map(s => ({ id: s!.id, ...s!.data() } as ReportCard));
            
          return reports.filter(rc => {
            if (!rc) return false;
            if (rc.status !== 'PUBLISHED') return false;
            if (filters) {
              if (filters.unitId && rc.unitId !== filters.unitId) return false;
              if (filters.classId && rc.classId !== filters.classId) return false;
              if (filters.academicYear && rc.academicYear !== filters.academicYear) return false;
              if (filters.semester && rc.semester !== filters.semester) return false;
            }
            return true;
          });
        }
      } catch (fallbackErr) {
        console.warn("[getReportCards] Fallback direct getDoc lookup error:", fallbackErr);
      }
      return [];
    }
    handleFirestoreError(err, 'list', 'reportCards');
  }
}

export async function getReportCardById(id: string): Promise<ReportCard | null> {
  try {
    const docSnap = await getDoc(doc(db, 'reportCards', id));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as ReportCard;
    }
    return null;
  } catch (err: any) {
    handleFirestoreError(err, 'get', `reportCards/${id}`);
  }
}

export async function addReportCard(data: Omit<ReportCard, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  try {
    const docRef = doc(collection(db, 'reportCards'));
    const now = Date.now();
    await setDoc(docRef, {
      ...data,
      id: docRef.id,
      createdAt: now,
      updatedAt: now
    });
    return docRef.id;
  } catch (err: any) {
    handleFirestoreError(err, 'create', 'reportCards');
  }
}

export async function updateReportCard(id: string, updates: Partial<ReportCard>): Promise<void> {
  try {
    await updateDoc(doc(db, 'reportCards', id), {
      ...updates,
      updatedAt: Date.now()
    });
  } catch (err: any) {
    handleFirestoreError(err, 'update', `reportCards/${id}`);
  }
}

export async function publishReportCard(reportId: string): Promise<void> {
  try {
    const reportRef = doc(db, 'reportCards', reportId);
    const reportSnap = await getDoc(reportRef);
    if (!reportSnap.exists()) throw new Error("Report not found");
    const reportData = reportSnap.data() as ReportCard;

    await updateDoc(reportRef, {
      status: 'PUBLISHED',
      publishedAt: Date.now()
    });

    // Notify Students and Parents
    for (const sr of reportData.studentReports) {
      // Notify Student
      const studentsUserQuery = query(collection(db, 'users'), where('studentId', '==', sr.studentId));
      const studentUsersSnap = await getDocs(studentsUserQuery);
      
      studentUsersSnap.docs.forEach(d => {
        const userData = d.data();
        if (userData.email) {
          sendNotification({
            userId: userData.email,
            type: 'REPORT_PUBLISHED',
            message: `Rapor kamu (${reportData.period}) sudah tersedia di portal!`,
            link: '/student/reports'
          });
        }
      });

      // Notify Parents
      const linksQuery = query(collection(db, 'parentStudentLinks'), where('studentId', '==', sr.studentId));
      const linksSnap = await getDocs(linksQuery);
      
      linksSnap.docs.forEach(d => {
        const link = d.data() as any;
        if (link.parentEmail) {
          sendNotification({
            userId: link.parentEmail,
            type: 'REPORT_PUBLISHED',
            message: `Rapor ${sr.studentName} (${reportData.period}) sudah tersedia di portal orang tua.`,
            link: '/parent/reports'
          });
        }
      });
    }
  } catch (err: any) {
    handleFirestoreError(err, 'update', `reportCards/${reportId}/publish`);
  }
}

export async function getReportConfig(unitId: string): Promise<ReportConfig | null> {
  try {
    const docSnap = await getDoc(doc(db, 'reportConfig', unitId));
    if (docSnap.exists()) {
      return docSnap.data() as ReportConfig;
    }
    return null;
  } catch (err: any) {
    handleFirestoreError(err, 'get', `reportConfig/${unitId}`);
  }
}

export async function updateReportConfig(unitId: string, config: ReportConfig): Promise<void> {
  try {
    await setDoc(doc(db, 'reportConfig', unitId), config);
  } catch (err: any) {
    handleFirestoreError(err, 'update', `reportConfig/${unitId}`);
  }
}

export async function getStudentById(id: string): Promise<Student | null> {
  const cleanId = String(id).trim();
  if (!cleanId) return null;

  const isNumeric = /^\d+$/.test(cleanId);
  const queryVals: any[] = [cleanId];
  if (isNumeric) {
    queryVals.push(parseInt(cleanId, 10));
  }
  const uniqueQueryVals = Array.from(new Set(queryVals));

  // 1. Try "students" collection
  try {
    const docSnap = await getDoc(doc(db, 'students', cleanId));
    if (docSnap.exists()) {
      const rawData = docSnap.data();
      return { 
        id: String(rawData.luminaId || docSnap.id), 
        luminaId: String(rawData.luminaId || docSnap.id),
        docId: docSnap.id,
        firebaseId: docSnap.id,
        ...rawData,
        name: rawData.name || rawData.fullName || rawData.displayName || "Ananda"
      } as unknown as Student;
    }
  } catch (err: any) {
    console.warn("[getStudentById] Direct students document lookup failed:", err.message);
  }

  // 1b. Try "students" collection by luminaId search
  try {
    const qStudent = query(collection(db, 'students'), where('luminaId', 'in', uniqueQueryVals));
    const qStudentSnap = await getDocs(qStudent);
    if (!qStudentSnap.empty) {
      const rawData = qStudentSnap.docs[0].data();
      return {
        id: String(rawData.luminaId || qStudentSnap.docs[0].id),
        luminaId: String(rawData.luminaId || qStudentSnap.docs[0].id),
        docId: qStudentSnap.docs[0].id,
        firebaseId: qStudentSnap.docs[0].id,
        ...rawData,
        name: rawData.name || rawData.fullName || rawData.displayName || "Ananda"
      } as unknown as Student;
    }
  } catch (err: any) {
    console.warn("[getStudentById] Students collection search failed:", err.message);
  }

  // 2. Try "roleInvites" collection (as document ID)
  try {
    const inviteRef = doc(db, 'roleInvites', cleanId);
    const inviteSnap = await getDoc(inviteRef);
    if (inviteSnap.exists()) {
      const inviteData = inviteSnap.data();
      if (inviteData.role === 'STUDENT') {
        return {
          id: cleanId,
          luminaId: String(inviteData.luminaId || cleanId),
          name: inviteData.name,
          email: inviteData.email,
          classId: inviteData.classId || inviteData.jobTitle || 'TBD',
          unitId: inviteData.unitId,
          academicYear: inviteData.academicYear || '2025/2026',
          parentEmail: inviteData.parentEmail || '',
          status: inviteData.status || 'ready'
        } as unknown as Student;
      }
    }
  } catch (err: any) {
    // Suppress verbose error logging for parent profiles
    console.debug("[getStudentById] Direct roleInvites lookup bypass:", err.message);
  }

  // 3. Try "roleInvites" collection by luminaId search
  try {
    const qInvite = query(collection(db, 'roleInvites'), where('luminaId', 'in', uniqueQueryVals), where('role', '==', 'STUDENT'));
    const qInviteSnap = await getDocs(qInvite);
    if (!qInviteSnap.empty) {
      const inviteData = qInviteSnap.docs[0].data();
      return {
        id: qInviteSnap.docs[0].id,
        luminaId: String(inviteData.luminaId || cleanId),
        name: inviteData.name,
        email: inviteData.email,
        classId: inviteData.classId || inviteData.jobTitle || 'TBD',
        unitId: inviteData.unitId,
        academicYear: inviteData.academicYear || '2025/2026',
        parentEmail: inviteData.parentEmail || '',
        status: inviteData.status || 'ready'
      } as unknown as Student;
    }
  } catch (err: any) {
    console.debug("[getStudentById] RoleInvites search query bypass:", err.message);
  }

  // 4. Try "users" collection (as document ID)
  try {
    const userRef = doc(db, 'users', cleanId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const uData = userSnap.data();
      if (uData.role === 'STUDENT') {
        return {
          id: cleanId,
          luminaId: String(uData.luminaId || cleanId),
          name: uData.displayName,
          email: uData.email,
          classId: uData.classId || 'TBD',
          unitId: uData.unitId,
          academicYear: uData.academicYear || '2025/2026',
          parentEmail: uData.parentEmail || '',
          status: uData.status
        } as unknown as Student;
      }
    }
  } catch (err: any) {
    console.debug("[getStudentById] Direct users lookup bypass:", err.message);
  }

  // 5. Try "users" collection by luminaId search
  try {
    const qUser = query(collection(db, 'users'), where('luminaId', 'in', uniqueQueryVals), where('role', '==', 'STUDENT'));
    const qUserSnap = await getDocs(qUser);
    if (!qUserSnap.empty) {
      const uData = qUserSnap.docs[0].data();
      return {
        id: qUserSnap.docs[0].id,
        luminaId: String(uData.luminaId || cleanId),
        name: uData.displayName,
        email: uData.email,
        classId: uData.classId || 'TBD',
        unitId: uData.unitId,
        academicYear: uData.academicYear || '2025/2026',
        parentEmail: uData.parentEmail || '',
        status: uData.status
      } as unknown as Student;
    }
  } catch (err: any) {
    console.debug("[getStudentById] Users search query bypass:", err.message);
  }

  return null;
}

// --- Self Exploration Section ---

export async function getSEPeriods(unitId: string): Promise<SEPeriod[]> {
  try {
    const q = query(collection(db, 'sePeriods'), where('unitId', '==', unitId));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SEPeriod)).sort((a, b) => b.createdAt - a.createdAt);
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'sePeriods');
  }
}

export async function saveSEPeriod(period: Omit<SEPeriod, 'id' | 'createdAt'>): Promise<string> {
  try {
    const docRef = doc(collection(db, 'sePeriods'));
    await setDoc(docRef, { ...period, id: docRef.id, createdAt: Date.now() });
    return docRef.id;
  } catch (err: any) {
    handleFirestoreError(err, 'create', 'sePeriods');
  }
}

export async function toggleSEPeriodActive(periodId: string, isActive: boolean, unitId: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    if (isActive) {
      // Deactivate others
      const q = query(collection(db, 'sePeriods'), where('unitId', '==', unitId), where('isActive', '==', true));
      const snap = await getDocs(q);
      snap.docs.forEach(d => batch.update(d.ref, { isActive: false }));
    }
    batch.update(doc(db, 'sePeriods', periodId), { isActive });
    await batch.commit();
  } catch (err: any) {
    handleFirestoreError(err, 'update', 'sePeriods/toggle');
  }
}

export async function getSEActivities(unitId: string): Promise<SEActivity[]> {
  try {
    const q = query(collection(db, 'seActivities'), where('unitId', '==', unitId));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SEActivity));
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'seActivities');
  }
}

export async function saveSEActivity(activity: Omit<SEActivity, 'id'> & { id?: string }): Promise<void> {
  try {
    const docRef = activity.id ? doc(db, 'seActivities', activity.id) : doc(collection(db, 'seActivities'));
    await setDoc(docRef, { ...activity, id: docRef.id }, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'write', 'seActivities');
  }
}

export async function getSEEnrollment(periodId: string, studentId: string): Promise<SEEnrollment | null> {
  try {
    const q = query(collection(db, 'seEnrollments'), where('periodId', '==', periodId), where('studentId', '==', studentId));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as SEEnrollment;
  } catch (err: any) {
    handleFirestoreError(err, 'get', 'seEnrollments');
  }
}

export async function saveSEEnrollment(enrollment: Omit<SEEnrollment, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<void> {
  try {
    const docRef = enrollment.id ? doc(db, 'seEnrollments', enrollment.id) : doc(collection(db, 'seEnrollments'));
    const now = Date.now();
    await setDoc(docRef, {
      ...enrollment,
      id: docRef.id,
      updatedAt: now,
      createdAt: enrollment.id ? undefined : now
    }, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'write', 'seEnrollments');
  }
}

export async function getSESessionLogs(enrollmentId: string, slot?: 1 | 2): Promise<SESessionLog[]> {
  try {
    let q = query(collection(db, 'seSessionLogs'), where('enrollmentId', '==', enrollmentId));
    if (slot) q = query(q, where('choiceSlot', '==', slot));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SESessionLog)).sort((a, b) => a.sessionNumber - b.sessionNumber);
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'seSessionLogs');
  }
}

export async function saveSESessionLog(log: Omit<SESessionLog, 'id' | 'createdAt'> & { id?: string }): Promise<void> {
  try {
    const docRef = log.id ? doc(db, 'seSessionLogs', log.id) : doc(collection(db, 'seSessionLogs'));
    await setDoc(docRef, { ...log, id: docRef.id, createdAt: log.id ? undefined : Date.now() }, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'write', 'seSessionLogs');
  }
}

export async function submitSESelfAssessment(assessment: Omit<SESelfAssessment, 'id' | 'submittedAt'>): Promise<void> {
  try {
    const docRef = doc(collection(db, 'seSelfAssessments'));
    await setDoc(docRef, { ...assessment, id: docRef.id, submittedAt: Date.now() });
    
    // Update enrollment status to SELF_ASSESSED if all slots assessed? 
    // Or check at enrollment level.
  } catch (err: any) {
    handleFirestoreError(err, 'create', 'seSelfAssessments');
  }
}

export async function getSESelfAssessments(enrollmentId: string): Promise<SESelfAssessment[]> {
  try {
    const q = query(collection(db, 'seSelfAssessments'), where('enrollmentId', '==', enrollmentId));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SESelfAssessment));
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'seSelfAssessments');
  }
}

export async function getSEEnrollmentsByClass(classId: string, periodId: string): Promise<SEEnrollment[]> {
  try {
    const q = query(collection(db, 'seEnrollments'), where('classId', '==', classId), where('periodId', '==', periodId));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SEEnrollment));
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'seEnrollments');
  }
}

export async function approveSEEnrollment(enrollmentId: string, slot: 1 | 2, approvedBy: string): Promise<void> {
  try {
    const docSnap = await getDoc(doc(db, 'seEnrollments', enrollmentId));
    if (!docSnap.exists()) return;
    const enrollment = docSnap.data() as SEEnrollment;
    const choices = enrollment.choices.map(c => {
      if (c.slot === slot) {
        return { 
          ...c, 
          approvalStatus: 'APPROVED' as const, 
          approvedBy, 
          approvedAt: Date.now(),
          approvalNote: null 
        };
      }
      return c;
    });

    const allApproved = choices.every(c => c.approvalStatus === 'APPROVED');
    await updateDoc(doc(db, 'seEnrollments', enrollmentId), { 
      choices, 
      status: allApproved ? 'APPROVED' : enrollment.status,
      updatedAt: Date.now()
    });
  } catch (err: any) {
    handleFirestoreError(err, 'update', 'seEnrollments/approve');
  }
}

export async function requestSERevision(enrollmentId: string, slot: 1 | 2, note: string): Promise<void> {
  try {
    const docSnap = await getDoc(doc(db, 'seEnrollments', enrollmentId));
    if (!docSnap.exists()) return;
    const enrollment = docSnap.data() as SEEnrollment;
    const choices = enrollment.choices.map(c => {
      if (c.slot === slot) {
        return { 
          ...c, 
          approvalStatus: 'REVISION_NEEDED' as const, 
          approvalNote: note 
        };
      }
      return c;
    });

    await updateDoc(doc(db, 'seEnrollments', enrollmentId), { 
      choices, 
      status: 'PLANNING', // Return to planning
      updatedAt: Date.now()
    });
  } catch (err: any) {
    handleFirestoreError(err, 'update', 'seEnrollments/revision');
  }
}

export async function saveSETeacherComment(enrollmentId: string, slot: 1 | 2, comment: string): Promise<void> {
  try {
    const docSnap = await getDoc(doc(db, 'seEnrollments', enrollmentId));
    if (!docSnap.exists()) return;
    const enrollment = docSnap.data() as SEEnrollment;
    const choices = enrollment.choices.map(c => {
      if (c.slot === slot) {
        return { ...c, teacherComment: comment };
      }
      return c;
    });

    const allHaveComments = choices.every(c => !!c.teacherComment);
    await updateDoc(doc(db, 'seEnrollments', enrollmentId), { 
      choices, 
      status: allHaveComments ? 'COMPLETED' : enrollment.status,
      updatedAt: Date.now()
    });
  } catch (err: any) {
    handleFirestoreError(err, 'update', 'seEnrollments/comment');
  }
}

export async function getSEEnrollmentById(id: string): Promise<SEEnrollment | null> {
  try {
    const docSnap = await getDoc(doc(db, 'seEnrollments', id));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as SEEnrollment;
    }
    return null;
  } catch (err: any) {
    handleFirestoreError(err, 'get', `seEnrollments/${id}`);
  }
}

export async function deleteSEPeriod(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'sePeriods', id));
  } catch (err: any) {
    handleFirestoreError(err, 'delete', `sePeriods/${id}`);
  }
}

export async function deleteSEActivity(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'seActivities', id));
  } catch (err: any) {
    handleFirestoreError(err, 'delete', `seActivities/${id}`);
  }
}

// --- Parent Section ---

export async function getParentStudentLinks(parentId?: string | null): Promise<ParentStudentLink | null> {
  if (!parentId || typeof parentId !== 'string') {
    return null;
  }
  try {
    const parentIdClean = parentId.toLowerCase().trim();
    const studentIdsSet = new Set<string>();

    // 1. Dapatkan relasi langsung dari dokumen parentStudentLinks/{parentEmailNormalized} (getDoc yang aman)
    try {
      const docSnap = await getDoc(doc(db, 'parentStudentLinks', parentIdClean));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data.studentIds)) {
          data.studentIds.forEach(id => {
            if (id) studentIdsSet.add(String(id));
          });
        }
      }
    } catch (err) {
      console.warn("[getParentStudentLinks] Step 1 direct parentStudentLinks getDoc failed:", err);
    }

    // 2. Dapatkan relasi dari profil user itu sendiri (users/{uid}) jika sedang login (getDoc yang aman)
    if (auth.currentUser?.uid) {
      try {
        const userDocSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          if (Array.isArray(userData?.linkedStudents)) {
            userData.linkedStudents.forEach(id => {
              if (id) studentIdsSet.add(String(id));
            });
          }
        }
      } catch (directUserErr) {
        console.warn("[getParentStudentLinks] Step 2 direct current user fetch failed:", directUserErr);
      }
    }

    if (studentIdsSet.size > 0) {
      return {
        parentId: parentIdClean,
        studentIds: Array.from(studentIdsSet),
        createdBy: 'system_secure_direct_get',
        createdAt: Date.now()
      };
    }

    return null;
  } catch (err: any) {
    console.error("[getParentStudentLinks] Error retrieving parent-student links for:", parentId, err);
    return null;
  }
}

export async function addParentStudentLink(parentId: string, studentIds: string[], createdBy: string): Promise<void> {
  try {
    await setDoc(doc(db, 'parentStudentLinks', parentId), {
      parentId,
      studentIds,
      createdBy,
      createdAt: Date.now()
    });
  } catch (err: any) {
    handleFirestoreError(err, 'write', 'parentStudentLinks');
  }
}

export async function getParentReportViews(parentId: string): Promise<ParentReportView[]> {
  if (!parentId) {
    return [];
  }
  const parentIdClean = parentId.toLowerCase().trim();
  try {
    const candDocIds = new Set<string>();
    candDocIds.add(parentIdClean);
    
    // Get linked student ids and fetch views for student or parent_student
    try {
      const linksInstance = await getParentStudentLinks(parentIdClean);
      if (linksInstance && Array.isArray(linksInstance.studentIds)) {
        for (const sid of linksInstance.studentIds) {
          if (sid) {
            candDocIds.add(sid);
            candDocIds.add(`${parentIdClean}_${sid}`);
          }
        }
      }
    } catch (e) {
      console.warn("[getParentReportViews] Failed to load direct student links:", e);
    }
    
    // Scan notifications for report URLs
    try {
      const notifications = await getNotifications(parentIdClean).catch(() => []);
      if (notifications) {
        for (const n of notifications) {
          if (n.link) {
            const match = n.link.match(/\/academic\/rapor\/([a-zA-Z0-9_\-]+)/);
            if (match && match[1]) {
              candDocIds.add(`${parentIdClean}_${match[1]}`);
            }
          }
        }
      }
    } catch (e) {
      console.warn("[getParentReportViews] Failed to scan notifications for report card IDs:", e);
    }
    
    // Fetch all candidates with getDoc (allowed under the get security rule)
    const viewDocs = await Promise.all(
      Array.from(candDocIds).map(async (docId) => {
        try {
          const docRef = doc(db, 'parentReportViews', docId);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            return { id: snap.id, ...snap.data() } as unknown as ParentReportView;
          }
        } catch (e) {
          // ignore individual lookup failures
        }
        return null;
      })
    );
    
    const results = viewDocs.filter(Boolean) as ParentReportView[];
    
    // Safety fallback: manufacture default view objects for notified report card IDs
    try {
      const notifications = await getNotifications(parentIdClean).catch(() => []);
      if (notifications) {
        for (const n of notifications) {
          if (n.link) {
            const match = n.link.match(/\/academic\/rapor\/([a-zA-Z0-9_\-]+)/);
            if (match && match[1]) {
              const repId = match[1];
              const exists = results.some(r => r.reportId === repId || (Array.isArray((r as any).reportIds) && (r as any).reportIds.includes(repId)));
              if (!exists) {
                results.push({
                  id: `${parentIdClean}_${repId}`,
                  parentId: parentIdClean,
                  reportId: repId
                } as any);
              }
            }
          }
        }
      }
    } catch (e) {
      // ignore
    }

    return results;
  } catch (err: any) {
    console.warn("[getParentReportViews] Failed to retrieve parent report views (benign fallback used):", err);
    return [];
  }
}

export async function markReportAsViewed(parentId: string, reportId: string, studentId: string): Promise<void> {
  try {
    const id = `${parentId}_${reportId}`;
    await setDoc(doc(db, 'parentReportViews', id), {
      parentId,
      reportId,
      studentId,
      viewedAt: Date.now()
    });
  } catch (err: any) {
    handleFirestoreError(err, 'write', 'parentReportViews');
  }
}

// --- Notifications Section ---

export async function getNotifications(userId: string): Promise<AppNotification[]> {
  try {
    const q = query(
      collection(db, 'notifications'), 
      where('userId', '==', userId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as AppNotification))
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'notifications');
  }
}

export async function sendNotification(notif: Omit<AppNotification, 'id' | 'isRead' | 'createdAt'>): Promise<void> {
  try {
    const docRef = doc(collection(db, 'notifications'));
    await setDoc(docRef, {
      ...notif,
      id: docRef.id,
      isRead: false,
      createdAt: Date.now()
    });
  } catch (err: any) {
    handleFirestoreError(err, 'create', 'notifications');
  }
}

export async function markNotificationAsRead(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', id), { isRead: true });
  } catch (err: any) {
    handleFirestoreError(err, 'update', `notifications/${id}`);
  }
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    const q = query(collection(db, 'notifications'), where('userId', '==', userId), where('isRead', '==', false));
    const snapshot = await getDocs(q);
    snapshot.docs.forEach(d => batch.update(d.ref, { isRead: true }));
    await batch.commit();
  } catch (err: any) {
    handleFirestoreError(err, 'update', 'notifications/markAll');
  }
}

// --- MTSS Behavior Section ---

export async function getMTSSCases(filters?: {
  unitId?: string;
  classId?: string;
  academicYear?: string;
  status?: string;
  tier?: string;
}): Promise<MTSSCase[]> {
  try {
    let q = query(collection(db, 'behaviorCases'));
    if (filters) {
      if (filters.unitId) q = query(q, where('unitId', '==', filters.unitId));
      if (filters.classId) q = query(q, where('classId', '==', filters.classId));
      if (filters.academicYear) q = query(q, where('academicYear', '==', filters.academicYear));
      if (filters.status) q = query(q, where('status', '==', filters.status));
      if (filters.tier) q = query(q, where('tier', '==', filters.tier));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MTSSCase));
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'behaviorCases');
  }
}

export async function createMTSSCase(caseData: Omit<MTSSCase, 'id' | 'createdAt' | 'lastUpdatedAt'>): Promise<string> {
  try {
    const docRef = doc(collection(db, 'behaviorCases'));
    const now = Date.now();
    await setDoc(docRef, {
      ...caseData,
      id: docRef.id,
      createdAt: now,
      lastUpdatedAt: now
    });
    mtssSnapshotTriggerService.trigger('BEHAVIOR', docRef.id);
    return docRef.id;
  } catch (err: any) {
    handleFirestoreError(err, 'create', 'behaviorCases');
  }
}

export async function addMTSSConcern(caseId: string, concern: Omit<MTSSConcern, 'id' | 'createdAt'>): Promise<string> {
  try {
    const caseRef = doc(db, 'behaviorCases', caseId);
    const concernRef = doc(collection(caseRef, 'concerns'));
    const now = Date.now();
    
    const batch = writeBatch(db);
    batch.set(concernRef, { ...concern, id: concernRef.id, createdAt: now });
    
    // Update parent case summary
    batch.update(caseRef, {
      lastConcernSummary: concern.description,
      lastConcernDate: now,
      lastUpdatedAt: now,
      totalConcerns: (await getDoc(caseRef)).data()?.totalConcerns + 1 || 1
    });

    await batch.commit();
    mtssSnapshotTriggerService.trigger('BEHAVIOR', caseId);
    return concernRef.id;
  } catch (err: any) {
    handleFirestoreError(err, 'write', `behaviorCases/${caseId}/concerns`);
  }
}

export async function getMTSSConcerns(caseId: string): Promise<MTSSConcern[]> {
  try {
    const q = query(collection(db, 'behaviorCases', caseId, 'concerns'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MTSSConcern)).sort((a, b) => b.createdAt - a.createdAt);
  } catch (err: any) {
    handleFirestoreError(err, 'list', `behaviorCases/${caseId}/concerns`);
  }
}

// --- CICO Section ---

export async function getCICOGoalConfig(caseId: string): Promise<CICOGoalConfig | null> {
  try {
    const docSnap = await getDoc(doc(db, 'cicoGoalConfigs', caseId));
    if (docSnap.exists()) {
      return docSnap.data() as CICOGoalConfig;
    }
    return null;
  } catch (err: any) {
    handleFirestoreError(err, 'get', `cicoGoalConfigs/${caseId}`);
  }
}

export async function saveCICOGoalConfig(config: CICOGoalConfig): Promise<void> {
  try {
    await setDoc(doc(db, 'cicoGoalConfigs', config.caseId), {
      ...config,
      updatedAt: Date.now()
    });
    mtssSnapshotTriggerService.trigger('BEHAVIOR', config.caseId);
  } catch (err: any) {
    handleFirestoreError(err, 'write', `cicoGoalConfigs/${config.caseId}`);
  }
}

export async function getCICODailyReports(caseId: string, startDate?: string, endDate?: string): Promise<CICODailyReport[]> {
  try {
    let q = query(
      collection(db, 'cicoSessions'), 
      where('caseId', '==', caseId)
    );
    
    // Sort logic might be needed on client if date strings are YYYY-MM-DD
    const snapshot = await getDocs(q);
    let reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CICODailyReport));
    
    if (startDate) reports = reports.filter(r => r.date >= startDate);
    if (endDate) reports = reports.filter(r => r.date <= endDate);
    
    return reports.sort((a, b) => b.date.localeCompare(a.date));
  } catch (err: any) {
    handleFirestoreError(err, 'list', `cicoSessions/case/${caseId}`);
  }
}

export async function getCICODailyReport(caseId: string, date: string): Promise<CICODailyReport | null> {
  try {
    const id = `${caseId}_${date}`;
    const docSnap = await getDoc(doc(db, 'cicoSessions', id));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as CICODailyReport;
    }
    return null;
  } catch (err: any) {
    handleFirestoreError(err, 'get', `cicoSessions/${caseId}/${date}`);
  }
}

export async function saveCICODailyReport(report: Omit<CICODailyReport, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<string> {
  try {
    const id = report.id || `${report.caseId}_${report.date}`;
    const docRef = doc(db, 'cicoSessions', id);
    const now = Date.now();
    
    const data = {
      ...report,
      id,
      updatedAt: now,
      createdAt: report.id ? undefined : now
    };
    
    await setDoc(docRef, data, { merge: true });
    mtssSnapshotTriggerService.trigger('BEHAVIOR', report.caseId);
    return id;
  } catch (err: any) {
    handleFirestoreError(err, 'write', 'cicoSessions');
  }
}

export async function getCICOWeeklyReflections(caseId: string): Promise<CICOWeeklyReflection[]> {
  try {
    const q = query(collection(db, 'cicoWeeklyReflections'), where('caseId', '==', caseId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CICOWeeklyReflection));
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'cicoWeeklyReflections');
  }
}

export async function saveCICOWeeklyReflection(reflection: Omit<CICOWeeklyReflection, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<void> {
  try {
    const id = reflection.id || `${reflection.weekStartingDate}_${reflection.caseId}`;
    const docRef = doc(db, 'cicoWeeklyReflections', id);
    const now = Date.now();
    await setDoc(docRef, {
      ...reflection,
      id,
      updatedAt: now,
      createdAt: reflection.id ? undefined : now
    }, { merge: true });
    mtssSnapshotTriggerService.trigger('BEHAVIOR', reflection.caseId);
  } catch (err: any) {
    handleFirestoreError(err, 'write', 'cicoWeeklyReflections');
  }
}

export async function getBIPPlan(caseId: string): Promise<BIPPlan | null> {
  try {
    const q = query(collection(db, 'bipPlans'), where('caseId', '==', caseId));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as BIPPlan;
  } catch (err: any) {
    handleFirestoreError(err, 'get', `bipPlans/case/${caseId}`);
  }
}

export async function getAssessmentsForReport(classId: string, academicYear: string, semester: string): Promise<Assessment[]> {
  try {
    const q = query(
      collection(db, 'assessments'),
      where('classId', '==', classId),
      where('academicYear', '==', academicYear),
      where('semester', '==', semester)
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assessment));
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'assessments/forReport');
  }
}

export async function updateMTSSCase(caseId: string, updates: Partial<MTSSCase>): Promise<void> {
  try {
    const docRef = doc(db, 'behaviorCases', caseId);
    await updateDoc(docRef, {
      ...updates,
      lastUpdatedAt: Date.now()
    });
    mtssSnapshotTriggerService.trigger('BEHAVIOR', caseId);
  } catch (err: any) {
    handleFirestoreError(err, 'update', `behaviorCases/${caseId}`);
  }
}

export async function closeMTSSCase(caseId: string, closingData: MTSSCase['closedInfo']): Promise<void> {
  try {
    const docRef = doc(db, 'behaviorCases', caseId);
    await updateDoc(docRef, {
      status: 'CLOSED',
      closedInfo: closingData,
      lastUpdatedAt: Date.now()
    });
    mtssSnapshotTriggerService.trigger('BEHAVIOR', caseId);
  } catch (err: any) {
    handleFirestoreError(err, 'update', `behaviorCases/${caseId}`);
  }
}

export async function getActiveCaseForStudent(studentId: string): Promise<MTSSCase | null> {
  try {
    const q = query(
      collection(db, 'behaviorCases'),
      where('studentId', '==', studentId),
      where('status', '!=', 'CLOSED')
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as MTSSCase;
  } catch (err: any) {
    handleFirestoreError(err, 'get', 'behaviorCases/active');
  }
}

export async function getTeachers(): Promise<AppUser[]> {
  try {
    // 1. Get active staff
    const q1 = query(
      collection(db, 'users'), 
      where('status', '==', 'active')
    );
    const snap1 = await getDocs(q1);
    const activeOnes = snap1.docs
      .map(doc => ({ uid: doc.id, ...doc.data() } as AppUser))
      .filter(u => ['TEACHER', 'BK_MENTOR', 'HEAD_JUNIOR', 'SUPER_ADMIN', 'HEAD_UNIT', 'STAFF'].includes(u.role));

    // 2. Get ready invites (to break circular dependency: can assign wali kelas before activation)
    const q2 = query(
      collection(db, 'roleInvites'),
      where('status', '==', 'ready')
    );
    const snap2 = await getDocs(q2);
    const invitedOnes = snap2.docs
      .map(doc => {
        const data = doc.data();
        return {
          uid: `INVITE_${doc.id}`, // Placeholder UID
          displayName: `(UNDANGAN) ${data.name || data.email.split('@')[0]}`,
          email: data.email,
          role: data.role as UserRole,
          status: 'pending',
          unitId: data.unitId,
          createdAt: data.createdAt,
          jobTitle: data.jobTitle
        } as AppUser;
      })
      .filter(i => ['TEACHER', 'BK_MENTOR', 'HEAD_JUNIOR', 'SUPER_ADMIN', 'HEAD_UNIT', 'STAFF'].includes(i.role));

    return [...activeOnes, ...invitedOnes].sort((a, b) => a.displayName.localeCompare(b.displayName));
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'users/teachers');
  }
}

export async function getBehaviorAnalyticsData(filters: BehaviorAnalyticsFilters): Promise<{
  cases: MTSSCase[],
  concerns: (MTSSConcern & { caseId: string })[],
  cicoReports: CICODailyReport[],
  alerts: BehaviorNotification[]
}> {
  try {
    // 1. Fetch Cases
    let q = query(collection(db, 'behaviorCases'));
    if (filters.academicYear) q = query(q, where('academicYear', '==', filters.academicYear));
    
    // Additional filtering applied client-side for complex date ranges/grade filters if dynamic queries aren't indexed
    const casesSnap = await getDocs(q);
    let cases = casesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MTSSCase));

    // Client-side Filter
    cases = cases.filter(c => {
      if (filters.grade && !c.classId.startsWith(filters.grade)) return false;
      if (filters.classId && c.classId !== filters.classId) return false;
      if (filters.tier && c.tier !== filters.tier) return false;
      if (filters.status && c.status !== filters.status) return false;
      if (filters.picId && c.picId !== filters.picId) return false;
      return true;
    });

    // 2. Fetch Concerns for filtered cases (for trend and heatmap)
    // To optimize, we only fetch for active cases or those in range
    const concerns: (MTSSConcern & { caseId: string })[] = [];
    // We fetch concerns batch by batch to avoid too many parallel calls
    const caseIds = cases.map(c => c.id);
    const chunks = [];
    for (let i = 0; i < caseIds.length; i += 50) chunks.push(caseIds.slice(i, i + 50));

    for (const chunk of chunks) {
      const promises = chunk.map(async (cid) => {
        const cSnap = await getDocs(query(
          collection(db, 'behaviorCases', cid, 'concerns'),
          where('createdAt', '>=', filters.dateRange.start),
          where('createdAt', '<=', filters.dateRange.end)
        ));
        return cSnap.docs.map(doc => ({ id: doc.id, caseId: cid, ...doc.data() } as MTSSConcern & { caseId: string }));
      });
      const batchRes = await Promise.all(promises);
      batchRes.forEach(res => concerns.push(...res));
    }

    // 3. Fetch CICO Reports 
    let cicoReports: CICODailyReport[] = [];
    const cicoChunk = [];
    for (let i = 0; i < caseIds.length; i += 50) cicoChunk.push(caseIds.slice(i, i + 50));
    
    for (const chunk of cicoChunk) {
      const cicoQ = query(
        collection(db, 'cicoSessions'),
        where('caseId', 'in', chunk)
      );
      const cSnap = await getDocs(cicoQ);
      const batchReports = cSnap.docs.map(doc => doc.data() as CICODailyReport);
      // Filter date range client side for simplicity vs indexing
      cicoReports.push(...batchReports.filter(r => {
        const ts = r.createdAt || new Date(r.date).getTime();
        return ts >= filters.dateRange.start && ts <= filters.dateRange.end;
      }));
    }

    // 4. Fetch Alerts
    const alertsQ = query(
      collection(db, 'behavior_notifications'),
      where('createdAt', '>=', filters.dateRange.start)
    );
    const alertsSnap = await getDocs(alertsQ);
    const alerts = alertsSnap.docs
      .map(doc => doc.data() as BehaviorNotification)
      .filter(a => a.createdAt <= filters.dateRange.end);

    return { cases, concerns, cicoReports, alerts };
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'analytics/behavior');
  }
}

// --- Academic Utilities ---

export async function getStudents(): Promise<Student[]> {
  try {
    const q = query(collection(db, 'students'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'students');
  }
}

export async function getClasses(): Promise<Class[]> {
  try {
    const q = query(collection(db, 'classes'), orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Class));
  } catch (err: any) {
    console.error('Error in getClasses:', err);
    // Fallback without order if index missing
    try {
      const q2 = query(collection(db, 'classes'));
      const snapshot2 = await getDocs(q2);
      return snapshot2.docs.map(doc => ({ id: doc.id, ...doc.data() } as Class));
    } catch (innerErr) {
       handleFirestoreError(innerErr, 'list', 'classes');
       return [];
    }
  }
}

function cleanUndefinedForFirestore<T extends object>(obj: T): T {
  const result = { ...obj } as any;
  for (const key in result) {
    if (result[key] === undefined) {
      result[key] = null;
    }
  }
  return result;
}

export async function addClass(classData: Omit<Class, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  try {
    // Generate ID: unit_year_name (sanitized)
    const sanitizedName = classData.name.replace(/\s+/g, '-');
    const id = `${classData.unitId}_${classData.academicYear.replace(/\//g, '-')}_${sanitizedName}`;
    
    const docRef = doc(db, 'classes', id);
    const now = Date.now();
    await setDoc(docRef, cleanUndefinedForFirestore({
      ...classData,
      id,
      createdAt: now,
      updatedAt: now
    }));
    return id;
  } catch (err: any) {
    handleFirestoreError(err, 'create', 'classes');
  }
}

export async function updateClass(id: string, updates: Partial<Class>): Promise<void> {
  try {
    await updateDoc(doc(db, 'classes', id), cleanUndefinedForFirestore({
      ...updates,
      updatedAt: Date.now()
    }));
  } catch (err: any) {
    handleFirestoreError(err, 'update', `classes/${id}`);
  }
}

export async function deleteClass(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'classes', id));
  } catch (err: any) {
    handleFirestoreError(err, 'delete', `classes/${id}`);
  }
}

export async function getLiteracyProgress(studentId?: string): Promise<any[]> {
  try {
    let q = query(collection(db, 'assessments'), where('category', '==', 'LITERACY'));
    if (studentId) {
      q = query(q, where('studentId', '==', studentId));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err: any) {
    handleFirestoreError(err, 'list', studentId ? `literacyProgress/${studentId}` : 'literacyProgress/all');
  }
}

// --- MTSS Academic Section ---

export async function getMTSSAcademicCases(filters?: {
  schoolUnit?: UnitType;
  academicYear?: string;
  semester?: string;
  tier?: MTSSAcademicTier;
  status?: MTSSAcademicStatus;
  classId?: string;
  picId?: string;
}): Promise<MTSSAcademicCase[]> {
  try {
    let q = query(collection(db, 'juniorhigh_mtss_academic_cases'));

    if (filters) {
      if (filters.schoolUnit) q = query(q, where('schoolUnit', '==', filters.schoolUnit));
      if (filters.academicYear) q = query(q, where('academicYear', '==', filters.academicYear));
      if (filters.semester) q = query(q, where('semester', '==', filters.semester));
      if (filters.tier) q = query(q, where('currentTier', '==', filters.tier));
      if (filters.status) q = query(q, where('status', '==', filters.status));
      if (filters.classId) q = query(q, where('classId', '==', filters.classId));
    }

    const snapshot = await getDocs(q);
    let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MTSSAcademicCase));

    if (filters?.picId) {
      results = results.filter(c => 
        c.assignedTeacherIds.includes(filters.picId!) || 
        c.assignedSubjectTeacherIds.includes(filters.picId!) ||
        c.assignedCounselorIds.includes(filters.picId!) ||
        c.homeroomTeacherId === filters.picId
      );
    }

    return results.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'mtss_academic_cases');
  }
}

export async function getMTSSAcademicCaseById(id: string): Promise<MTSSAcademicCase | null> {
  try {
    const docSnap = await getDoc(doc(db, 'juniorhigh_mtss_academic_cases', id));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as MTSSAcademicCase;
    }
    return null;
  } catch (err: any) {
    handleFirestoreError(err, 'get', `mtss_academic_cases/${id}`);
  }
}

export async function addMTSSAcademicCase(caseData: Omit<MTSSAcademicCase, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  try {
    const docRef = doc(collection(db, 'juniorhigh_mtss_academic_cases'));
    const now = Date.now();
    await setDoc(docRef, {
      ...caseData,
      id: docRef.id,
      createdAt: now,
      updatedAt: now
    });
    mtssSnapshotTriggerService.trigger('ACADEMIC', docRef.id);
    return docRef.id;
  } catch (err: any) {
    handleFirestoreError(err, 'create', 'mtss_academic_cases');
  }
}

export async function updateMTSSAcademicCase(id: string, updates: Partial<MTSSAcademicCase>): Promise<void> {
  try {
    await updateDoc(doc(db, 'juniorhigh_mtss_academic_cases', id), {
      ...updates,
      updatedAt: Date.now()
    });
    mtssSnapshotTriggerService.trigger('ACADEMIC', id);
  } catch (err: any) {
    handleFirestoreError(err, 'update', `mtss_academic_cases/${id}`);
  }
}

export async function getMTSSAcademicGoals(caseId: string): Promise<MTSSAcademicGoal[]> {
  try {
    const q = query(collection(db, 'juniorhigh_mtss_academic_cases', caseId, 'goals'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MTSSAcademicGoal)).sort((a, b) => a.createdAt - b.createdAt);
  } catch (err: any) {
    handleFirestoreError(err, 'list', `mtss_academic_cases/${caseId}/goals`);
  }
}

export async function addMTSSAcademicGoal(caseId: string, goalData: Omit<MTSSAcademicGoal, 'id' | 'caseId' | 'createdAt' | 'updatedAt'>): Promise<string> {
  try {
    const docRef = doc(collection(db, 'juniorhigh_mtss_academic_cases', caseId, 'goals'));
    const now = Date.now();
    await setDoc(docRef, {
      ...goalData,
      id: docRef.id,
      caseId,
      createdAt: now,
      updatedAt: now
    });
    mtssSnapshotTriggerService.trigger('ACADEMIC', caseId);
    return docRef.id;
  } catch (err: any) {
    handleFirestoreError(err, 'create', `mtss_academic_cases/${caseId}/goals`);
  }
}

export async function getMTSSAcademicSessions(caseId: string): Promise<MTSSAcademicSession[]> {
  try {
    const q = query(collection(db, 'juniorhigh_mtss_academic_cases', caseId, 'sessions'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MTSSAcademicSession)).sort((a, b) => b.sessionNo - a.sessionNo);
  } catch (err: any) {
    handleFirestoreError(err, 'list', `mtss_academic_cases/${caseId}/sessions`);
  }
}

export async function addMTSSAcademicSession(caseId: string, sessionData: Omit<MTSSAcademicSession, 'id' | 'caseId' | 'createdAt'>): Promise<string> {
  try {
    const docRef = doc(collection(db, 'juniorhigh_mtss_academic_cases', caseId, 'sessions'));
    const now = Date.now();
    await setDoc(docRef, {
      ...sessionData,
      id: docRef.id,
      caseId,
      createdAt: now
    });
    mtssSnapshotTriggerService.trigger('ACADEMIC', caseId);
    return docRef.id;
  } catch (err: any) {
    handleFirestoreError(err, 'create', `mtss_academic_cases/${caseId}/sessions`);
  }
}

export async function getMTSSAcademicMeetings(caseId: string): Promise<MTSSAcademicMeeting[]> {
  try {
    const q = query(collection(db, 'juniorhigh_mtss_academic_cases', caseId, 'meetings'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MTSSAcademicMeeting)).sort((a, b) => b.date - a.date);
  } catch (err: any) {
    handleFirestoreError(err, 'list', `mtss_academic_cases/${caseId}/meetings`);
  }
}

export async function addMTSSAcademicMeeting(caseId: string, meetingData: Omit<MTSSAcademicMeeting, 'id' | 'caseId' | 'createdAt' | 'updatedAt'>): Promise<string> {
  try {
    const docRef = doc(collection(db, 'juniorhigh_mtss_academic_cases', caseId, 'meetings'));
    const now = Date.now();
    await setDoc(docRef, {
      ...meetingData,
      id: docRef.id,
      caseId,
      createdAt: now,
      updatedAt: now
    });
    mtssSnapshotTriggerService.trigger('ACADEMIC', caseId);
    return docRef.id;
  } catch (err: any) {
    handleFirestoreError(err, 'create', `mtss_academic_cases/${caseId}/meetings`);
  }
}

export async function getMTSSAcademicPlans(caseId: string): Promise<MTSSAcademicPlan[]> {
  try {
    const q = query(collection(db, 'juniorhigh_mtss_academic_cases', caseId, 'plans'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MTSSAcademicPlan)).sort((a, b) => b.createdAt - a.createdAt);
  } catch (err: any) {
    handleFirestoreError(err, 'list', `mtss_academic_cases/${caseId}/plans`);
  }
}

export async function getMTSSAcademicEvaluations(caseId: string): Promise<MTSSAcademicEvaluation[]> {
  try {
    const q = query(collection(db, 'juniorhigh_mtss_academic_cases', caseId, 'evaluations'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MTSSAcademicEvaluation)).sort((a, b) => b.date - a.date);
  } catch (err: any) {
    handleFirestoreError(err, 'list', `mtss_academic_cases/${caseId}/evaluations`);
  }
}

export async function getMTSSAcademicParentDocuments(caseId: string): Promise<MTSSAcademicParentDocument[]> {
  try {
    const q = query(collection(db, 'juniorhigh_mtss_academic_cases', caseId, 'parentDocuments'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MTSSAcademicParentDocument)).sort((a, b) => b.createdAt - a.createdAt);
  } catch (err: any) {
    handleFirestoreError(err, 'list', `mtss_academic_cases/${caseId}/parentDocuments`);
  }
}



export async function createDraftMTSSCaseFromScreening(
  screeningResult: MTSSAcademicScreeningResult,
  reason: string
): Promise<string> {
  try {
    const caseId = `ACAD-${Date.now()}`;
    const domainMap: Record<string, MTSSAcademicDomain> = {
      'BI': 'BAHASA_INDONESIA',
      'ENG': 'ENGLISH',
      'NUM': 'NUMERACY'
    };

    const newCase: MTSSAcademicCase = {
      id: caseId,
      schoolUnit: 'JUNIOR_HIGH',
      academicYear: '2023/2024',
      semester: '1',
      studentId: screeningResult.studentId,
      studentName: screeningResult.studentName,
      classId: screeningResult.classId,
      className: screeningResult.className,
      homeroomTeacherId: '',
      subjectDomains: [domainMap[screeningResult.domain]],
      primaryConcern: reason || screeningResult.basicSkillsBelowExpectation.join(', ') || 'Low academic performance',
      currentTier: 'Tier 1',
      status: 'SCREENING',
      sourceType: 'SCREENING',
      assignedTeacherIds: [],
      assignedSubjectTeacherIds: [],
      assignedCounselorIds: [],
      parentMeetingStatus: 'NOT_STARTED',
      parentCommitmentStatus: 'NOT_SENT',
      latestDecision: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      closedAt: null
    };

    await setDoc(doc(db, 'juniorhigh_mtss_academic_cases', caseId), newCase);
    return caseId;
  } catch (err: any) {
    handleFirestoreError(err, 'create', 'juniorhigh_mtss_academic_cases');
    throw err;
  }
}

// --- Alerts ---

export async function getMTSSAcademicAlerts(filters?: {
  caseId?: string;
  studentId?: string;
  status?: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';
  severity?: string;
}): Promise<MTSSAcademicAlert[]> {
  try {
    let q = query(collection(db, 'juniorhigh_mtss_academic_alerts'));
    
    if (filters?.caseId) q = query(q, where('caseId', '==', filters.caseId));
    if (filters?.studentId) q = query(q, where('studentId', '==', filters.studentId));
    if (filters?.status) q = query(q, where('status', '==', filters.status));
    if (filters?.severity) q = query(q, where('severity', '==', filters.severity));

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MTSSAcademicAlert));
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'juniorhigh_mtss_academic_alerts');
  }
}

export async function upsertMTSSAcademicAlert(alert: Partial<MTSSAcademicAlert> & { id: string }) {
  try {
    const docRef = doc(db, 'juniorhigh_mtss_academic_alerts', alert.id);
    const existing = await getDoc(docRef);
    
    if (existing.exists()) {
      await updateDoc(docRef, { ...alert, updatedAt: Date.now() });
    } else {
      await setDoc(docRef, {
        status: 'OPEN',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...alert
      });
    }
  } catch (err: any) {
    handleFirestoreError(err, 'write', 'juniorhigh_mtss_academic_alerts');
  }
}

export async function resolveMTSSAcademicAlert(alertId: string) {
  try {
    await updateDoc(doc(db, 'juniorhigh_mtss_academic_alerts', alertId), {
      status: 'RESOLVED',
      resolvedAt: Date.now(),
      updatedAt: Date.now()
    });
  } catch (err: any) {
    handleFirestoreError(err, 'write', `juniorhigh_mtss_academic_alerts/${alertId}`);
  }
}

// --- MTSS Academic Tier 1 Assessments ---

export async function getTier1Assessments(academicYear: string, semester: string): Promise<any[]> {
  try {
    const q = query(
      collection(db, 'juniorhigh_mtss_tier1_assessments'),
      where('academicYear', '==', academicYear),
      where('semester', '==', semester)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'juniorhigh_mtss_tier1_assessments');
    return [];
  }
}

export async function saveTier1Assessment(id: string, data: any): Promise<void> {
  try {
    const docRef = doc(db, 'juniorhigh_mtss_tier1_assessments', id);
    const existing = await getDoc(docRef);
    if (existing.exists()) {
      await updateDoc(docRef, {
        ...data,
        updatedAt: Date.now()
      });
    } else {
      await setDoc(docRef, {
        ...data,
        id,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }
  } catch (err: any) {
    handleFirestoreError(err, 'write', `juniorhigh_mtss_tier1_assessments/${id}`);
    throw err;
  }
}

