import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { 
  User, Calendar, GraduationCap, Heart, BookOpen, 
  Target, Award, ShieldAlert, ChevronRight, Map, 
  Star, MessageCircle, ArrowUpRight, Flame, Smile, LayoutDashboard,
  Loader2, Filter, Image as ImageIcon, SmilePlus, FileText, CheckCircle2,
  AlertCircle, ChevronDown, Download, Camera, Brain, Sparkles, TrendingUp, CheckSquare, ListFilter, PlayCircle,
  Clock
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { auth, db, getParentStudentLinks } from '../../lib/firebase';
import { doc, getDoc, getDocs, collection, query, where, orderBy } from 'firebase/firestore';
import { getKindergartenClasses, getKindergartenStudents, getUnitClasses, getUnitStudents } from '../../lib/kindergartenMetadataCache';
import { ACTIVITY_LABEL_MAP, DOMAIN_LABEL_MAP } from '../../lib/kindergartenWeeklyReport';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { getPeriodLabel, getAreaLabel, getSupportStatusLabel } from '../../constants/elementaryLiteracyBenchmarks';

// Define English style mapping for grading evaluation
const GRADE_STYLES: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  'BSB': { label: 'Highly Developed (BSB)', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'BSH': { label: 'Developed as Expected (BSH)', bg: 'bg-blue-50 text-blue-700 border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
  'MB': { label: 'Starting to Develop (MB)', bg: 'bg-amber-50 text-amber-700 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
  'BB': { label: 'Not Yet Developing (BB)', bg: 'bg-rose-50 text-rose-700 border-rose-200', text: 'text-rose-700', dot: 'bg-rose-500' },
  'SB': { label: 'Very Good (SB)', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'MSH': { label: 'Starting as Expected (MSH)', bg: 'bg-blue-50 text-blue-700 border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
};

const ENGLISH_DOMAIN_LABEL_MAP: Record<string, string> = {
  'AGAMA_BUDI_PEKERTI': 'Religious & Moral Values',
  'Nilai Agama & Budi Pekerti': 'Religious & Moral Values',
  'SOSIAL_EMOSIONAL': 'Social-Emotional',
  'Sosial-Emosional': 'Social-Emotional',
  'BAHASA': 'Language Development',
  'Bahasa': 'Language Development',
  'KOGNITIF': 'Cognitive Development',
  'Kognitif': 'Cognitive Development',
  'FISIK_MOTORIK': 'Physical & Motor Skills',
  'Fisik-Motorik': 'Physical & Motor Skills',
  'SENI': 'Artistic & Creative',
  'Seni': 'Artistic & Creative'
};

function getEnglishDomainLabel(domain: string): string {
  const norm = String(domain || '').trim();
  return ENGLISH_DOMAIN_LABEL_MAP[norm] || norm;
}

function getGradeStyle(grade: string) {
  const clean = String(grade || '').toUpperCase().trim();
  if (GRADE_STYLES[clean]) return GRADE_STYLES[clean];
  
  // Fuzzy match
  for (const k of Object.keys(GRADE_STYLES)) {
    if (clean.includes(k) || k.includes(clean)) {
      return GRADE_STYLES[k];
    }
  }
  return { label: grade || 'Observed', bg: 'bg-slate-50 text-slate-700 border-slate-200', text: 'text-slate-700', dot: 'bg-slate-400' };
}

// Function to calculate Monday of standard week
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isStudentInClass(studClassId: string, activeClass: { id: string; name: string }) {
  const sClass = (studClassId || '').trim().toLowerCase();
  const actId = (activeClass.id || '').trim().toLowerCase();
  const actName = (activeClass.name || '').trim().toLowerCase();
  
  if (!sClass) return false;
  if (sClass === actId || sClass === actName) return true;
  
  const norm = (str: string) => str.replace(/[\s\-_]+/g, '').toLowerCase();
  const normS = norm(sClass);
  const normId = norm(actId);
  const normName = norm(actName);
  
  if (normS === normName || normS === normId) return true;
  
  const hasKoala = (str: string) => str.includes('koala');
  const hasPanda = (str: string) => str.includes('panda');
  const hasCaterpillar = (str: string) => str.includes('caterpillar');
  const hasButterfly = (str: string) => str.includes('butterfly');
  const hasCenderawasih = (str: string) => str.includes('cenderawasih');
  const hasElang = (str: string) => str.includes('elang');
  const hasKakatua = (str: string) => str.includes('kakatua');
  const hasBadak = (str: string) => str.includes('badak');
  const hasKomodo = (str: string) => str.includes('komodo');
  const hasTapir = (str: string) => str.includes('tapir');
  
  if (hasKoala(normS) && hasKoala(normName)) return true;
  if (hasPanda(normS) && hasPanda(normName)) return true;
  if (hasCaterpillar(normS) && hasCaterpillar(normName)) return true;
  if (hasButterfly(normS) && hasButterfly(normName)) return true;
  if (hasCenderawasih(normS) && hasCenderawasih(normName)) return true;
  if (hasElang(normS) && hasElang(normName)) return true;
  if (hasKakatua(normS) && hasKakatua(normName)) return true;
  if (hasBadak(normS) && hasBadak(normName)) return true;
  if (hasKomodo(normS) && hasKomodo(normName)) return true;
  if (hasTapir(normS) && hasTapir(normName)) return true;
  
  return false;
}

export default function StudentPassport() {
  const navigate = useNavigate();
  const { activeYear } = useAcademicYear();
  const outletCtx = useOutletContext<any>() || {};
  const activeUnit = outletCtx.activeUnit || 'KINDERGARTEN';
  const [currentUser, setCurrentUser] = React.useState<any>(null);
  const [userRole, setUserRole] = React.useState<string>('STUDENT');
  const [loading, setLoading] = React.useState(true);

  // Selector states (visible to staff/teachers)
  const [classes, setClasses] = React.useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [students, setStudents] = React.useState<any[]>([]);
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>('');
  
  // Tab states
  const [activeTab, setActiveTab] = React.useState<string>('overview');
  
  // Range states
  const [activeRange, setActiveRange] = React.useState<'all' | 'month' | 'semester'>('all');

  // Compiled raw data
  const [rawAttendance, setRawAttendance] = React.useState<any[]>([]);
  const [rawObservations, setRawObservations] = React.useState<any[]>([]);
  const [rawDrafts, setRawDrafts] = React.useState<any[]>([]);
  const [rawReports, setRawReports] = React.useState<any[]>([]);
  const [elementaryProgress, setElementaryProgress] = React.useState<any[]>([]);
  const [elementaryMTSSCases, setElementaryMTSSCases] = React.useState<any[]>([]);
  const [mtssCoachingSessions, setMtssCoachingSessions] = React.useState<Record<string, any[]>>({});
  const [isDataCompiling, setIsDataCompiling] = React.useState(false);

  // Junior High specific data states
  const [jhLateness, setJhLateness] = React.useState<any[]>([]);
  const [jhAcademicCases, setJhAcademicCases] = React.useState<any[]>([]);
  const [jhAcademicSessions, setJhAcademicSessions] = React.useState<Record<string, any[]>>({});
  const [jhBehaviorCases, setJhBehaviorCases] = React.useState<any[]>([]);
  const [jhBehaviorConcerns, setJhBehaviorConcerns] = React.useState<Record<string, any[]>>({});
  const [jhLiteracyProgress, setJhLiteracyProgress] = React.useState<any[]>([]);
  const [jhSelfExplorationEnrollments, setJhSelfExplorationEnrollments] = React.useState<any[]>([]);
  const [jhSelfExplorationLogs, setJhSelfExplorationLogs] = React.useState<Record<string, any[]>>({});
  const [jhSelfExplorationAssessments, setJhSelfExplorationAssessments] = React.useState<Record<string, any[]>>({});

  // Reset tab on unit transition
  React.useEffect(() => {
    setActiveTab('overview');
  }, [activeUnit]);

  // Load User details first
  React.useEffect(() => {
    const fetchUser = async () => {
      try {
        setLoading(true);
        const user = auth.currentUser;
        if (!user) {
          navigate('/login');
          return;
        }

        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const userData = snap.data();
          setCurrentUser({ uid: user.uid, ...userData });
          setUserRole(userData.role || 'STUDENT');
        } else {
          // Fallback static profile representation
          setCurrentUser({ uid: user.uid, displayName: user.displayName || 'Siswa Lumina', role: 'STUDENT' });
        }
      } catch (err) {
        console.error('Error fetching user context:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [navigate]);

  // Load Classes and Student registries (for Teachers/Admins) or linked students (for Parents)
  React.useEffect(() => {
    if (!currentUser) return;

    const loadRegistries = async () => {
      try {
        const year = activeYear || (activeUnit === 'JUNIOR_HIGH' ? '2026/2027' : '2025/2026');
        const sysClasses = activeUnit === 'JUNIOR_HIGH'
          ? await getUnitClasses('JUNIOR_HIGH', year)
          : activeUnit === 'ELEMENTARY'
            ? await getUnitClasses('ELEMENTARY', year)
            : await getKindergartenClasses(year);
        const sysStudents = activeUnit === 'JUNIOR_HIGH'
          ? await getUnitStudents('JUNIOR_HIGH', year)
          : activeUnit === 'ELEMENTARY'
            ? await getUnitStudents('ELEMENTARY', year)
            : await getKindergartenStudents(year);
        
        setClasses(sysClasses);
        setStudents(sysStudents);

        const isStaff = ['TEACHER', 'HEAD_UNIT', 'SUPER_ADMIN', 'ADMIN'].includes(userRole);

        if (isStaff) {
          // Initialize first class and first student
          if (sysClasses.length > 0) {
            const firstClassObj = sysClasses[0];
            setSelectedClassId(firstClassObj.id);
            
            const classStudents = sysStudents.filter(s => isStudentInClass(s.classId, firstClassObj));
            if (classStudents.length > 0) {
              setSelectedStudentId(classStudents[0].id);
            } else if (sysStudents.length > 0) {
              setSelectedStudentId(sysStudents[0].id);
            }
          } else if (sysStudents.length > 0) {
            setSelectedStudentId(sysStudents[0].id);
          }
        } else if (userRole === 'PARENT') {
          // Retrieve parent linked children
          let parentChildrenIds: string[] = [];
          const emailClean = (currentUser.email || '').toLowerCase().trim();
          
          if (currentUser.linkedStudents && Array.isArray(currentUser.linkedStudents)) {
            parentChildrenIds = currentUser.linkedStudents;
          } else {
            const links = await getParentStudentLinks(emailClean);
            if (links && links.studentIds) {
              parentChildrenIds = links.studentIds;
            }
          }

          if (parentChildrenIds.length > 0) {
            // Check matching student profiles
            const matchedStudents = sysStudents.filter(s => 
              (s.id && parentChildrenIds.includes(s.id)) || 
              (s.id && parentChildrenIds.includes(s.id.toLowerCase())) || 
              parentChildrenIds.some(li => String(li).toLowerCase() === (s.name || '').toLowerCase())
            );

            if (matchedStudents.length > 0) {
              setStudents(matchedStudents);
              setSelectedStudentId(matchedStudents[0].id);
              if (matchedStudents[0].classId) {
                setSelectedClassId(matchedStudents[0].classId);
              }
            } else if (sysStudents.length > 0) {
              // Fallback to searching standard database for matches or choose first
              setSelectedStudentId(parentChildrenIds[0]);
            }
          } else if (sysStudents.length > 0) {
            // Fallback matching by displayName/surname or first student
            setSelectedStudentId(sysStudents[0].id);
          }
        } else {
          // STUDENT role
          const studentId = currentUser.studentId || currentUser.uid || '';
          setSelectedStudentId(studentId);
          
          const profile = sysStudents.find(s => s.id === studentId || (s.name || '').toLowerCase() === (currentUser.displayName || '').toLowerCase());
          if (profile) {
            setSelectedStudentId(profile.id);
            if (profile.classId) {
              setSelectedClassId(profile.classId);
            }
          }
        }
      } catch (err) {
        console.error('Error loading school registers:', err);
      }
    };

    loadRegistries();
  }, [currentUser, userRole, activeYear, activeUnit]);

  // Whenever selectedStudentId changes, pull all data for this student
  React.useEffect(() => {
    if (!selectedStudentId) return;

    let active = true;
    const fetchStudentGrowthData = async () => {
      try {
        setIsDataCompiling(true);
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[StudentPortfolio] Loading development records for student: ${selectedStudentId}`);
        }

        // 1. Fetch raw class attendance
        let attDocs: any[] = [];
        try {
          if (activeUnit === 'ELEMENTARY' || activeUnit === 'JUNIOR_HIGH') {
            const q = query(collection(db, 'attendance_records'), where('studentId', '==', selectedStudentId));
            const snap = await getDocs(q);
            attDocs = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
          } else {
            const snap = await getDocs(collection(db, 'attendance'));
            attDocs = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
          }
        } catch (e) {
          console.warn("[StudentPortfolio] Querying attendance records restricted by rules:", e);
        }

        // 2. Fetch raw observation logs
        let obsDocs: any[] = [];
        try {
          if (activeUnit !== 'ELEMENTARY' && activeUnit !== 'JUNIOR_HIGH') {
            const snap = await getDocs(collection(db, 'observations'));
            obsDocs = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
          }
        } catch (e) {
          console.warn("[StudentPortfolio] Querying all observations rules mismatch:", e);
        }

        // 3. Fetch weekly comments drafts
        let draftDocs: any[] = [];
        try {
          if (activeUnit !== 'ELEMENTARY' && activeUnit !== 'JUNIOR_HIGH') {
            const snap = await getDocs(collection(db, 'weekly_summary_drafts'));
            draftDocs = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
          }
        } catch (e) {
          console.warn("[StudentPortfolio] Reading weekly draft summaries restricted:", e);
        }

        // 4. Fetch published parent reviews
        let publishedReports: any[] = [];
        try {
          if (activeUnit !== 'ELEMENTARY' && activeUnit !== 'JUNIOR_HIGH') {
            const qPub = query(collection(db, 'published_kg_reports'), where('studentId', '==', selectedStudentId));
            const snap = await getDocs(qPub);
            publishedReports = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
          }
        } catch (e) {
          console.warn("[StudentPortfolio] Reading published weekly reports failed:", e);
        }

        // 5. Fetch Elementary Literacy & Numeracy Progress
        let litProgress: any[] = [];
        try {
          if (activeUnit === 'ELEMENTARY') {
            const qLit = query(collection(db, 'elementary_literacy_numeracy_records'), where('studentId', '==', selectedStudentId));
            const snap = await getDocs(qLit);
            litProgress = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
          }
        } catch (e) {
          console.warn("[StudentPortfolio] Reading elementary progress failed:", e);
        }

        // 6. Fetch Elementary MTSS cases
        let mtssCases: any[] = [];
        const sessionsMap: Record<string, any[]> = {};
        try {
          if (activeUnit === 'ELEMENTARY') {
            const qMtss = query(collection(db, 'elementary_mtss_cases'), where('studentId', '==', selectedStudentId));
            const snap = await getDocs(qMtss);
            mtssCases = snap.docs.map(d => ({ docId: d.id, ...d.data() }));

            for (const c of mtssCases) {
              try {
                const qSessions = query(collection(db, `elementary_mtss_cases/${c.docId}/coaching_sessions`), orderBy('createdAt', 'desc'));
                const sSnap = await getDocs(qSessions);
                sessionsMap[c.docId] = sSnap.docs.map(d => ({ docId: d.id, ...d.data() }));
              } catch (err) {
                console.warn(`[StudentPortfolio] Failed to fetch sessions for case ${c.docId}:`, err);
              }
            }
          }
        } catch (e) {
          console.warn("[StudentPortfolio] Reading elementary mtss cases failed:", e);
        }

        // 7. Fetch Junior High specific metrics (Tardiness, MTSS Academic, MTSS Behavior, Literacy Numeracy, Self Exploration)
        let lateDocs: any[] = [];
        let jhAcademicCasesList: any[] = [];
        const jhAcademicSessionsMap: Record<string, any[]> = {};
        let jhBehaviorCasesList: any[] = [];
        const jhBehaviorConcernsMap: Record<string, any[]> = {};
        let jhLitProgressList: any[] = [];
        let jhSelfExplorationEnrollmentsList: any[] = [];
        const jhSelfExplorationLogsMap: Record<string, any[]> = {};
        const jhSelfExplorationAssessmentsMap: Record<string, any[]> = {};

        if (activeUnit === 'JUNIOR_HIGH') {
          // Tardiness
          try {
            const q = query(collection(db, 'lateness_records'), where('studentId', '==', selectedStudentId));
            const snap = await getDocs(q);
            lateDocs = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
          } catch (e) {
            console.warn("[StudentPortfolio] Querying lateness records failed:", e);
          }

          // MTSS Academic
          try {
            const q = query(collection(db, 'juniorhigh_mtss_academic_cases'), where('studentId', '==', selectedStudentId));
            const snap = await getDocs(q);
            jhAcademicCasesList = snap.docs.map(d => ({ docId: d.id, ...d.data() }));

            for (const c of jhAcademicCasesList) {
              try {
                const qSessions = query(collection(db, `juniorhigh_mtss_academic_cases/${c.docId}/sessions`));
                const sSnap = await getDocs(qSessions);
                jhAcademicSessionsMap[c.docId] = sSnap.docs.map(d => ({ docId: d.id, ...d.data() }));
              } catch (err) {
                console.warn(`[StudentPortfolio] Failed to fetch sessions for case ${c.docId}:`, err);
              }
            }
          } catch (e) {
            console.warn("[StudentPortfolio] Querying junior high academic cases failed:", e);
          }

          // MTSS Behavior
          try {
            const q = query(collection(db, 'behaviorCases'), where('studentId', '==', selectedStudentId));
            const snap = await getDocs(q);
            jhBehaviorCasesList = snap.docs.map(d => ({ docId: d.id, ...d.data() }));

            for (const c of jhBehaviorCasesList) {
              try {
                const qConcerns = query(collection(db, `behaviorCases/${c.docId}/concerns`));
                const sSnap = await getDocs(qConcerns);
                jhBehaviorConcernsMap[c.docId] = sSnap.docs.map(d => ({ docId: d.id, ...d.data() }));
              } catch (err) {
                console.warn(`[StudentPortfolio] Failed to fetch concerns for case ${c.docId}:`, err);
              }
            }
          } catch (e) {
            console.warn("[StudentPortfolio] Querying behavior cases failed:", e);
          }

          // Junior High Literacy & Numeracy
          try {
            const q = query(collection(db, 'junior_high_literacy_numeracy_records'), where('studentId', '==', selectedStudentId));
            const snap = await getDocs(q);
            jhLitProgressList = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
          } catch (e) {
            console.warn("[StudentPortfolio] Querying junior high literacy progress failed:", e);
          }

          // Self Exploration
          try {
            const q = query(collection(db, 'seEnrollments'), where('studentId', '==', selectedStudentId));
            const snap = await getDocs(q);
            jhSelfExplorationEnrollmentsList = snap.docs.map(d => ({ docId: d.id, ...d.data() }));

            for (const en of jhSelfExplorationEnrollmentsList) {
              try {
                const qLogs = query(collection(db, 'seSessionLogs'), where('enrollmentId', '==', en.docId));
                const sSnap = await getDocs(qLogs);
                jhSelfExplorationLogsMap[en.docId] = sSnap.docs.map(d => ({ docId: d.id, ...d.data() }));

                const qAssessments = query(collection(db, 'seSelfAssessments'), where('enrollmentId', '==', en.docId));
                const aSnap = await getDocs(qAssessments);
                jhSelfExplorationAssessmentsMap[en.docId] = aSnap.docs.map(d => ({ docId: d.id, ...d.data() }));
              } catch (err) {
                console.warn(`[StudentPortfolio] Failed to fetch Self Exploration details for enrollment ${en.docId}:`, err);
              }
            }
          } catch (e) {
            console.warn("[StudentPortfolio] Querying self exploration records failed:", e);
          }
        }

        if (active) {
          setRawAttendance(attDocs);
          setRawObservations(obsDocs);
          setRawDrafts(draftDocs);
          setRawReports(publishedReports);
          setElementaryProgress(litProgress);
          setElementaryMTSSCases(mtssCases);
          setMtssCoachingSessions(sessionsMap);

          // Junior High specific states
          setJhLateness(lateDocs);
          setJhAcademicCases(jhAcademicCasesList);
          setJhAcademicSessions(jhAcademicSessionsMap);
          setJhBehaviorCases(jhBehaviorCasesList);
          setJhBehaviorConcerns(jhBehaviorConcernsMap);
          setJhLiteracyProgress(jhLitProgressList);
          setJhSelfExplorationEnrollments(jhSelfExplorationEnrollmentsList);
          setJhSelfExplorationLogs(jhSelfExplorationLogsMap);
          setJhSelfExplorationAssessments(jhSelfExplorationAssessmentsMap);
        }
      } catch (err) {
        console.error("Error aggregating Firestore documents:", err);
      } finally {
        setIsDataCompiling(false);
      }
    };

    fetchStudentGrowthData();
    return () => {
      active = false;
    };
  }, [selectedStudentId, activeUnit]);

  // Handle Class selection modification (Filters the student registry)
  const handleClassSelection = (classId: string) => {
    setSelectedClassId(classId);
    const targetClass = classes.find(c => c.id === classId);
    const filtered = targetClass
      ? students.filter(s => isStudentInClass(s.classId, targetClass))
      : [];
    if (filtered.length > 0) {
      setSelectedStudentId(filtered[0].id);
    }
  };

  // Resolve Active Student Details
  const activeStudentProfile = students.find(s => s.id === selectedStudentId) || {
    id: selectedStudentId || 'K-UNK',
    name: currentUser?.displayName || 'Siswa Kindergarten',
    nickName: currentUser?.displayName?.split(' ')[0] || 'Ananda',
    ageGroup: 'TK_A',
    classId: selectedClassId || 'K1'
  };

  // -------------------------------------------------------------
  // DATA ANALYSIS & METRIC EVALUATION
  // -------------------------------------------------------------
  
  // Date boundary filters
  const now = new Date();
  const filterDateLimit = React.useMemo(() => {
    const limits = {
      all: new Date(now.getFullYear() - 1, 0, 1), // full year
      month: new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()), // 30 days
      semester: new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()) // 6 months
    };
    return limits[activeRange];
  }, [activeRange]);

  // A. Process Attendance & Emotions
  const processedAttendanceList = React.useMemo(() => {
    const list: Array<{ date: string; status: string; emotion: string; weekday: string }> = [];
    
    if (activeUnit === 'ELEMENTARY') {
      rawAttendance.forEach(docData => {
        const dStr = docData.date;
        if (!dStr) return;
        const dObj = new Date(dStr);
        if (dObj < filterDateLimit) return;

        let statusNormalized = 'HADIR';
        const stVal = String(docData.status || '').toUpperCase();
        if (stVal === 'SAKIT' || stVal === 'SICK') statusNormalized = 'SAKIT';
        else if (stVal === 'IZIN' || stVal === 'PERMISSION') statusNormalized = 'IZIN';
        else if (stVal === 'ALPA' || stVal === 'ALFA' || stVal === 'ABSENT' || stVal === 'NO_NEWS') statusNormalized = 'ALFA';
        else if (stVal === 'HADIR' || stVal === 'PRESENT') statusNormalized = 'HADIR';
        else statusNormalized = stVal;

        list.push({
          date: dStr,
          status: statusNormalized,
          emotion: 'HAPPY', // Not applicable for elementary
          weekday: dObj.toLocaleDateString('id-ID', { weekday: 'long' })
        });
      });
    } else {
      // Look through firestore records
      rawAttendance.forEach(docData => {
        const dStr = docData.date;
        if (!dStr) return;
        const dObj = new Date(dStr);
        if (dObj < filterDateLimit) return;

        const studentsList = docData.students || [];
        const found = studentsList.find((s: any) => s.studentId === selectedStudentId);
        if (found) {
          let statusNormalized = 'HADIR';
          const stVal = String(found.status || '').toLowerCase();
          if (stVal.includes('sakit') || stVal === 'sick') statusNormalized = 'SAKIT';
          else if (stVal.includes('izin') || stVal === 'permission') statusNormalized = 'IZIN';
          else if (stVal.includes('tanpa') || stVal === 'no_news') statusNormalized = 'ALFA';

          list.push({
            date: dStr,
            status: statusNormalized,
            emotion: String(found.emotion || 'HAPPY').toUpperCase(),
            weekday: dObj.toLocaleDateString('id-ID', { weekday: 'long' })
          });
        }
      });

      // Fallback or Merge localStorage records (extremely rich for developer sandbox review)
      const localSavedChecklist = localStorage.getItem('kg_checklist_records');
      if (localSavedChecklist) {
        try {
          const parsed = JSON.parse(localSavedChecklist);
          Object.entries(parsed).forEach(([dateStr, classRecords]: [string, any]) => {
            const dObj = new Date(dateStr);
            if (dObj < filterDateLimit) return;
            
            if (classRecords?.[selectedStudentId]) {
              // Deduplicate if already present
              if (list.some(item => item.date === dateStr)) return;

              const st = classRecords[selectedStudentId];
              let statusN = 'HADIR';
              if (st.attendance === 'SICK') statusN = 'SAKIT';
              else if (st.attendance === 'PERMISSION') statusN = 'IZIN';
              else if (st.attendance === 'NO_NEWS') statusN = 'ALFA';

              list.push({
                date: dateStr,
                status: statusN,
                emotion: String(st.emotion || 'HAPPY').toUpperCase(),
                weekday: dObj.toLocaleDateString('id-ID', { weekday: 'long' })
              });
            }
          });
        } catch (e) {
          console.warn("Local storage parse failed:", e);
        }
      }
    }

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [rawAttendance, selectedStudentId, filterDateLimit, activeUnit]);

  // Elementary specific calculated values
  const latestElementaryProgress = React.useMemo(() => {
    const latest: Record<string, any> = {};
    
    elementaryProgress.forEach(record => {
      const area = record.area;
      const periodOrder: Record<string, number> = {
        'JUL_OCT': 1,
        'NOV_FEB': 2,
        'MAR_JUN': 3
      };
      
      const existing = latest[area];
      if (!existing) {
        latest[area] = record;
      } else {
        const existingOrder = periodOrder[existing.period] || 0;
        const currentOrder = periodOrder[record.period] || 0;
        if (currentOrder > existingOrder) {
          latest[area] = record;
        }
      }
    });
    
    return latest;
  }, [elementaryProgress]);

  const elementaryTimeline = React.useMemo(() => {
    const timelineEvents: Array<{
      type: 'literacy' | 'coaching_session';
      date: string;
      dateObj: Date;
      title: string;
      description: string;
      badge: string;
      badgeColor: string;
      meta: any;
    }> = [];

    elementaryProgress.forEach(rec => {
      const dateObj = rec.updatedAt ? new Date(rec.updatedAt) : new Date();
      const dStr = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      timelineEvents.push({
        type: 'literacy',
        date: dStr,
        dateObj,
        title: `Assessment: ${getAreaLabel(rec.area)}`,
        description: rec.notes || `Progress assessment for period ${getPeriodLabel(rec.period)}.`,
        badge: getSupportStatusLabel(rec.supportStatus),
        badgeColor: rec.supportStatus === 'ON_TRACK' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                    rec.supportStatus === 'MONITOR' ? 'bg-yellow-50 text-yellow-700 border-yellow-100' :
                    rec.supportStatus === 'NEEDS_SUPPORT' ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-red-50 text-red-700 border-red-100',
        meta: rec
      });
    });

    Object.entries(mtssCoachingSessions).forEach(([caseId, sessions]) => {
      const parentCase = elementaryMTSSCases.find(c => c.docId === caseId);
      if (!parentCase) return;

      (sessions as any[]).forEach(sess => {
        const dateObj = new Date(sess.date || sess.createdAt || Date.now());
        const dStr = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        timelineEvents.push({
          type: 'coaching_session',
          date: dStr,
          dateObj,
          title: `MTSS Coaching Session: ${parentCase.subject}`,
          description: sess.notes || 'Coaching session logged.',
          badge: parentCase.tier,
          badgeColor: parentCase.tier === 'Tier 2' ? 'bg-yellow-50 text-yellow-700 border-yellow-100' :
                      parentCase.tier === 'Tier 3' ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-red-50 text-red-700 border-red-100',
          meta: { ...sess, parentCase }
        });
      });
    });

    return timelineEvents.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
  }, [elementaryProgress, mtssCoachingSessions, elementaryMTSSCases]);

  const juniorHighTimeline = React.useMemo(() => {
    const timelineEvents: Array<{
      type: 'lateness' | 'academic_session' | 'behavior_concern' | 'literacy_record' | 'se_log';
      date: string;
      dateObj: Date;
      title: string;
      description: string;
      badge: string;
      badgeColor: string;
      meta: any;
    }> = [];

    // Lateness
    jhLateness.forEach(rec => {
      const dateObj = rec.date ? new Date(rec.date) : new Date();
      const dStr = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      timelineEvents.push({
        type: 'lateness',
        date: dStr,
        dateObj,
        title: 'Tardiness Recorded',
        description: `Arrived late at ${rec.arrivalTime || 'unspecified time'}. Reason: ${rec.reason || 'No reason provided'}. parent note: ${rec.parentNote || 'None'}`,
        badge: 'Tardiness',
        badgeColor: 'bg-red-50 text-red-700 border-red-100',
        meta: rec
      });
    });

    // MTSS Academic sessions
    Object.entries(jhAcademicSessions).forEach(([caseId, sessions]) => {
      const parentCase = jhAcademicCases.find(c => c.docId === caseId);
      if (!parentCase) return;

      (sessions as any[]).forEach(sess => {
        const dateObj = new Date(sess.date || sess.createdAt || sess.updatedAt || Date.now());
        const dStr = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        timelineEvents.push({
          type: 'academic_session',
          date: dStr,
          dateObj,
          title: `MTSS Academic Support: ${parentCase.subject || 'Academic Case'}`,
          description: sess.notes || sess.coachingSummary || 'Coaching session logged.',
          badge: parentCase.currentTier || 'Tier Support',
          badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-100',
          meta: sess
        });
      });
    });

    // MTSS Behavior Concerns/Cases
    Object.entries(jhBehaviorConcerns).forEach(([caseId, concerns]) => {
      const parentCase = jhBehaviorCases.find(c => c.docId === caseId);
      if (!parentCase) return;

      (concerns as any[]).forEach(conc => {
        const dateObj = new Date(conc.createdAt || Date.now());
        const dStr = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        timelineEvents.push({
          type: 'behavior_concern',
          date: dStr,
          dateObj,
          title: `MTSS Behavior Concern Logged`,
          description: conc.concernText || 'Concern or behavior incident logged.',
          badge: parentCase.tier || 'Behavior',
          badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-100',
          meta: conc
        });
      });
    });

    // Literacy Numeracy records
    jhLiteracyProgress.forEach(rec => {
      const dateObj = new Date(rec.updatedAt || Date.now());
      const dStr = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      const mappedArea = rec.area === 'BAHASA_INDONESIA' ? 'Bahasa Indonesia' :
                         rec.area === 'ENGLISH_READING' ? 'English Reading' :
                         rec.area === 'MENGAJI' ? 'Mengaji' : 'Numeracy';
      timelineEvents.push({
        type: 'literacy_record',
        date: dStr,
        dateObj,
        title: `Literacy & Numeracy Assessment: ${mappedArea}`,
        description: rec.notes || `Progress record logged for period ${rec.period || 'JUL_OCT'}.`,
        badge: rec.supportStatus === 'ON_TRACK' ? 'Tier 1' : rec.supportStatus === 'MONITOR' ? 'Tier 2' : 'Tier 3',
        badgeColor: rec.supportStatus === 'ON_TRACK' ? 'bg-teal-50 text-teal-700 border-teal-100' :
                    rec.supportStatus === 'MONITOR' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-rose-50 text-rose-700 border-rose-100',
        meta: rec
      });
    });

    // Self-Exploration logs
    Object.entries(jhSelfExplorationLogs).forEach(([enrollmentId, logs]) => {
      const parentEn = jhSelfExplorationEnrollments.find(e => e.docId === enrollmentId);
      const strandName = parentEn?.strandName || 'Self-Exploration';

      (logs as any[]).forEach(log => {
        const dateObj = new Date(log.date || log.createdAt || Date.now());
        const dStr = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        timelineEvents.push({
          type: 'se_log',
          date: dStr,
          dateObj,
          title: `Self-Exploration Session: ${strandName}`,
          description: log.notes || `Attended session. Activities: ${log.activitiesDone || 'None logged.'}. Reflections: ${log.studentReflections || 'None.'}`,
          badge: 'Self-Exploration',
          badgeColor: 'bg-purple-50 text-purple-700 border-purple-100',
          meta: log
        });
      });
    });

    return timelineEvents.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
  }, [jhLateness, jhAcademicCases, jhAcademicSessions, jhBehaviorCases, jhBehaviorConcerns, jhLiteracyProgress, jhSelfExplorationEnrollments, jhSelfExplorationLogs]);

  // Attendance metrics calculations
  const attendanceStats = React.useMemo(() => {
    let present = 0;
    let sick = 0;
    let permit = 0;
    let absent = 0;

    const emotions: Record<string, number> = { HAPPY: 0, SAD: 0, ANGRY: 0, OK: 0 };

    processedAttendanceList.forEach(item => {
      if (item.status === 'HADIR') {
        present++;
        const emo = item.emotion;
        if (emotions[emo] !== undefined) emotions[emo]++;
        else emotions.OK++;
      } else if (item.status === 'SAKIT') sick++;
      else if (item.status === 'IZIN') permit++;
      else if (item.status === 'ALFA') absent++;
    });

    const totalDays = present + sick + permit + absent;
    const attRate = totalDays > 0 ? Math.round(((present + permit) / totalDays) * 100) : 100;

    // Find dominant emotion
    let dominantEmo = 'HAPPY';
    let maxCount = -1;
    Object.entries(emotions).forEach(([emo, count]) => {
      if (count > maxCount) {
        maxCount = count;
        dominantEmo = emo;
      }
    });

    return { present, sick, permit, absent, totalDays, attRate, emotions, dominantEmo };
  }, [processedAttendanceList]);

  // B. Process Observations
  const processedObservationsList = React.useMemo(() => {
    const items: Array<{
      id: string;
      date: string;
      activity: string;
      domain: string;
      objective: string;
      grade: string;
      notes: string;
      photoUrl: string | null;
      timestamp: number;
    }> = [];

    // Fetch from Remote Database
    rawObservations.forEach(docData => {
      const dStr = docData.date || '';
      if (dStr) {
        const dObj = new Date(dStr);
        if (dObj < filterDateLimit) return;
      }

      const obsRecords = docData.observations || {};
      const found = obsRecords[selectedStudentId];
      if (found && (found.notes || found.photo || found.grading)) {
        items.push({
          id: docData.docId,
          date: dStr || formatDateLabel(new Date(docData.timestamp || Date.now())),
          activity: ACTIVITY_LABEL_MAP[docData.activity] || docData.activity || 'Classroom Activity',
          domain: getEnglishDomainLabel(DOMAIN_LABEL_MAP[docData.domain] || docData.domain || 'General'),
          objective: docData.objective || found.objective || 'Thematic Learning',
          grade: found.grading || 'Observed',
          notes: found.notes || '',
          photoUrl: found.photo || docData.generalPhotoUrl || docData.generalPhoto || null,
          timestamp: docData.timestamp || Date.now()
        });
      }
    });

    // Load from Local Storage caches (fallback)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('kg_obs_hist_')) {
        try {
          const payloadParsed = JSON.parse(localStorage.getItem(key) || '{}');
          const dStr = payloadParsed.date || '';
          if (dStr) {
            const dObj = new Date(dStr);
            if (dObj < filterDateLimit) continue;
          }

          if (payloadParsed.observations?.[selectedStudentId]) {
            // Deduplicate
            if (items.some(item => item.id === key)) continue;

            const stObs = payloadParsed.observations[selectedStudentId];
            items.push({
              id: key,
              date: dStr || formatDateLabel(new Date(payloadParsed.timestamp || Date.now())),
              activity: ACTIVITY_LABEL_MAP[payloadParsed.selectedActivity] || payloadParsed.selectedActivity || 'Classroom Activity',
              domain: getEnglishDomainLabel(DOMAIN_LABEL_MAP[payloadParsed.selectedDomain] || payloadParsed.selectedDomain || 'General'),
              objective: payloadParsed.learningObjectives || 'Practical Exploration',
              grade: stObs.grading || 'Observed',
              notes: stObs.notes || '',
              photoUrl: stObs.photo || payloadParsed.generalPhotoUrl || payloadParsed.generalPhoto || null,
              timestamp: payloadParsed.timestamp || Date.now()
            });
          }
        } catch (e) {
          // ignore
        }
      }
    }

    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [rawObservations, selectedStudentId, filterDateLimit]);

  // C. Process Weekly Comments and Teacher Insights (draft + published reviews)
  const processedCommentsList = React.useMemo(() => {
    const list: Array<{
      id: string;
      startDate: string;
      endDate: string;
      mondayDateObj: Date;
      theme: string;
      weeklyComments: string;
      socialEmotional: string;
      isPublished: boolean;
    }> = [];

    // Parse drafted items
    rawDrafts.forEach(docData => {
      const st = docData.startDate;
      if (!st) return;
      const monObj = new Date(st);
      if (monObj < filterDateLimit) return;

      if (docData.studentId === selectedStudentId && (docData.teacherEditedWeeklyComments || docData.teacherEditedSocialEmotional || docData.weeklyComments || docData.socialEmotional)) {
        list.push({
          id: docData.docId,
          startDate: st,
          endDate: docData.endDate || '',
          mondayDateObj: monObj,
          theme: docData.theme || 'Thematic',
          weeklyComments: docData.teacherEditedWeeklyComments || docData.weeklyComments || docData.aiWeeklyCommentsDraft || '',
          socialEmotional: docData.teacherEditedSocialEmotional || docData.socialEmotional || docData.aiSocialEmotionalDraft || '',
          isPublished: false
        });
      }
    });

    // Parse published reviews
    rawReports.forEach(docData => {
      const st = docData.startDate;
      if (!st) return;
      const monObj = new Date(st);
      if (monObj < filterDateLimit) return;

      // Avoid duplication with draft if we have same startDate
      const duplicateIdx = list.findIndex(item => item.startDate === st);
      if (duplicateIdx >= 0) {
        list[duplicateIdx].isPublished = true;
        if (docData.weeklyComments) list[duplicateIdx].weeklyComments = docData.weeklyComments;
        if (docData.socialEmotional) list[duplicateIdx].socialEmotional = docData.socialEmotional;
        if (docData.theme) list[duplicateIdx].theme = docData.theme;
      } else {
        list.push({
          id: docData.docId,
          startDate: st,
          endDate: docData.endDate || '',
          mondayDateObj: monObj,
          theme: docData.theme || 'Ongoing Theme',
          weeklyComments: docData.teacherComments || docData.weeklyComments || '',
          socialEmotional: docData.socialEmotionalComments || docData.socialEmotional || '',
          isPublished: true
        });
      }
    });

    // Parse Local Storage summaries
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('kg_weekly_report_')) {
        try {
          const payload = JSON.parse(localStorage.getItem(key) || '{}');
          if (payload.studentId === selectedStudentId && (payload.teacherEditedWeeklyComments || payload.aiWeeklyCommentsDraft)) {
            const rangeParts = String(payload.dateRangeLabel || '').split(' - ');
            const monObj = new Date(payload.startDate || Date.now());
            if (monObj < filterDateLimit) continue;

            const stDateStr = payload.startDate || formatDateToKey(getMonday(new Date()));
            
            if (list.some(item => item.startDate === stDateStr)) continue;

            list.push({
              id: key,
              startDate: stDateStr,
              endDate: payload.endDate || '',
              mondayDateObj: monObj,
              theme: payload.theme || 'Weekly Development',
              weeklyComments: payload.teacherEditedWeeklyComments || payload.aiWeeklyCommentsDraft || 'Active interaction with peers.',
              socialEmotional: payload.teacherEditedSocialEmotional || payload.aiSocialEmotionalDraft || 'Communicates emotions well and demonstrates high empathy.',
              isPublished: false
            });
          }
        } catch (e) {
          // ignore
        }
      }
    }

    return list.sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [rawDrafts, rawReports, selectedStudentId, filterDateLimit]);

  // helper to change Date back to Key format YYYY-MM-DD
  function formatDateToKey(d: Date): string {
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  }

  // -------------------------------------------------------------
  // SEGREGATE INTO CHRONOLOGICAL WEEK TIMELINE
  // -------------------------------------------------------------
  const CompiledTimeLine = React.useMemo(() => {
    // Generate distinct week Mondays in the period
    const timelineWeeksMap: Record<string, {
      mondayDate: Date;
      monKey: string;
      weeklyTheme: string;
      attendancePresentCount: number;
      dominantEmotion: string;
      observations: typeof processedObservationsList;
      weeklyComments: string;
      selMilestones: string;
      isPublished: boolean;
    }> = {};

    // 1. Group Comments/Drafts
    processedCommentsList.forEach(cmt => {
      const monKey = cmt.startDate;
      if (!timelineWeeksMap[monKey]) {
        timelineWeeksMap[monKey] = {
          mondayDate: cmt.mondayDateObj,
          monKey,
          weeklyTheme: cmt.theme || 'Learning Evaluation',
          attendancePresentCount: 0,
          dominantEmotion: '',
          observations: [],
          weeklyComments: cmt.weeklyComments,
          selMilestones: cmt.socialEmotional,
          isPublished: cmt.isPublished
        };
      } else {
        timelineWeeksMap[monKey].weeklyComments = cmt.weeklyComments || timelineWeeksMap[monKey].weeklyComments;
        timelineWeeksMap[monKey].selMilestones = cmt.socialEmotional || timelineWeeksMap[monKey].selMilestones;
        timelineWeeksMap[monKey].isPublished = cmt.isPublished || timelineWeeksMap[monKey].isPublished;
        if (cmt.theme && cmt.theme !== 'Thematic') {
          timelineWeeksMap[monKey].weeklyTheme = cmt.theme;
        }
      }
    });

    // 2. Map attendance to weeks
    processedAttendanceList.forEach(att => {
      const attDate = new Date(att.date);
      const mon = getMonday(attDate);
      const monKey = formatDateToKey(mon);

      if (!timelineWeeksMap[monKey]) {
        timelineWeeksMap[monKey] = {
          mondayDate: mon,
          monKey,
          weeklyTheme: 'Scheduled Class Exploration',
          attendancePresentCount: 0,
          dominantEmotion: att.emotion,
          observations: [],
          weeklyComments: '',
          selMilestones: '',
          isPublished: false
        };
      }

      if (att.status === 'HADIR') {
        timelineWeeksMap[monKey].attendancePresentCount++;
        // Keep dominant mood
        if (!timelineWeeksMap[monKey].dominantEmotion) {
          timelineWeeksMap[monKey].dominantEmotion = att.emotion;
        }
      }
    });

    // 3. Map observations to weeks
    processedObservationsList.forEach(obs => {
      const obsDate = new Date(obs.date);
      const mon = getMonday(obsDate);
      const monKey = formatDateToKey(mon);

      if (!timelineWeeksMap[monKey]) {
        timelineWeeksMap[monKey] = {
          mondayDate: mon,
          monKey,
          weeklyTheme: 'Special Assessment & Observation',
          attendancePresentCount: 0,
          dominantEmotion: '',
          observations: [],
          weeklyComments: '',
          selMilestones: '',
          isPublished: false
        };
      }

      // Avoid duplicates
      if (!timelineWeeksMap[monKey].observations.some(item => item.notes === obs.notes && item.activity === obs.activity)) {
        timelineWeeksMap[monKey].observations.push(obs);
      }
    });

    return Object.values(timelineWeeksMap).sort((a, b) => b.monKey.localeCompare(a.monKey));
  }, [processedCommentsList, processedAttendanceList, processedObservationsList]);

  // Loading indicator for compile
  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 size={40} className="animate-spin text-blue-600" />
        <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest text-center">
          Loading User Profile...
        </p>
      </div>
    );
  }

  const isStaff = ['TEACHER', 'HEAD_UNIT', 'SUPER_ADMIN', 'ADMIN'].includes(userRole);
  const selectedStudentClassObj = classes.find(c => c.id === activeStudentProfile.classId) || classes.find(c => isStudentInClass(activeStudentProfile.classId, c));

  return (
    <div className="max-w-[1300px] mx-auto px-4 sm:px-6 pb-20 space-y-8 text-slate-800">
      
      {/* HEADER CONTROLS (Visibility restricted to Teachers/Admins: Selector framework) */}
      {isStaff && (
        <div className="bg-slate-50 border border-slate-100 p-5 rounded-3xl flex flex-col lg:flex-row gap-5 items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 text-blue-700 rounded-2xl">
              <ListFilter size={24} />
            </div>
            <div>
              <h4 className="font-extrabold text-sm text-slate-900 leading-none">
                {activeUnit === 'JUNIOR_HIGH' 
                  ? 'Select Junior High Student' 
                  : activeUnit === 'ELEMENTARY' 
                    ? 'Select Elementary Student' 
                    : 'Select Kindergarten Student'}
              </h4>
              <p className="text-xs text-slate-500 mt-1">Filter records by class and student name</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            {/* Class Dropdown */}
            <div className="relative flex-1 sm:flex-initial">
              <label className="absolute -top-2 left-3 px-1.5 bg-slate-50 text-[10px] font-bold text-slate-500 rounded">Class</label>
              <select
                className="w-full sm:w-48 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm pr-8 appearance-none"
                value={selectedClassId}
                onChange={(e) => handleClassSelection(e.target.value)}
              >
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.grade})</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-4 text-slate-400 pointer-events-none" />
            </div>

            {/* Student Dropdown */}
            <div className="relative flex-1 sm:flex-initial">
              <label className="absolute -top-2 left-3 px-1.5 bg-slate-50 text-[10px] font-bold text-slate-500 rounded">Student</label>
              <select
                className="w-full sm:w-64 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm pr-8 appearance-none"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
              >
                {students.filter(s => {
                  if (!selectedClassId) return true;
                  const activeClassObj = classes.find(c => c.id === selectedClassId);
                  return activeClassObj ? isStudentInClass(s.classId, activeClassObj) : false;
                }).map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.nickName || 'Child'})</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-4 text-slate-400 pointer-events-none" />
            </div>

            {/* Quick Refresh buttons */}
            <button
               onClick={() => {
                 setRawAttendance([...rawAttendance]); // triggers calculations reset
               }}
              className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 text-slate-600 shadow-sm"
            >
              <CheckSquare size={14} className="text-emerald-500" />
              Sync Dev Data
            </button>
          </div>
        </div>
      )}

      {/* A. STUDENT HEADER BANNER (Visually striking display card representing developmental overview) */}
      <div className="relative bg-white rounded-3xl sm:rounded-[2.5rem] border border-slate-100 p-6 sm:p-8 shadow-sm overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
        
        {/* Subtle decorative background watermarks */}
        <div className="absolute right-0 top-0 bottom-0 pointer-events-none opacity-5 flex items-center p-12">
          <Map size={240} className="text-blue-500" />
        </div>

        <div className="flex flex-col sm:flex-row gap-6 items-center relative z-10 w-full md:w-auto">
          {/* Creative Initial Initials Avatar Badge */}
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white text-3xl sm:text-4xl font-extrabold shadow-lg shadow-indigo-100 border-[6px] border-white ring-4 ring-slate-50">
            {activeStudentProfile.name ? activeStudentProfile.name[0] : 'S'}
          </div>

          <div className="text-center sm:text-left space-y-2">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
              <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-widest border border-blue-100">
                {activeUnit === 'JUNIOR_HIGH' ? 'Junior High Portfolio' : activeUnit === 'ELEMENTARY' ? 'Elementary Portfolio' : 'Kindergarten Portfolio'}
              </span>
              {(activeUnit === 'ELEMENTARY' || activeUnit === 'JUNIOR_HIGH') ? (
                <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest border border-indigo-100">
                  {`Grade ${selectedStudentClassObj?.grade || (activeUnit === 'JUNIOR_HIGH' ? 'SMP' : 'SD')}`}
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest border border-indigo-100">
                  {`Unit ${activeStudentProfile.ageGroup === 'TK_B' ? 'TK B (5-6 Years)' : 'TK A (4-5 Years)'}`}
                </span>
              )}
            </div>
            
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-none italic">
              {activeStudentProfile.name}
            </h1>

            <p className="text-slate-500 font-bold text-xs sm:text-sm flex flex-wrap items-center justify-center sm:justify-start gap-3">
              <span className="flex items-center gap-1.5"><GraduationCap size={16} className="text-slate-300" /> ID: {activeStudentProfile.id}</span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1.5"><BookOpen size={16} className="text-slate-300" /> Class: {selectedStudentClassObj?.name || 'Butterfly (B1)'}</span>
              <span className="text-slate-300">•</span>
              <span className="text-blue-600 font-black">{activeYear || '2025/2026'}</span>
            </p>
          </div>
        </div>

        {/* Dashboard filter & control panel (Academic selection / scope selector) */}
        <div className="flex flex-col items-center md:items-end gap-3.5 relative z-10 w-full md:w-auto border-t md:border-t-0 pt-4 md:pt-0 border-slate-100">
          <div className="bg-slate-50 p-1 rounded-xl border border-slate-100 flex items-center gap-1">
            <button
              onClick={() => setActiveRange('all')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all",
                activeRange === 'all' ? "bg-white text-slate-900 shadow-sm font-black" : "text-slate-500 hover:text-slate-800"
              )}
            >
              All Registers
            </button>
            <button
              onClick={() => setActiveRange('semester')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all",
                activeRange === 'semester' ? "bg-white text-slate-900 shadow-sm font-black" : "text-slate-500 hover:text-slate-800"
              )}
            >
              Last 6 Months
            </button>
            <button
              onClick={() => setActiveRange('month')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all",
                activeRange === 'month' ? "bg-white text-slate-900 shadow-sm font-black" : "text-slate-500 hover:text-slate-800"
              )}
            >
              This Month
            </button>
          </div>
          
          <div className="text-center md:text-right">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Student's Nickname</span>
            <p className="text-base font-extrabold text-slate-950 mt-0.5">"{activeStudentProfile.nickName || 'Child'}"</p>
          </div>
        </div>
      </div>

      {isDataCompiling && (
        <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center gap-3 text-blue-700 justify-center">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-xs font-bold uppercase tracking-wider">Syncing Student Portfolio...</span>
        </div>
      )}

      {/* B. SUMMARY METRICS CARDS (Gives direct visual highlights of student growth levels) */}
      {activeUnit === 'JUNIOR_HIGH' ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {/* Attendance Card */}
          <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-blue-200 transition-all group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Attendance Rate</span>
              <TrendingUp size={16} className="text-blue-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-4">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                {attendanceStats.attRate}%
              </h2>
              <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 font-bold leading-none font-mono">
                <span>{attendanceStats.present} Present</span>
                <span>•</span>
                <span className="text-amber-600">{attendanceStats.sick + attendanceStats.permit} Excused</span>
              </div>
            </div>
          </div>

          {/* Tardiness Card */}
          <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-red-200 transition-all group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tardiness</span>
              <Clock size={16} className="text-red-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-4">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                {jhLateness.length}x
              </h2>
              <div className="text-[10px] text-slate-500 mt-2 font-bold leading-none">
                {jhLateness.length > 0 ? `Latest: ${jhLateness[0].date}` : 'No tardiness records'}
              </div>
            </div>
          </div>

          {/* MTSS Academic Card */}
          <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-emerald-200 transition-all group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">MTSS Academic</span>
              <BookOpen size={16} className="text-emerald-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-4">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                {jhAcademicCases.filter(c => c.status === 'ACTIVE').length} Active
              </h2>
              <div className="text-[10px] text-slate-500 mt-2 font-bold leading-none">
                Total: {jhAcademicCases.length} cases
              </div>
            </div>
          </div>

          {/* MTSS Behavior Card */}
          <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-indigo-200 transition-all group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">MTSS Behavior</span>
              <Target size={16} className="text-indigo-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-4">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                {jhBehaviorCases.filter(c => c.status === 'OPEN' || c.status === 'ACTIVE').length} Active
              </h2>
              <div className="text-[10px] text-slate-500 mt-2 font-bold leading-none">
                Total: {jhBehaviorCases.length} cases
              </div>
            </div>
          </div>

          {/* Self-Exploration Card */}
          <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-purple-200 transition-all group col-span-2 md:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Self-Exploration</span>
              <Sparkles size={16} className="text-purple-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-4">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                {jhSelfExplorationEnrollments.length > 0 ? 'Enrolled' : 'Not Enrolled'}
              </h2>
              <div className="text-[10px] text-purple-600 mt-2 font-extrabold leading-none">
                {jhSelfExplorationEnrollments.length > 0 ? jhSelfExplorationEnrollments[0].strandName || 'Strand Selected' : 'No Active Strand'}
              </div>
            </div>
          </div>
        </div>
      ) : activeUnit === 'ELEMENTARY' ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {/* Attendance Card */}
          <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-blue-200 transition-all group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Attendance Rate</span>
              <TrendingUp size={16} className="text-blue-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-4">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                {attendanceStats.attRate}%
              </h2>
              <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 font-bold leading-none font-mono">
                <span>{attendanceStats.present} Present</span>
                <span>•</span>
                <span className="text-amber-600">{attendanceStats.sick + attendanceStats.permit} Excused</span>
              </div>
            </div>
          </div>

          {/* Bahasa Indonesia */}
          <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-emerald-200 transition-all group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bahasa Indonesia</span>
              <BookOpen size={16} className="text-emerald-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-4">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                {latestElementaryProgress['BAHASA_INDONESIA']?.wpm !== undefined 
                  ? `${latestElementaryProgress['BAHASA_INDONESIA'].wpm} WPM` 
                  : 'N/A'}
              </h2>
              <p className={cn(
                "text-[9px] mt-2 font-bold leading-none px-2 py-0.5 rounded-full w-fit border uppercase tracking-wider",
                latestElementaryProgress['BAHASA_INDONESIA']?.supportStatus === 'ON_TRACK' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                latestElementaryProgress['BAHASA_INDONESIA']?.supportStatus === 'MONITOR' ? "bg-yellow-50 text-yellow-700 border-yellow-100" :
                latestElementaryProgress['BAHASA_INDONESIA']?.supportStatus === 'NEEDS_SUPPORT' ? "bg-orange-50 text-orange-700 border-orange-100" :
                latestElementaryProgress['BAHASA_INDONESIA']?.supportStatus === 'INTERVENTION_RECOMMENDED' ? "bg-red-50 text-red-700 border-red-100" :
                "bg-slate-50 text-slate-500 border-slate-100"
              )}>
                {latestElementaryProgress['BAHASA_INDONESIA']?.supportStatus 
                  ? getSupportStatusLabel(latestElementaryProgress['BAHASA_INDONESIA'].supportStatus) 
                  : 'Not Assessed'}
              </p>
            </div>
          </div>

          {/* English Reading */}
          <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-pink-200 transition-all group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">English Reading</span>
              <GraduationCap size={16} className="text-pink-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-4">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                {latestElementaryProgress['ENGLISH_READING']?.wpm !== undefined 
                  ? `${latestElementaryProgress['ENGLISH_READING'].wpm} WPM` 
                  : 'N/A'}
              </h2>
              <p className={cn(
                "text-[9px] mt-2 font-bold leading-none px-2 py-0.5 rounded-full w-fit border uppercase tracking-wider",
                latestElementaryProgress['ENGLISH_READING']?.supportStatus === 'ON_TRACK' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                latestElementaryProgress['ENGLISH_READING']?.supportStatus === 'MONITOR' ? "bg-yellow-50 text-yellow-700 border-yellow-100" :
                latestElementaryProgress['ENGLISH_READING']?.supportStatus === 'NEEDS_SUPPORT' ? "bg-orange-50 text-orange-700 border-orange-100" :
                latestElementaryProgress['ENGLISH_READING']?.supportStatus === 'INTERVENTION_RECOMMENDED' ? "bg-red-50 text-red-700 border-red-100" :
                "bg-slate-50 text-slate-500 border-slate-100"
              )}>
                {latestElementaryProgress['ENGLISH_READING']?.supportStatus 
                  ? getSupportStatusLabel(latestElementaryProgress['ENGLISH_READING'].supportStatus) 
                  : 'Not Assessed'}
              </p>
            </div>
          </div>

          {/* Numeracy */}
          <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-amber-200 transition-all group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Numeracy</span>
              <Target size={16} className="text-amber-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-4">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                {latestElementaryProgress['NUMERACY']?.accuracy !== undefined 
                  ? `${latestElementaryProgress['NUMERACY'].accuracy}% Acc` 
                  : 'N/A'}
              </h2>
              <p className={cn(
                "text-[9px] mt-2 font-bold leading-none px-2 py-0.5 rounded-full w-fit border uppercase tracking-wider",
                latestElementaryProgress['NUMERACY']?.supportStatus === 'ON_TRACK' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                latestElementaryProgress['NUMERACY']?.supportStatus === 'MONITOR' ? "bg-yellow-50 text-yellow-700 border-yellow-100" :
                latestElementaryProgress['NUMERACY']?.supportStatus === 'NEEDS_SUPPORT' ? "bg-orange-50 text-orange-700 border-orange-100" :
                latestElementaryProgress['NUMERACY']?.supportStatus === 'INTERVENTION_RECOMMENDED' ? "bg-red-50 text-red-700 border-red-100" :
                "bg-slate-50 text-slate-500 border-slate-100"
              )}>
                {latestElementaryProgress['NUMERACY']?.supportStatus 
                  ? getSupportStatusLabel(latestElementaryProgress['NUMERACY'].supportStatus) 
                  : 'Not Assessed'}
              </p>
            </div>
          </div>

          {/* Mengaji */}
          <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-purple-200 transition-all group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mengaji</span>
              <Award size={16} className="text-purple-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-4">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                {latestElementaryProgress['MENGAJI']?.iqroCurrentLevel !== undefined 
                  ? `Jilid ${latestElementaryProgress['MENGAJI'].iqroCurrentLevel}` 
                  : 'N/A'}
              </h2>
              <p className={cn(
                "text-[9px] mt-2 font-bold leading-none px-2 py-0.5 rounded-full w-fit border uppercase tracking-wider",
                latestElementaryProgress['MENGAJI']?.supportStatus === 'ON_TRACK' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                latestElementaryProgress['MENGAJI']?.supportStatus === 'MONITOR' ? "bg-yellow-50 text-yellow-700 border-yellow-100" :
                latestElementaryProgress['MENGAJI']?.supportStatus === 'NEEDS_SUPPORT' ? "bg-orange-50 text-orange-700 border-orange-100" :
                latestElementaryProgress['MENGAJI']?.supportStatus === 'INTERVENTION_RECOMMENDED' ? "bg-red-50 text-red-700 border-red-100" :
                "bg-slate-50 text-slate-500 border-slate-100"
              )}>
                {latestElementaryProgress['MENGAJI']?.supportStatus 
                  ? getSupportStatusLabel(latestElementaryProgress['MENGAJI'].supportStatus) 
                  : 'Not Assessed'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          
          {/* Attendance Card */}
          <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-blue-200 transition-all group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Attendance Rate</span>
              <TrendingUp size={16} className="text-blue-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-4">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                {attendanceStats.attRate}%
              </h2>
              <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 font-bold leading-none font-mono">
                <span>{attendanceStats.present} Present</span>
                <span>•</span>
                <span className="text-amber-600">{attendanceStats.sick + attendanceStats.permit} Excused</span>
              </div>
            </div>
          </div>

          {/* Emotion Trend Card */}
          <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-pink-200 transition-all group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dominant Emotion</span>
              <Heart size={16} className="text-pink-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <span className="text-3xl sm:text-4xl">
                {attendanceStats.dominantEmo === 'HAPPY' ? '😊' :
                 attendanceStats.dominantEmo === 'OK' ? '😐' :
                 attendanceStats.dominantEmo === 'SAD' ? '😢' : '😡'}
              </span>
              <div>
                <h4 className="text-sm font-black text-slate-900 leading-none">
                  {attendanceStats.dominantEmo === 'HAPPY' ? 'Happy' :
                   attendanceStats.dominantEmo === 'OK' ? 'Neutral/Ok' :
                   attendanceStats.dominantEmo === 'SAD' ? 'Sad' : 'Restless'}
                </h4>
                <p className="text-[9px] text-slate-400 mt-1 font-bold uppercase tracking-wider">Daily Mood</p>
              </div>
            </div>
          </div>

          {/* Learning Observations Counts */}
          <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-emerald-200 transition-all group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Observations</span>
              <Camera size={16} className="text-emerald-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-4">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                {processedObservationsList.length}
              </h2>
              <p className="text-[10px] text-slate-500 mt-2 font-bold leading-none flex items-center gap-1">
                <Sparkles size={10} className="text-emerald-500" />
                Documented Milestones
              </p>
            </div>
          </div>

          {/* SEL Notes logged */}
          <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-amber-200 transition-all group">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Social Emotional</span>
              <Brain size={16} className="text-amber-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-4">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                {processedCommentsList.filter(c => c.socialEmotional).length}
              </h2>
              <p className="text-[10px] text-slate-500 mt-2 font-bold leading-none">Character Notes</p>
            </div>
          </div>

          {/* Weekly summaries */}
          <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between hover:border-purple-200 transition-all group col-span-2 md:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Weekly Comments</span>
              <MessageCircle size={16} className="text-purple-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-4">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                {processedCommentsList.filter(c => c.weeklyComments).length}
              </h2>
              <p className="text-[10px] text-indigo-600 mt-2 font-extrabold leading-none">Draft & Published</p>
            </div>
          </div>

        </div>
      )}

      {/* D. PROFILE TABS CONTROLS (Switches galleries for modular viewing) */}
      <div className="flex items-center overflow-x-auto pb-2 border-b border-slate-100 gap-1.5 scrollbar-hide">
        {activeUnit === 'JUNIOR_HIGH' ? (
          <>
            <button
              onClick={() => setActiveTab('overview')}
              className={cn(
                "px-5 py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'overview' ? "bg-slate-950 text-white shadow-md shadow-slate-200" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <LayoutDashboard size={14} />
              Overview & Timeline
            </button>

            <button
              onClick={() => setActiveTab('attendance_tardiness')}
              className={cn(
                "px-5 py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'attendance_tardiness' ? "bg-slate-950 text-white shadow-md shadow-slate-200" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <CheckSquare size={14} />
              Attendance & Tardiness ({processedAttendanceList.length} / {jhLateness.length})
            </button>

            <button
              onClick={() => setActiveTab('mtss_academic')}
              className={cn(
                "px-5 py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'mtss_academic' ? "bg-slate-950 text-white shadow-md shadow-slate-200" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <GraduationCap size={14} />
              MTSS Academic ({jhAcademicCases.length})
            </button>

            <button
              onClick={() => setActiveTab('mtss_behavior')}
              className={cn(
                "px-5 py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'mtss_behavior' ? "bg-slate-950 text-white shadow-md shadow-slate-200" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <Target size={14} />
              MTSS Behavior ({jhBehaviorCases.length})
            </button>

            <button
              onClick={() => setActiveTab('literacy_numeracy_jh')}
              className={cn(
                "px-5 py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'literacy_numeracy_jh' ? "bg-slate-950 text-white shadow-md shadow-slate-200" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <BookOpen size={14} />
              Literacy & Numeracy ({jhLiteracyProgress.length})
            </button>

            <button
              onClick={() => setActiveTab('self_exploration_jh')}
              className={cn(
                "px-5 py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'self_exploration_jh' ? "bg-slate-950 text-white shadow-md shadow-slate-200" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <Sparkles size={14} />
              Self-Exploration ({jhSelfExplorationEnrollments.length})
            </button>
          </>
        ) : activeUnit === 'ELEMENTARY' ? (
          <>
            <button
              onClick={() => setActiveTab('overview')}
              className={cn(
                "px-5 py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'overview' ? "bg-slate-950 text-white shadow-md shadow-slate-200" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <LayoutDashboard size={14} />
              Overview & Timeline
            </button>

            <button
              onClick={() => setActiveTab('attendance')}
              className={cn(
                "px-5 py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'attendance' ? "bg-slate-950 text-white shadow-md shadow-slate-200" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <CheckSquare size={14} />
              Daily Attendance ({processedAttendanceList.length})
            </button>

            <button
              onClick={() => setActiveTab('literacy_numeracy')}
              className={cn(
                "px-5 py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'literacy_numeracy' ? "bg-slate-950 text-white shadow-md shadow-slate-200" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <BookOpen size={14} />
              Literacy & Numeracy ({elementaryProgress.length})
            </button>

            <button
              onClick={() => setActiveTab('mtss')}
              className={cn(
                "px-5 py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'mtss' ? "bg-slate-950 text-white shadow-md shadow-slate-200" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <Target size={14} />
              MTSS Cases & Coaching ({elementaryMTSSCases.length})
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setActiveTab('overview')}
              className={cn(
                "px-5 py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'overview' ? "bg-slate-950 text-white shadow-md shadow-slate-200" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <LayoutDashboard size={14} />
              Overview & Timeline
            </button>

            <button
              onClick={() => setActiveTab('attendance')}
              className={cn(
                "px-5 py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'attendance' ? "bg-slate-950 text-white shadow-md shadow-slate-200" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <CheckSquare size={14} />
              Daily Attendance & Emotion ({processedAttendanceList.length})
            </button>

            <button
              onClick={() => setActiveTab('observations')}
              className={cn(
                "px-5 py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'observations' ? "bg-slate-950 text-white shadow-md shadow-slate-200" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <Camera size={14} />
              Learning Observations ({processedObservationsList.length})
            </button>

            <button
              onClick={() => setActiveTab('sel')}
              className={cn(
                "px-5 py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'sel' ? "bg-slate-950 text-white shadow-md shadow-slate-200" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <Brain size={14} />
              Social-Emotional Logs (SEL)
            </button>

            <button
              onClick={() => setActiveTab('comments')}
              className={cn(
                "px-5 py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'comments' ? "bg-slate-950 text-white shadow-md shadow-slate-200" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <MessageCircle size={14} />
              Weekly Narrative Reports
            </button>
          </>
        )}
      </div>

      {/* E. MODULAR GALLERY CONTAINER OR TABS SWITCH CONTENT */}
      <div>
        <AnimatePresence mode="wait">
          
          {/* TAB 1: OVERVIEW TIMELINE (The primary longitudinal growth journey) */}
          {activeTab === 'overview' && (
            activeUnit === 'JUNIOR_HIGH' ? (
              <motion.div
                key="junior-high-overview-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-10"
              >
                {/* Left sidebar: High-level qualitative assessments summary */}
                <div className="lg:col-span-1 space-y-6">
                  {/* Literacy & Numeracy status list */}
                  <section className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-7 shadow-sm space-y-6">
                    <div className="flex items-center gap-2 border-b border-slate-50 pb-4">
                      <GraduationCap size={18} className="text-emerald-500" />
                      <h3 className="font-extrabold text-xs uppercase tracking-widest text-slate-900 leading-none">
                        Subject Interventions
                      </h3>
                    </div>

                    <div className="space-y-4">
                      {['BAHASA_INDONESIA', 'ENGLISH_READING', 'NUMERACY', 'MENGAJI'].map((area) => {
                        const rec = jhLiteracyProgress.find(r => r.area === area);
                        return (
                          <div key={area} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100/50">
                            <div>
                              <p className="text-xs font-extrabold text-slate-900">
                                {area === 'BAHASA_INDONESIA' ? 'Bahasa Indonesia' :
                                 area === 'ENGLISH_READING' ? 'English Reading' :
                                 area === 'MENGAJI' ? 'Mengaji' : 'Numeracy'}
                              </p>
                              <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                                {rec ? `Status: ${rec.supportStatus}` : 'No data recorded'}
                              </p>
                            </div>
                            <div>
                              {rec ? (
                                <span className={cn(
                                  "px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg border",
                                  rec.supportStatus === 'ON_TRACK' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                  rec.supportStatus === 'MONITOR' ? "bg-amber-50 text-amber-700 border-amber-100" :
                                  "bg-rose-50 text-rose-700 border-rose-100"
                                )}>
                                  {rec.supportStatus === 'ON_TRACK' ? 'Tier 1' : rec.supportStatus === 'MONITOR' ? 'Tier 2' : 'Tier 3'}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-300 font-bold font-mono">None</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {/* Active MTSS Cases */}
                  <section className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-7 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-50 pb-4">
                      <Target size={18} className="text-blue-500" />
                      <h3 className="font-extrabold text-xs uppercase tracking-widest text-slate-900 leading-none">
                        Active MTSS Cases
                      </h3>
                    </div>

                    <div className="space-y-3">
                      {jhAcademicCases.filter(c => c.status === 'ACTIVE').length === 0 && jhBehaviorCases.filter(c => c.status === 'OPEN' || c.status === 'ACTIVE').length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-4 font-bold">No active intervention cases</p>
                      ) : (
                        <>
                          {jhAcademicCases.filter(c => c.status === 'ACTIVE').map(c => (
                            <div key={c.docId} className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-2xl flex items-center justify-between">
                              <div>
                                <span className="text-[9px] font-black bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded uppercase tracking-wider">Academic</span>
                                <p className="text-xs font-black text-slate-900 mt-1">{c.subject}</p>
                              </div>
                              <span className="text-[10px] font-black text-emerald-700">{c.currentTier}</span>
                            </div>
                          ))}
                          {jhBehaviorCases.filter(c => c.status === 'OPEN' || c.status === 'ACTIVE').map(c => (
                            <div key={c.docId} className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-2xl flex items-center justify-between">
                              <div>
                                <span className="text-[9px] font-black bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded uppercase tracking-wider">Behavior</span>
                                <p className="text-xs font-black text-slate-900 mt-1">{c.category}</p>
                              </div>
                              <span className="text-[10px] font-black text-indigo-700">{c.tier}</span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </section>
                </div>

                {/* Right Column: Interactive Longitudinal Progress Timeline */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-black text-slate-900 leading-tight">Student Activity Log</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Chronological record of student growth actions</p>
                    </div>
                    <span className="px-3 py-1 bg-slate-100 text-slate-600 font-bold text-[10px] rounded-full font-mono">
                      {juniorHighTimeline.length} Events
                    </span>
                  </div>

                  {juniorHighTimeline.length > 0 ? (
                    <div className="relative border-l border-slate-100 pl-6 ml-3 space-y-8">
                      {juniorHighTimeline.map((evt, idx) => (
                        <div key={idx} className="relative group">
                          {/* Indicator dot */}
                          <div className="absolute -left-[31px] top-1.5 w-4.5 h-4.5 rounded-full border-[3px] border-white bg-indigo-600 shadow-md ring-4 ring-slate-50 flex items-center justify-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-white" />
                          </div>

                          <div className="bg-white border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all rounded-3xl p-5 sm:p-6 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2.5">
                              <span className="text-[10px] font-bold text-slate-400 font-mono">{evt.date}</span>
                              <span className={cn("px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-widest border", evt.badgeColor)}>
                                {evt.badge}
                              </span>
                            </div>

                            <h4 className="text-sm font-black text-slate-900 tracking-tight italic">
                              {evt.title}
                            </h4>

                            <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                              {evt.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-16 border-2 border-dashed border-slate-100 rounded-[2.5rem] text-center bg-white">
                      <Map size={48} className="text-slate-200 mx-auto mb-4" />
                      <p className="text-sm font-black text-slate-400 uppercase tracking-widest leading-none">No History Recorded</p>
                      <p className="text-xs text-slate-300 mt-2 px-10 leading-relaxed">
                        No progress assessments or coaching sessions have been logged for this student yet.
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : activeUnit === 'ELEMENTARY' ? (
              <motion.div
                key="elementary-overview-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-10"
              >
                {/* Left sidebar: Academic Intervention and Tier summary */}
                <div className="lg:col-span-1 space-y-6">
                  {/* Literacy & Numeracy status list */}
                  <section className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-7 shadow-sm space-y-6">
                    <div className="flex items-center gap-2 border-b border-slate-50 pb-4">
                      <GraduationCap size={18} className="text-emerald-500" />
                      <h3 className="font-extrabold text-xs uppercase tracking-widest text-slate-900 leading-none">
                        Subject Interventions
                      </h3>
                    </div>

                    <div className="space-y-4">
                      {['BAHASA_INDONESIA', 'ENGLISH_READING', 'NUMERACY', 'MENGAJI'].map((area) => {
                        const rec = latestElementaryProgress[area];
                        return (
                          <div key={area} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100/50">
                            <div>
                              <p className="text-xs font-extrabold text-slate-900">{getAreaLabel(area as any)}</p>
                              <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                                {rec ? `Period: ${getPeriodLabel(rec.period)}` : 'No data recorded'}
                              </p>
                            </div>
                            {rec ? (
                              <span className={cn(
                                "px-2.5 py-1 rounded text-[9px] font-black tracking-wider uppercase border",
                                rec.supportStatus === 'ON_TRACK' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                rec.supportStatus === 'MONITOR' ? "bg-yellow-50 text-yellow-700 border-yellow-100" :
                                rec.supportStatus === 'NEEDS_SUPPORT' ? "bg-orange-50 text-orange-700 border-orange-100" :
                                rec.supportStatus === 'INTERVENTION_RECOMMENDED' ? "bg-red-50 text-red-700 border-red-100" :
                                "bg-slate-50 text-slate-500 border-slate-100"
                              )}>
                                {getSupportStatusLabel(rec.supportStatus)}
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded text-[9px] font-black bg-slate-100 text-slate-400 uppercase tracking-wider border border-slate-200">
                                Belum ada
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {/* MTSS Cases Card */}
                  <section className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-7 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-50 pb-4">
                      <Target size={18} className="text-blue-500" />
                      <h3 className="font-extrabold text-xs uppercase tracking-widest text-slate-900 leading-none">
                        MTSS Active Support
                      </h3>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="p-3 bg-amber-50/50 rounded-2xl border border-amber-100">
                        <p className="text-[10px] font-black text-amber-700 uppercase">Active Interventions</p>
                        <p className="text-xl font-black text-slate-800 mt-1">
                          {elementaryMTSSCases.filter(c => c.status === 'ACTIVE').length}
                        </p>
                      </div>
                      <div className="p-3 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                        <p className="text-[10px] font-black text-emerald-700 uppercase">Goals Achieved</p>
                        <p className="text-xl font-black text-slate-800 mt-1">
                          {elementaryMTSSCases.filter(c => c.status === 'ACHIEVED').length}
                        </p>
                      </div>
                    </div>

                    {elementaryMTSSCases.some(c => c.status === 'ACTIVE' && (c.tier === 'Tier 3' || c.tier === 'Special Education')) ? (
                      <div className="p-3 bg-rose-50 rounded-xl border border-rose-100 flex gap-2.5 items-start mt-2">
                        <ShieldAlert size={16} className="text-rose-500 shrink-0 mt-0.5" />
                        <p className="text-[10px] font-bold text-rose-700 leading-normal">
                          Attention: This student has intensive active support (Tier 3 or Special Needs) requiring collaborative mentor follow-up.
                        </p>
                      </div>
                    ) : (
                      <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 flex gap-2.5 items-start mt-2">
                        <Sparkles size={16} className="text-blue-500 shrink-0 mt-0.5" />
                        <p className="text-[10px] font-bold text-blue-700 leading-normal">
                          Student is progressing steadily. Remedial pathways are active and actively monitored by support mentors.
                        </p>
                      </div>
                    )}
                  </section>

                  {/* Elementary Milestone advice */}
                  <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl p-6 shadow-md relative overflow-hidden">
                    <div className="absolute right-0 bottom-0 p-6 opacity-10">
                      <Award size={90} />
                    </div>
                    <span className="px-2 py-0.5 rounded bg-white/20 text-indigo-200 text-[9px] font-extrabold uppercase tracking-widest leading-none">
                      Elementary Support Guidance
                    </span>
                    <p className="text-xs font-bold leading-relaxed mt-4 opacity-95 text-slate-100">
                      "Elementary academic development prioritizes mastery of basic arithmetic operations and fluid reading with comprehension. Interventions are personalized through custom 1-on-1 tutoring sessions."
                    </p>
                    <p className="text-[9px] text-indigo-300 font-bold tracking-wider uppercase mt-4 font-mono">Elementary MTSS & Literacy Board</p>
                  </div>
                </div>

                {/* Right area: Chronological development longitudinal timeline */}
                <div className="lg:col-span-2 space-y-8">
                  <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 w-fit">
                    <LayoutDashboard size={18} className="text-blue-600 animate-pulse" />
                    <h2 className="font-black text-xs uppercase tracking-[0.2em] text-slate-900 leading-none">
                      Development Journey (Assessments & Coaching)
                    </h2>
                  </div>

                  {elementaryTimeline.length > 0 ? (
                    <div className="relative border-l-2 border-slate-100 pl-6 sm:pl-8 space-y-10 ml-3">
                      {elementaryTimeline.map((item, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: 20 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: Math.min(0.2, idx * 0.05) }}
                          className="relative"
                        >
                          {/* Left bullet node */}
                          <div className={cn(
                            "absolute -left-[35px] sm:-left-[43px] top-1.5 w-6 h-6 rounded-full flex items-center justify-center border-2 bg-white shadow-sm text-[10px]",
                            item.type === 'literacy' ? "text-emerald-500 border-emerald-100" : "text-blue-500 border-blue-100"
                          )}>
                            {item.type === 'literacy' ? <BookOpen size={10} /> : <User size={10} />}
                          </div>

                          {/* Box */}
                          <div className="bg-white border border-slate-100 rounded-3xl p-5 sm:p-6 shadow-sm hover:border-slate-200 transition-all">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-50 mb-3">
                              <div>
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{item.date}</span>
                                <h4 className="text-xs sm:text-sm font-black text-slate-900 mt-0.5">{item.title}</h4>
                              </div>
                              <span className={cn(
                                "px-2.5 py-0.5 rounded-full text-[8px] font-black tracking-wider uppercase border w-fit",
                                item.badgeColor
                              )}>
                                {item.badge}
                              </span>
                            </div>

                            <p className="text-xs text-slate-600 leading-relaxed font-semibold italic">
                              "{item.description}"
                            </p>

                            {item.type === 'coaching_session' && (
                              <div className="mt-3 pt-3 border-t border-slate-50 flex flex-wrap gap-2 text-[10px] font-bold text-slate-400 font-mono">
                                <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-100">Tutor: {item.meta.tutorName}</span>
                                <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-100">Method: {item.meta.interventionMethod || 'Personal Tutoring'}</span>
                                {item.meta.durationMinutes && <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-100">Duration: {item.meta.durationMinutes} min</span>}
                              </div>
                            )}

                            {item.type === 'literacy' && (
                              <div className="mt-3 pt-3 border-t border-slate-50 flex flex-wrap gap-2 text-[10px] font-bold text-slate-400 font-mono">
                                {item.meta.wpm !== undefined && <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-100">WPM: {item.meta.wpm}</span>}
                                {item.meta.readingLevel && <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-100">Reading Level: {item.meta.readingLevel}</span>}
                                {item.meta.accuracy !== undefined && <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-100">Accuracy: {item.meta.accuracy}%</span>}
                                {item.meta.iqroCurrentLevel !== undefined && <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-100">Iqro Level: {item.meta.iqroCurrentLevel}</span>}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-16 border-2 border-dashed border-slate-100 rounded-[2.5rem] text-center bg-white">
                      <Map size={48} className="text-slate-200 mx-auto mb-4" />
                      <p className="text-sm font-black text-slate-400 uppercase tracking-widest leading-none">No History Recorded</p>
                      <p className="text-xs text-slate-300 mt-2 px-10 leading-relaxed">
                        No progress assessments or coaching sessions have been logged for this student yet.
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="overview-tab"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-10"
              >
              
              {/* Left sidebar: High-level qualitative observations summary */}
              <div className="lg:col-span-1 space-y-6">
                
                {/* Character Strength highlights (computed based on observations) */}
                <section className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-7 shadow-sm space-y-6">
                  <div className="flex items-center gap-2 border-b border-slate-50 pb-4">
                    <Flame size={18} className="text-orange-500" />
                    <h3 className="font-extrabold text-xs uppercase tracking-widest text-slate-900 leading-none">
                      Qualities & Strengths
                    </h3>
                  </div>
                  
                  {processedObservationsList.length > 0 ? (
                    <div className="space-y-4">
                      <p className="text-xs text-slate-500 font-bold leading-relaxed">
                        Based on observation patterns, {activeStudentProfile.nickName} demonstrates consistent development and strong engagement in:
                      </p>
                      
                      {/* Gather unique academic/development domains evaluated with high marks */}
                      {Array.from(new Set(processedObservationsList.map(item => item.domain))).slice(0, 3).map((dom, idx) => (
                        <div key={idx} className="flex items-start gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-extrabold text-slate-900 leading-tight">{dom}</p>
                            <p className="text-[10px] text-slate-400 mt-1 font-bold">Demonstrated consistently across various classroom learning contexts.</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 border border-dashed border-slate-100 rounded-2xl">
                      <AlertCircle size={24} className="text-slate-300 mx-auto mb-2" />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No Observations Logged</p>
                      <p className="text-[9px] text-slate-400 mt-1 px-4">Once observations have been recorded by the classroom teacher, key academic and creative strengths will be summarized here.</p>
                    </div>
                  )}
                </section>

                {/* Emotional Checklist Distribution Chart */}
                <section className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-7 shadow-sm space-y-6">
                  <div className="flex items-center gap-2 border-b border-slate-50 pb-4">
                    <SmilePlus size={18} className="text-blue-500" />
                    <h3 className="font-extrabold text-xs uppercase tracking-widest text-slate-900 leading-none">
                      Daily Emotion Distribution
                    </h3>
                  </div>
                  
                  {attendanceStats.totalDays > 0 ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div className="p-2.5 bg-emerald-50/50 rounded-xl border border-emerald-100">
                          <span className="text-lg">😊</span>
                          <p className="text-[9px] font-black text-emerald-700 uppercase mt-1">Happy</p>
                          <p className="text-xs font-black text-slate-800 mt-1">{attendanceStats.emotions.HAPPY || 0}x</p>
                        </div>
                        <div className="p-2.5 bg-blue-50/50 rounded-xl border border-blue-100">
                          <span className="text-lg">😐</span>
                          <p className="text-[9px] font-black text-blue-700 uppercase mt-1">OK</p>
                          <p className="text-xs font-black text-slate-800 mt-1">{attendanceStats.emotions.OK || 0}x</p>
                        </div>
                        <div className="p-2.5 bg-amber-50/50 rounded-xl border border-amber-100">
                          <span className="text-lg">😢</span>
                          <p className="text-[9px] font-black text-amber-700 uppercase mt-1">Sad</p>
                          <p className="text-xs font-black text-slate-800 mt-1">{attendanceStats.emotions.SAD || 0}x</p>
                        </div>
                        <div className="p-2.5 bg-rose-50/50 rounded-xl border border-rose-100">
                          <span className="text-lg">😡</span>
                          <p className="text-[9px] font-black text-rose-700 uppercase mt-1">Angry</p>
                          <p className="text-xs font-black text-slate-800 mt-1">{attendanceStats.emotions.ANGRY || 0}x</p>
                        </div>
                      </div>

                      {/* Emotion graphical split bar */}
                      <div className="h-2 w-full rounded-full bg-slate-100 flex overflow-hidden">
                        {Object.entries(attendanceStats.emotions).map(([emo, count]) => {
                          const percent = Math.round((Number(count) / (attendanceStats.present || 1)) * 100) || 0;
                          if (percent === 0) return null;
                          const color = emo === 'HAPPY' ? 'bg-emerald-500' :
                                        emo === 'OK' ? 'bg-blue-500' :
                                        emo === 'SAD' ? 'bg-amber-500' : 'bg-rose-500';
                          return (
                            <div key={emo} className={cn("h-full", color)} style={{ width: `${percent}%` }} title={`${emo}: ${percent}%`} />
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
                        This graph represents the daily mood breakdown logged by teachers during morning attendance.
                      </p>
                    </div>
                  ) : (
                    <div className="text-center py-6 border border-dashed border-slate-100 rounded-2xl">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">NO RECENT MOOD HISTORY AVAILABLE</p>
                    </div>
                  )}
                </section>

                {/* Transition advice */}
                <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl p-6 shadow-md relative overflow-hidden">
                  <div className="absolute right-0 bottom-0 p-6 opacity-10">
                    <Award size={90} />
                  </div>
                  <span className="px-2 py-0.5 rounded bg-white/20 text-indigo-200 text-[9px] font-extrabold uppercase tracking-widest leading-none">
                    Unit Transition Milestones
                  </span>
                  <p className="text-xs font-bold leading-relaxed mt-4 opacity-95 leading-relaxed text-slate-100">
                    "The child demonstrates excellent focus and has a natural talent for peer leadership. Continued development and positive peer coaching are recommended during their transition path next term."
                  </p>
                  <p className="text-[9px] text-indigo-300 font-bold tracking-wider uppercase mt-4 font-mono">Kindergarten Mentor Panel • 2026</p>
                </div>

              </div>

              {/* Right area: Chronological development longitudinal week-by-week timeline */}
              <div className="lg:col-span-2 space-y-8">
                
                <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 w-fit">
                  <LayoutDashboard size={18} className="text-blue-600 animate-pulse" />
                  <h2 className="font-black text-xs uppercase tracking-[0.2em] text-slate-900 leading-none">
                    Development Journey (Weekly Timeline)
                  </h2>
                </div>

                {CompiledTimeLine.length > 0 ? (
                  <div className="relative border-l-2 border-slate-100 pl-6 sm:pl-8 space-y-10 ml-3">
                    {CompiledTimeLine.map((week, idx) => {
                      const monLabel = week.mondayDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
                      const friDate = new Date(week.mondayDate);
                      friDate.setDate(week.mondayDate.getDate() + 4);
                      const friLabel = friDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

                      return (
                        <motion.div
                          key={week.monKey}
                          initial={{ opacity: 0, x: 20 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: Math.min(0.2, idx * 0.05) }}
                          className="relative"
                        >
                          {/* Timeline bullet nodes representing visual status checks */}
                          <div className={cn(
                            "absolute left-[-33px] sm:left-[-41px] top-0 w-6 h-6 rounded-full border-4 border-white shadow-md flex items-center justify-center",
                            week.isPublished ? "bg-indigo-600 ring-4 ring-indigo-50" : "bg-slate-400 ring-4 ring-slate-100"
                          )}>
                            <div className="w-1.5 h-1.5 bg-white rounded-full" />
                          </div>

                          {/* Outer timeline card */}
                          <div className="bg-white border border-slate-100 hover:border-slate-200 p-6 rounded-3xl shadow-sm hover:shadow-md transition-all space-y-5">
                            
                            {/* Card Header with Dates & Theme labels */}
                            <div className="flex flex-col sm:flex-row justify-between items-start gap-2 border-b border-slate-50 pb-4">
                              <div>
                                <span className="text-[10px] font-extrabold text-blue-600 uppercase tracking-widest font-mono">
                                  Learning Period
                                </span>
                                <h3 className="text-base font-black text-slate-950 mt-0.5">
                                  {monLabel} - {friLabel}
                                </h3>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1 sm:mt-0">
                                <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest leading-none">
                                  Theme: {week.weeklyTheme}
                                </span>
                                {week.isPublished ? (
                                  <span className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest leading-none border border-emerald-100 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                                    Published
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded bg-slate-50 text-slate-500 text-[10px] font-black uppercase tracking-widest leading-none border border-slate-100">
                                    Draft
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Weekly teacher comment (if exists) */}
                            {week.weeklyComments ? (
                              <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-100 relative">
                                <div className="absolute top-3 right-3 text-indigo-500 opacity-25">
                                  <MessageCircle size={20} />
                                </div>
                                <span className="text-[9px] font-extrabold text-indigo-600 uppercase tracking-widest block leading-none font-mono">
                                  Weekly Growth Narrative (Teacher's Summary)
                                </span>
                                <p className="text-xs font-semibold text-slate-700 leading-relaxed italic mt-1.5">
                                  "{week.weeklyComments}"
                                </p>
                              </div>
                            ) : null}

                            {/* Social Emotional traits comments (if exists) */}
                            {week.selMilestones ? (
                              <div className="space-y-1.5 border-l-4 border-amber-400 pl-4">
                                <span className="text-[9px] font-extrabold text-amber-700 uppercase tracking-widest block leading-none font-mono">
                                  Social-Emotional Development (SEL)
                                </span>
                                <p className="text-xs text-slate-600 leading-relaxed">
                                  {week.selMilestones}
                                </p>
                              </div>
                            ) : null}

                            {/* Bullet points observation logs occurred in this week */}
                            {week.observations.length > 0 ? (
                              <div className="space-y-3 pt-2">
                                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none font-mono">
                                  Observation Highlights & Lesson Artifacts
                                </span>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {week.observations.map(obs => {
                                    const stGrade = getGradeStyle(obs.grade);
                                    return (
                                      <div key={obs.id} className="p-3 bg-white border border-slate-100 rounded-xl space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-extrabold text-[9px] uppercase tracking-wider">
                                            {obs.domain}
                                          </span>
                                          <span className={cn("px-2 py-0.5 rounded font-black text-[9px] tracking-wider border", stGrade.bg)}>
                                            {obs.grade}
                                          </span>
                                        </div>
                                        <p className="text-xs font-extrabold text-slate-900 leading-tight leading-none">
                                          {obs.activity}
                                        </p>
                                        {obs.notes && (
                                          <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">
                                            {obs.notes}
                                          </p>
                                        )}
                                        {obs.photoUrl && (
                                          <div className="h-24 w-full rounded-lg overflow-hidden border border-slate-100 relative group">
                                            <img
                                              src={obs.photoUrl}
                                              alt={obs.activity}
                                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                              referrerPolicy="no-referrer"
                                            />
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}

                            {/* Bottom row summary badges */}
                            <div className="pt-4 border-t border-slate-50 flex flex-wrap items-center justify-between text-[11px] font-bold text-slate-500 gap-3">
                              <span className="flex items-center gap-1.5 font-mono">
                                <CheckSquare size={14} className="text-emerald-500" />
                                Present This Week: {week.attendancePresentCount} Days
                              </span>
                              
                              {week.dominantEmotion && (
                                <span className="flex items-center gap-1 font-mono">
                                  Average Mood: 
                                  <span className="ml-1 text-xs">
                                    {week.dominantEmotion === 'HAPPY' ? '😊 ' :
                                     week.dominantEmotion === 'SAD' ? '😢 ' :
                                     week.dominantEmotion === 'ANGRY' ? '😡 ' : '😐 '}
                                    {week.dominantEmotion}
                                  </span>
                                </span>
                              )}
                            </div>

                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-16 border-2 border-dashed border-slate-100 rounded-[2.5rem] text-center bg-white">
                    <Map size={48} className="text-slate-200 mx-auto mb-4" />
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest leading-none">Development Journey Empty</p>
                    <p className="text-xs text-slate-300 mt-2 px-10 leading-relaxed">
                      No milestones, observation notes, or attendance logs have been recorded for this student in the current period.
                    </p>
                  </div>
                )}

              </div>

            </motion.div>
            )
          )}

          {/* TAB 2: DAILY CHECKLIST & EMOTIONS (Lists comprehensive database logs) */}
          {activeTab === 'attendance' && (
            <motion.div
              key="attendance-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6"
            >
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none">Attendance & Emotional History</h3>
                  <p className="text-xs text-slate-400 mt-1 font-bold">Daily checklist logs recorded by classroom teachers</p>
                </div>
                <div className="text-[12px] font-bold text-slate-500 bg-slate-50 border border-slate-100 px-4 py-2 rounded-xl">
                  Total Days Tracked: <span className="text-blue-600 font-extrabold">{processedAttendanceList.length} Days</span>
                </div>
              </div>

              {processedAttendanceList.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">
                        <th className="py-3.5 px-4 rounded-l-xl">Date</th>
                        <th className="py-3.5 px-4">Day</th>
                        <th className="py-3.5 px-4">Attendance Status</th>
                        <th className="py-3.5 px-4 rounded-r-xl text-center">Daily Emotion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {processedAttendanceList.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 text-xs font-semibold text-slate-700 transition-colors">
                          <td className="py-4 px-4 font-extrabold text-slate-900">
                            {new Date(item.date).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </td>
                          <td className="py-4 px-4 text-slate-500">{item.weekday}</td>
                          <td className="py-4 px-4">
                            <span className={cn(
                              "px-2.5 py-1 rounded text-[10px] font-extrabold uppercase tracking-wider",
                              item.status === 'HADIR' ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                              item.status === 'SAKIT' ? "bg-amber-50 text-amber-700 border border-amber-100" :
                              item.status === 'IZIN' ? "bg-indigo-50 text-indigo-700 border border-indigo-100" :
                              "bg-rose-50 text-rose-700 border border-rose-100"
                            )}>
                              {item.status === 'HADIR' ? 'PRESENT' : 
                               item.status === 'SAKIT' ? 'SICK' : 
                               item.status === 'IZIN' ? 'EXCUSED' : 'ABSENT'}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <div className="inline-flex items-center gap-1.5 bg-slate-100/50 px-3 py-1 rounded-full border border-slate-100">
                              <span className="text-base">
                                {item.emotion === 'HAPPY' ? '😊' :
                                 item.emotion === 'OK' ? '😐' :
                                 item.emotion === 'SAD' ? '😢' : '😡'}
                              </span>
                              <span className="text-[10px] font-black uppercase text-slate-600 tracking-wider">
                                {item.emotion}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                  <CheckSquare size={36} className="text-slate-200 mx-auto mb-3" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No Attendance Records</p>
                  <p className="text-[11px] text-slate-400 mt-1">No daily attendance logs have been recorded for this period.</p>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 3: OBSERVATION GALLERY (Grids specific assessed lessons \& images) */}
          {activeTab === 'observations' && (
            <motion.div
              key="observations-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              <div className="bg-white border border-slate-100 p-6 sm:p-8 rounded-3xl shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none">Portfolio Artifacts & Observations</h3>
                  <p className="text-xs text-slate-400 mt-1 font-bold">Milestones and hands-on artifacts captured during guided learning/centers</p>
                </div>
                <div className="text-[12px] font-bold text-slate-500 bg-slate-50 border border-slate-100 px-4 py-2 rounded-xl">
                  Total Observations: <span className="text-emerald-600 font-extrabold">{processedObservationsList.length} Entries</span>
                </div>
              </div>

              {processedObservationsList.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {processedObservationsList.map((obs) => {
                    const gradeStyle = getGradeStyle(obs.grade);
                    return (
                      <motion.div
                        key={obs.id}
                        layout
                        className="bg-white border border-slate-100 hover:border-slate-200 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                      >
                        {/* Image Moment */}
                        {obs.photoUrl ? (
                          <div className="h-56 w-full relative bg-slate-100 overflow-hidden">
                            <img
                              src={obs.photoUrl}
                              alt={obs.activity}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute top-4 left-4">
                              <span className="px-2.5 py-1 rounded bg-black/60 text-white text-[10px] font-black uppercase tracking-widest leading-none backdrop-blur-xs">
                                {obs.domain}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="h-44 w-full bg-slate-50 flex flex-col items-center justify-center gap-2 border-b border-slate-100 p-4 text-center">
                             <ImageIcon size={32} className="text-slate-300" />
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">No Photo Uploaded</span>
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest">
                              {obs.domain}
                            </span>
                          </div>
                        )}

                        {/* Content text block */}
                        <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                          <div className="space-y-2">
                            <div className="flex justify-between items-start gap-3">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block font-mono">
                                Date: {obs.date}
                              </span>
                              
                              <span className={cn("px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border font-mono", gradeStyle.bg)}>
                                {obs.grade}
                              </span>
                            </div>
                            
                            <h4 className="text-base font-extrabold text-slate-950 tracking-tight leading-snug">
                              {obs.activity}
                            </h4>
                            
                            <p className="text-[11px] text-indigo-700 font-extrabold">
                              Target Skill: {obs.objective}
                            </p>
                          </div>

                          {obs.notes && (
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                              <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                                {obs.notes}
                              </p>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white border border-slate-100 p-16 rounded-[2.5rem] text-center shadow-sm">
                  <Camera size={44} className="text-slate-200 mx-auto mb-4" />
                  <p className="text-sm font-black text-slate-400 uppercase tracking-widest leading-none">No Observations Logged</p>
                  <p className="text-xs text-slate-300 mt-2 px-12 leading-relaxed">
                    No observation notes or photographic portfolio entries have been recorded for {activeStudentProfile.nickName} in this period.
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 4: SOCIAL-EMOTIONAL Trajectory logs (SEL Note Milestones) */}
          {activeTab === 'sel' && (
            <motion.div
              key="sel-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6"
            >
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none">Social-Emotional Logs & Interactions</h3>
                <p className="text-xs text-slate-400 mt-1 font-bold">Periodic logs of social behaviors, empathy, peer interactions, and student independence</p>
              </div>

              {processedCommentsList.filter(c => c.socialEmotional).length > 0 ? (
                <div className="space-y-6">
                  {processedCommentsList.filter(c => c.socialEmotional).map((cmt, idx) => (
                    <div key={idx} className="p-6 bg-slate-50 hover:bg-slate-100/50 rounded-2xl border border-slate-100 transition-colors space-y-3">
                      <div className="flex justify-between items-start gap-4">
                        <span className="px-3 py-1 rounded bg-amber-50 text-amber-850 text-[10px] font-black uppercase tracking-widest border border-amber-200/50 font-mono">
                          Social-Emotional Milestone
                        </span>
                        <span className="text-[10px] font-extrabold text-slate-400 bg-white border border-slate-200 px-3 py-1 rounded-md font-mono">
                          Period: {cmt.startDate}
                        </span>
                       </div>
                      <p className="text-sm font-bold text-slate-800 leading-relaxed italic">
                        "{cmt.socialEmotional}"
                      </p>
                      <div className="text-[10px] font-bold text-slate-400 text-right font-mono">
                        Classroom Teacher Evaluation • Lumina Kindergarten
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                  <Brain size={36} className="text-slate-200 mx-auto mb-3" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">No SEL Notes Found</p>
                  <p className="text-[11px] text-slate-400 mt-1.5">No structured social-emotional milestone evaluations have been recorded for this period.</p>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 5: TEACHER WEEKLY COMMENTS */}
          {activeTab === 'comments' && (
            <motion.div
              key="comments-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6"
            >
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none">Weekly Growth Comments & Teacher Reviews</h3>
                <p className="text-xs text-slate-400 mt-1 font-bold">Weekly narrative reviews, outstanding achievements, and reinforcement suggestions for parents</p>
              </div>

              {processedCommentsList.filter(c => c.weeklyComments).length > 0 ? (
                <div className="space-y-6">
                  {processedCommentsList.filter(c => c.weeklyComments).map((cmt, idx) => (
                    <div key={idx} className="p-6 bg-slate-50 hover:bg-slate-100/50 rounded-2xl border border-slate-100 transition-colors space-y-3 relative overflow-hidden">
                      <div className="absolute right-0 top-0 translate-x-2 -translate-y-2 text-indigo-50 opacity-[0.03] scale-150">
                        <MessageCircle size={150} />
                      </div>
                      
                      <div className="flex flex-wrap justify-between items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded bg-purple-50 text-purple-750 text-[10px] font-black uppercase tracking-widest border border-purple-200/50 font-mono">
                            Teacher Review
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[9px] font-black uppercase tracking-wider font-mono">
                            Theme: {cmt.theme}
                          </span>
                        </div>
                        <span className="text-[10px] font-black text-slate-400 bg-white border border-slate-200 px-3 py-1 rounded-md font-mono">
                          Week of: {cmt.startDate}
                        </span>
                      </div>
                      
                      <p className="text-xs sm:text-sm font-bold text-slate-800 leading-relaxed relative z-10 whitespace-pre-wrap">
                        {cmt.weeklyComments}
                      </p>
                      
                      <div className="border-t border-slate-200/60 pt-3 mt-3 flex justify-between items-center text-[10px] font-bold text-slate-400 font-mono">
                        <span>Primary Reviewer: Kindergarten Counseling Panel</span>
                        <span>Status: {cmt.isPublished ? '✔️ Published to Parents' : 'Internal Draft'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                  <MessageCircle size={36} className="text-slate-200 mx-auto mb-3" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">No Weekly Comments Found</p>
                  <p className="text-[11px] text-slate-400 mt-1.5">Teacher weekly comments or growth narratives have not been created for this period.</p>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 6: LITERACY & NUMERACY (ELEMENTARY ONLY) */}
          {activeTab === 'literacy_numeracy' && (
            <motion.div
              key="literacy-numeracy-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6"
            >
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none">Literacy & Numeracy Assessment Records</h3>
                <p className="text-xs text-slate-400 mt-1 font-bold">Comprehensive records of reading speeds, comprehension levels, and math diagnostics</p>
              </div>

              {elementaryProgress.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {elementaryProgress.map((record) => (
                    <div key={record.id} className="p-6 bg-slate-50 hover:bg-slate-100/50 rounded-2xl border border-slate-100 transition-colors space-y-4">
                      <div className="flex justify-between items-start gap-3 border-b border-slate-100 pb-3">
                        <div>
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-wider rounded border border-emerald-100">
                            {getAreaLabel(record.area)}
                          </span>
                          <h4 className="text-sm font-black text-slate-900 mt-1">Period: {getPeriodLabel(record.period)}</h4>
                        </div>
                        <span className={cn(
                          "px-2.5 py-1 rounded text-[9px] font-black tracking-wider uppercase border",
                          record.supportStatus === 'ON_TRACK' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                          record.supportStatus === 'MONITOR' ? "bg-yellow-50 text-yellow-700 border-yellow-100" :
                          record.supportStatus === 'NEEDS_SUPPORT' ? "bg-orange-50 text-orange-700 border-orange-100" :
                          record.supportStatus === 'INTERVENTION_RECOMMENDED' ? "bg-red-50 text-red-700 border-red-100" :
                          "bg-slate-50 text-slate-500 border-slate-100"
                        )}>
                          {getSupportStatusLabel(record.supportStatus)}
                        </span>
                      </div>

                      {/* Display custom stats fields based on the assessment area */}
                      <div className="grid grid-cols-3 gap-2 bg-white p-3 rounded-xl border border-slate-100 text-center font-mono">
                        {record.area === 'BAHASA_INDONESIA' || record.area === 'ENGLISH_READING' ? (
                          <>
                            <div>
                              <p className="text-[8px] text-slate-400 font-bold uppercase">WPM</p>
                              <p className="text-sm font-black text-slate-800 mt-0.5">{record.wpm !== undefined ? record.wpm : '-'}</p>
                            </div>
                            <div>
                              <p className="text-[8px] text-slate-400 font-bold uppercase">Accuracy</p>
                              <p className="text-sm font-black text-slate-800 mt-0.5">{record.accuracy !== undefined ? `${record.accuracy}%` : '-'}</p>
                            </div>
                            <div>
                              <p className="text-[8px] text-slate-400 font-bold uppercase">Reading Lvl</p>
                              <p className="text-sm font-black text-slate-800 mt-0.5 truncate max-w-full" title={record.readingLevel}>{record.readingLevel || '-'}</p>
                            </div>
                          </>
                        ) : record.area === 'NUMERACY' ? (
                          <>
                            <div>
                              <p className="text-[8px] text-slate-400 font-bold uppercase">Grid Score</p>
                              <p className="text-sm font-black text-slate-800 mt-0.5">{record.gridScore !== undefined ? record.gridScore : '-'}</p>
                            </div>
                            <div>
                              <p className="text-[8px] text-slate-400 font-bold uppercase">Facts Score</p>
                              <p className="text-sm font-black text-slate-800 mt-0.5">{record.factsScore !== undefined ? record.factsScore : '-'}</p>
                            </div>
                            <div>
                              <p className="text-[8px] text-slate-400 font-bold uppercase">Combined</p>
                              <p className="text-sm font-black text-slate-800 mt-0.5">
                                {record.gridScore !== undefined && record.factsScore !== undefined ? record.gridScore + record.factsScore : '-'}
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <p className="text-[8px] text-slate-400 font-bold uppercase">Iqro Level</p>
                              <p className="text-sm font-black text-slate-800 mt-0.5">{record.iqroCurrentLevel !== undefined ? record.iqroCurrentLevel : '-'}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-[8px] text-slate-400 font-bold uppercase">Last Updated</p>
                              <p className="text-xs font-black text-slate-800 mt-1 truncate">
                                {record.updatedAt ? new Date(record.updatedAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                              </p>
                            </div>
                          </>
                        )}
                      </div>

                      {record.notes && (
                        <div className="bg-white p-3.5 rounded-xl border border-slate-100">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Diagnostic Notes</p>
                          <p className="text-xs text-slate-600 leading-relaxed font-semibold mt-1">"{record.notes}"</p>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 pt-1 font-mono">
                        <span>Assessed on: {new Date(record.createdAt).toLocaleDateString()}</span>
                        <span>BY: {record.teacherId ? 'Classroom Mentor' : 'Academic Admin'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
                  <BookOpen size={36} className="text-slate-200 mx-auto mb-3" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">No Literacy or Numeracy Records Found</p>
                  <p className="text-[11px] text-slate-400 mt-1.5">No formal assessments have been logged for this student in Elementary yet.</p>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 7: MTSS CASES & INTERVENTIONS (ELEMENTARY ONLY) */}
          {activeTab === 'mtss' && (
            <motion.div
              key="mtss-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6"
            >
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none">MTSS Support Cases & Coaching Sessions</h3>
                <p className="text-xs text-slate-400 mt-1 font-bold">Multi-Tier System of Supports (MTSS) cases, behavioral/academic tier plans, and tutorial timeline</p>
              </div>

              {elementaryMTSSCases.length > 0 ? (
                <div className="space-y-6">
                  {elementaryMTSSCases.map((caseItem) => {
                    const sessionsForCase = mtssCoachingSessions[caseItem.docId] || [];
                    return (
                      <div key={caseItem.id} className="p-6 bg-slate-50 hover:bg-slate-100/50 rounded-2xl border border-slate-100 transition-all space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/60 pb-3">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "px-2.5 py-0.5 rounded text-[9px] font-black tracking-wider uppercase border",
                              caseItem.tier === 'Tier 1' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                              caseItem.tier === 'Tier 2' ? "bg-amber-50 text-amber-700 border-amber-100" :
                              caseItem.tier === 'Tier 3' ? "bg-red-50 text-red-700 border-red-100" :
                              "bg-purple-50 text-purple-700 border-purple-100"
                            )}>
                              {caseItem.tier}
                            </span>
                            <span className="px-2 py-0.5 bg-slate-200/80 text-slate-700 text-[9px] font-black uppercase tracking-wider rounded">
                              {getAreaLabel(caseItem.area)}
                            </span>
                          </div>
                          
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase border w-fit",
                            caseItem.status === 'ACTIVE' ? "bg-amber-100 text-amber-800 border-amber-200 animate-pulse" :
                            caseItem.status === 'ACHIEVED' ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                            caseItem.status === 'MONITOR_ONLY' ? "bg-blue-100 text-blue-800 border-blue-200" :
                            "bg-slate-250 text-slate-600 border-slate-200"
                          )}>
                            Case: {caseItem.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-white p-4 rounded-xl border border-slate-100 space-y-2">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Support Plan Goal</p>
                            <p className="text-xs text-slate-800 font-extrabold leading-relaxed">{caseItem.description}</p>
                          </div>

                          <div className="bg-white p-4 rounded-xl border border-slate-100 grid grid-cols-2 gap-2 text-center font-mono font-bold">
                            <div>
                              <p className="text-[8px] text-slate-400 font-bold uppercase">Opened Date</p>
                              <p className="text-xs font-black text-slate-800 mt-1">{caseItem.createdAt ? new Date(caseItem.createdAt).toLocaleDateString() : '-'}</p>
                            </div>
                            <div>
                              <p className="text-[8px] text-slate-400 font-bold uppercase">Target Resolution</p>
                              <p className="text-xs font-black text-slate-800 mt-1">{caseItem.targetResolutionDate || '-'}</p>
                            </div>
                          </div>
                        </div>

                        {/* Child Coaching Sessions nested list */}
                        <div className="space-y-2.5 pt-2">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Target size={12} className="text-blue-500" />
                            Coaching Sessions & Mentorship Logs ({sessionsForCase.length})
                          </p>

                          {sessionsForCase.length > 0 ? (
                            <div className="space-y-2.5 pl-3 border-l-2 border-slate-200">
                              {sessionsForCase.map((session) => (
                                <div key={session.id} className="p-4 bg-white hover:bg-slate-50/50 rounded-2xl border border-slate-100 text-xs space-y-2 transition-colors">
                                  <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 font-mono">
                                    <span>Date: {session.sessionDate}</span>
                                    <span>Tutor: {session.tutorName}</span>
                                  </div>
                                  <p className="font-semibold text-slate-700 leading-normal italic">
                                    "{session.notes}"
                                  </p>
                                  <div className="flex gap-2 text-[8px] font-black tracking-wider uppercase font-mono">
                                    {session.durationMinutes && <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200/60">Duration: {session.durationMinutes} min</span>}
                                    {session.interventionMethod && <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200/60">Method: {session.interventionMethod}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] text-slate-400 font-semibold italic pl-3">No interactive coaching sessions logged yet for this support case.</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
                  <Target size={36} className="text-slate-200 mx-auto mb-3" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">No Active MTSS Cases Found</p>
                  <p className="text-[11px] text-slate-400 mt-1.5">This student has not been assigned to any remedial tiers or MTSS support plans.</p>
                </div>
              )}
            </motion.div>
          )}

          {/* JUNIOR HIGH TABS */}
          {/* TAB: Attendance & Tardiness (Junior High) */}
          {activeTab === 'attendance_tardiness' && (
            <motion.div
              key="attendance-tardiness-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6"
            >
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none">Attendance & Tardiness History</h3>
                <p className="text-xs text-slate-400 mt-1 font-bold">Daily logs and lateness incident records for Junior High (SMP)</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Attendance */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h4 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                      <CheckSquare size={16} className="text-blue-500" />
                      Daily Attendance
                    </h4>
                    <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-[10px] font-black rounded-lg">
                      {processedAttendanceList.length} Days Tracked
                    </span>
                  </div>

                  {processedAttendanceList.length > 0 ? (
                    <div className="max-h-[400px] overflow-y-auto border border-slate-100 rounded-2xl">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50">
                            <th className="py-2 px-3">Date</th>
                            <th className="py-2 px-3">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {processedAttendanceList.map((att, idx) => (
                            <tr key={idx} className="border-b border-slate-50 text-xs hover:bg-slate-50/50">
                              <td className="py-2.5 px-3 font-semibold text-slate-700">{att.date}</td>
                              <td className="py-2.5 px-3">
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                  att.status === 'HADIR' ? "bg-emerald-50 text-emerald-700" :
                                  att.status === 'SAKIT' ? "bg-amber-50 text-amber-700" :
                                  att.status === 'IZIN' ? "bg-blue-50 text-blue-700" :
                                  "bg-rose-50 text-rose-700"
                                )}>
                                  {att.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic py-6 text-center">No attendance records logged.</p>
                  )}
                </div>

                {/* Tardiness */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h4 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                      <Clock size={16} className="text-red-500" />
                      Tardiness Logs
                    </h4>
                    <span className="px-2.5 py-1 bg-red-50 text-red-700 text-[10px] font-black rounded-lg">
                      {jhLateness.length} Incidents
                    </span>
                  </div>

                  {jhLateness.length > 0 ? (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                      {jhLateness.map((late, idx) => (
                        <div key={idx} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs space-y-2">
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 font-mono">
                            <span>{late.date}</span>
                            <span className="text-red-600 font-black">Late: {late.arrivalTime || 'Unspecified'}</span>
                          </div>
                          <p className="font-extrabold text-slate-800">Reason: {late.reason || 'No reason provided'}</p>
                          {late.parentNote && (
                            <p className="text-slate-500 bg-white p-2 rounded-lg border border-slate-100/50 leading-relaxed italic">
                              "Note from Parent: {late.parentNote}"
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
                      <Clock size={24} className="text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">No Lateness Records</p>
                      <p className="text-[10px] text-slate-400 mt-1">Excellent punctuality! Student is on time.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB: MTSS Academic (Junior High) */}
          {activeTab === 'mtss_academic' && (
            <motion.div
              key="mtss-academic-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6"
            >
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none">MTSS Academic Cases & Progress</h3>
                <p className="text-xs text-slate-400 mt-1 font-bold">Multi-Tier System of Supports Academic interventions and tutoring summaries</p>
              </div>

              {jhAcademicCases.length > 0 ? (
                <div className="space-y-6">
                  {jhAcademicCases.map((caseItem) => {
                    const sessions = jhAcademicSessions[caseItem.docId] || [];
                    return (
                      <div key={caseItem.docId} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                          <div>
                            <span className={cn(
                              "px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border mr-2",
                              caseItem.currentTier === 'Tier 2' ? "bg-amber-50 text-amber-700 border-amber-100" :
                              caseItem.currentTier === 'Tier 3' ? "bg-red-50 text-red-700 border-red-100" : "bg-blue-50 text-blue-700 border-blue-100"
                            )}>
                              {caseItem.currentTier}
                            </span>
                            <span className="text-sm font-black text-slate-900">{caseItem.subject}</span>
                          </div>
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                            caseItem.status === 'ACTIVE' ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-slate-200 text-slate-700 border-slate-300"
                          )}>
                            {caseItem.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-semibold text-slate-700">
                          <div className="bg-white p-4 rounded-xl border border-slate-100">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Academic Concern</p>
                            <p className="italic">"{caseItem.concern || 'No detailed concern specified.'}"</p>
                          </div>
                          <div className="bg-white p-4 rounded-xl border border-slate-100">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Intervention Goal</p>
                            <p className="font-extrabold">{caseItem.goals || 'None specified'}</p>
                          </div>
                          <div className="bg-white p-4 rounded-xl border border-slate-100">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Action Plan</p>
                            <p>{caseItem.actionPlan || 'No action plan logged.'}</p>
                          </div>
                        </div>

                        {/* Sessions */}
                        <div className="space-y-2.5 pt-2">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <GraduationCap size={12} className="text-emerald-500" />
                            Academic Coaching Sessions ({sessions.length})
                          </p>
                          {sessions.length > 0 ? (
                            <div className="space-y-2.5 pl-3 border-l-2 border-slate-200">
                              {sessions.map((sess, sIdx) => (
                                <div key={sIdx} className="p-4 bg-white rounded-xl border border-slate-100 text-xs space-y-1">
                                  <div className="flex justify-between text-[9px] font-bold text-slate-400 font-mono">
                                    <span>Date: {sess.date || sess.createdAt}</span>
                                    <span>Tutor: {sess.teacherId || 'Mentor'}</span>
                                  </div>
                                  <p className="font-semibold text-slate-800">{sess.notes || sess.coachingSummary}</p>
                                  {sess.coachingResult && (
                                    <p className="text-[10px] text-emerald-700 font-black">Result: {sess.coachingResult}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] text-slate-400 italic pl-3">No coaching sessions logged for this case yet.</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
                  <GraduationCap size={36} className="text-slate-200 mx-auto mb-3" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">No MTSS Academic Support Cases</p>
                  <p className="text-[11px] text-slate-400 mt-1.5">This student has no active academic intervention programs.</p>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB: MTSS Behavior (Junior High) */}
          {activeTab === 'mtss_behavior' && (
            <motion.div
              key="mtss-behavior-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6"
            >
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none">MTSS Behavior Logs & Concerns</h3>
                <p className="text-xs text-slate-400 mt-1 font-bold">Multi-Tier System of Supports Behavior tracking, reports, and resolution timeline</p>
              </div>

              {jhBehaviorCases.length > 0 ? (
                <div className="space-y-6">
                  {jhBehaviorCases.map((caseItem) => {
                    const concerns = jhBehaviorConcerns[caseItem.docId] || [];
                    return (
                      <div key={caseItem.docId} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                          <div>
                            <span className={cn(
                              "px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border mr-2",
                              caseItem.tier === 'Tier 2' ? "bg-amber-50 text-amber-700 border-amber-100" :
                              caseItem.tier === 'Tier 3' ? "bg-red-50 text-red-700 border-red-100" : "bg-blue-50 text-blue-700 border-blue-100"
                            )}>
                              {caseItem.tier}
                            </span>
                            <span className="text-sm font-black text-slate-900">Category: {caseItem.category}</span>
                          </div>
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                            caseItem.status === 'OPEN' || caseItem.status === 'ACTIVE' ? "bg-amber-100 text-amber-800 border-amber-200 animate-pulse" : "bg-slate-200 text-slate-700 border-slate-300"
                          )}>
                            Status: {caseItem.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold text-slate-700">
                          <div className="bg-white p-4 rounded-xl border border-slate-100">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Target Behavior / Goals</p>
                            <p className="font-extrabold">{caseItem.targetBehaviors || caseItem.goals || 'No goals specified'}</p>
                          </div>
                          <div className="bg-white p-4 rounded-xl border border-slate-100">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Intervention Strategy</p>
                            <p>{caseItem.interventionStrategy || caseItem.actionPlan || 'None specified'}</p>
                          </div>
                        </div>

                        {/* Concerns timeline */}
                        <div className="space-y-2.5 pt-2">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Target size={12} className="text-indigo-500" />
                            Logged Concern & Incident Logs ({concerns.length})
                          </p>
                          {concerns.length > 0 ? (
                            <div className="space-y-2.5 pl-3 border-l-2 border-slate-200">
                              {concerns.map((conc, cIdx) => (
                                <div key={cIdx} className="p-4 bg-white rounded-xl border border-slate-100 text-xs space-y-1">
                                  <div className="flex justify-between text-[9px] font-bold text-slate-400 font-mono">
                                    <span>Logged: {conc.createdAt ? new Date(conc.createdAt).toLocaleDateString() : 'Date unavailable'}</span>
                                    <span>By: {conc.reportedBy || 'Staff'}</span>
                                  </div>
                                  <p className="font-semibold text-slate-800">{conc.concernText || 'Concern logged.'}</p>
                                  {conc.actionTaken && (
                                    <p className="text-[10px] text-indigo-700 font-black">Action Taken: {conc.actionTaken}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] text-slate-400 italic pl-3">No incident reports or concerns logged for this behavior plan.</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
                  <Target size={36} className="text-slate-200 mx-auto mb-3" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">No Behavior Support Records</p>
                  <p className="text-[11px] text-slate-400 mt-1.5">This student has no active behavioral intervention logs.</p>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB: Literacy & Numeracy (Junior High) */}
          {activeTab === 'literacy_numeracy_jh' && (
            <motion.div
              key="literacy-numeracy-jh-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6"
            >
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none">Literacy & Numeracy Records</h3>
                <p className="text-xs text-slate-400 mt-1 font-bold">Standardized assessment details, reading speeds, accuracy metrics, and mentor evaluations</p>
              </div>

              {jhLiteracyProgress.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {jhLiteracyProgress.map((rec) => (
                    <div key={rec.docId} className="p-5 bg-slate-50 border border-slate-100 rounded-2xl space-y-4">
                      <div className="flex justify-between items-center border-b pb-2">
                        <h4 className="text-sm font-black text-slate-900">
                          {rec.area === 'BAHASA_INDONESIA' ? 'Bahasa Indonesia Reading' :
                           rec.area === 'ENGLISH_READING' ? 'English Reading' :
                           rec.area === 'MENGAJI' ? 'Mengaji Al-Qur\'an' : 'Numeracy Metrics'}
                        </h4>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border",
                          rec.supportStatus === 'ON_TRACK' ? "bg-teal-50 text-teal-700 border-teal-100" :
                          rec.supportStatus === 'MONITOR' ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-rose-50 text-rose-700 border-rose-100"
                        )}>
                          {rec.supportStatus === 'ON_TRACK' ? 'Tier 1' : rec.supportStatus === 'MONITOR' ? 'Tier 2' : 'Tier 3'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                        <div className="bg-white p-2 border border-slate-100 rounded-xl">
                          <span className="text-[8px] text-slate-400 font-bold uppercase leading-none block">WPM</span>
                          <span className="text-sm font-black text-slate-900 leading-none mt-1.5 block">{rec.wpm || '-'}</span>
                        </div>
                        <div className="bg-white p-2 border border-slate-100 rounded-xl">
                          <span className="text-[8px] text-slate-400 font-bold uppercase leading-none block">Accuracy</span>
                          <span className="text-sm font-black text-slate-900 leading-none mt-1.5 block">{rec.readingAccuracyPercent ? `${rec.readingAccuracyPercent}%` : '-'}</span>
                        </div>
                        <div className="bg-white p-2 border border-slate-100 rounded-xl">
                          <span className="text-[8px] text-slate-400 font-bold uppercase leading-none block">Comprehension</span>
                          <span className="text-sm font-black text-slate-900 leading-none mt-1.5 block">{rec.readingComprehensionPercent ? `${rec.readingComprehensionPercent}%` : '-'}</span>
                        </div>
                      </div>

                      {rec.notes && (
                        <div className="text-xs bg-white p-3 rounded-xl border border-slate-100">
                          <p className="text-[8px] text-slate-400 font-bold uppercase mb-1">Mentor Evaluation & Support Notes</p>
                          <p className="font-semibold text-slate-600 leading-relaxed italic">"{rec.notes}"</p>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 font-mono pt-1">
                        <span>Period: {rec.period}</span>
                        <span>Evaluator: {rec.teacherId || 'Evaluator'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
                  <BookOpen size={36} className="text-slate-200 mx-auto mb-3" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">No Assessment Logs Found</p>
                  <p className="text-[11px] text-slate-400 mt-1.5">No formal reading logs or reading level assessments have been recorded yet.</p>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB: Self-Exploration (Junior High) */}
          {activeTab === 'self_exploration_jh' && (
            <motion.div
              key="self-exploration-jh-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6"
            >
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none">Self-Exploration Profile</h3>
                <p className="text-xs text-slate-400 mt-1 font-bold">Elective strand enrollments, developmental session logs, and student reflections</p>
              </div>

              {jhSelfExplorationEnrollments.length > 0 ? (
                <div className="space-y-6">
                  {jhSelfExplorationEnrollments.map((en) => {
                    const logs = jhSelfExplorationLogs[en.docId] || [];
                    const assessments = jhSelfExplorationAssessments[en.docId] || [];
                    return (
                      <div key={en.docId} className="space-y-6">
                        {/* Strand Header Card */}
                        <div className="p-6 bg-gradient-to-tr from-purple-500/5 to-indigo-500/5 border border-purple-100 rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                          <div className="space-y-1">
                            <span className="px-2.5 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-black uppercase tracking-widest rounded-md">
                              Enrolled Strand
                            </span>
                            <h4 className="text-lg font-black text-indigo-950">{en.strandName}</h4>
                            <p className="text-xs font-bold text-slate-400">Period: {en.periodId} | Class: {en.classId}</p>
                          </div>
                          <div className="text-xs font-semibold text-slate-500">
                            Mentor: <span className="font-extrabold text-slate-800">{en.mentorName || 'Unassigned'}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                          {/* Left: Progress session logs */}
                          <div className="space-y-4">
                            <h5 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5 border-b pb-2">
                              <Sparkles size={14} className="text-purple-500" />
                              Developmental Session Logs ({logs.length})
                            </h5>

                            {logs.length > 0 ? (
                              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                                {logs.map((log, lIdx) => (
                                  <div key={lIdx} className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-2 text-xs">
                                    <div className="flex justify-between text-[10px] font-bold text-slate-400 font-mono">
                                      <span>Date: {log.date || 'Session Date'}</span>
                                      <span className="text-purple-600">Present</span>
                                    </div>
                                    <div>
                                      <p className="text-[9px] font-black text-slate-400 uppercase">Activities Conducted</p>
                                      <p className="font-extrabold text-slate-800 mt-0.5">{log.activitiesDone || 'None logged'}</p>
                                    </div>
                                    {log.studentReflections && (
                                      <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase">Student Reflections</p>
                                        <p className="italic text-slate-600 mt-0.5">"{log.studentReflections}"</p>
                                      </div>
                                    )}
                                    {log.notes && (
                                      <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase">Mentor Developmental Notes</p>
                                        <p className="font-semibold text-slate-700 mt-0.5">{log.notes}</p>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-400 italic py-6 text-center">No session logs recorded yet.</p>
                            )}
                          </div>

                          {/* Right: Self-assessments */}
                          <div className="space-y-4">
                            <h5 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5 border-b pb-2">
                              <Brain size={14} className="text-indigo-500" />
                              Student Self-Reflections & Assessments ({assessments.length})
                            </h5>

                            {assessments.length > 0 ? (
                              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                                {assessments.map((ass, aIdx) => (
                                  <div key={aIdx} className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3 text-xs">
                                    <div className="flex justify-between text-[10px] font-bold text-slate-400 font-mono border-b pb-1.5">
                                      <span>Assessment Date</span>
                                      <span className="font-extrabold text-slate-700">{ass.date || 'Assessment'}</span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-center text-xs font-mono font-bold">
                                      <div className="bg-white p-2 border border-slate-100 rounded-lg">
                                        <span className="text-[8px] text-slate-400 block uppercase">Interest Rate</span>
                                        <span className="text-sm font-black text-indigo-700 block mt-1">{ass.interestRate || '0'}/5</span>
                                      </div>
                                      <div className="bg-white p-2 border border-slate-100 rounded-lg">
                                        <span className="text-[8px] text-slate-400 block uppercase">Comprehension</span>
                                        <span className="text-sm font-black text-indigo-700 block mt-1">{ass.understandingRate || '0'}/5</span>
                                      </div>
                                    </div>

                                    <div>
                                      <p className="text-[9px] font-black text-slate-400 uppercase">What was enjoyable?</p>
                                      <p className="font-semibold text-slate-800 mt-0.5">{ass.enjoyablePart || 'None logged'}</p>
                                    </div>
                                    <div>
                                      <p className="text-[9px] font-black text-slate-400 uppercase">Encountered challenges</p>
                                      <p className="font-semibold text-slate-800 mt-0.5">{ass.challengingPart || 'None logged'}</p>
                                    </div>
                                    <div>
                                      <p className="text-[9px] font-black text-slate-400 uppercase">Strategies tried</p>
                                      <p className="font-semibold text-slate-800 mt-0.5">{ass.strategiesTried || 'None logged'}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-400 italic py-6 text-center">No self-assessments submitted yet.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
                  <Sparkles size={36} className="text-slate-200 mx-auto mb-3" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none">Not Enrolled in Self-Exploration</p>
                  <p className="text-[11px] text-slate-400 mt-1.5">No active strand enrollment records found for this period.</p>
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>

    </div>
  );
}
