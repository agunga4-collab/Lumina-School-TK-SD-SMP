import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, Upload, Save, X, Sparkles, ArrowLeft,
  ChevronRight, LayoutGrid, Heart, BookOpen, 
  Languages, Brain, Activity, Palette, Compass,
  Music, Film, Star, CheckCircle2, Loader2, Image as ImageIcon,
  UserCheck, RefreshCw, AlertTriangle, HelpCircle, Check, Info, Trash2, ClipboardList
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import type { KGActivity, KGDomain, KGGrading } from '../../types';
import { DEFAULT_STUDENTS, getStoredStudents, saveStoredStudents } from '../../lib/kindergartenWeeklyReport';
import ObservationBulkPeriodImport from './ObservationBulkPeriodImport';
import { collection, query, where, getDocs, writeBatch, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { normalizeStudentName } from '../../lib/namecentricResolver';
import { getKindergartenClasses, getKindergartenStudents, logFirestoreRead } from '../../lib/kindergartenMetadataCache';

const getStudentObs = (obsSource: Record<string, StudentObservation> | undefined, student: any): StudentObservation => {
  if (!obsSource) return { grading: null, notes: '', photo: null };
  if (obsSource[student.id]) return obsSource[student.id];
  if (student.oldLuminaId && obsSource[student.oldLuminaId]) return obsSource[student.oldLuminaId];
  if (student.nis && obsSource[student.nis]) return obsSource[student.nis];
  if (student.name) {
    const normStudentName = normalizeStudentName(student.name);
    const keyMatch = Object.keys(obsSource).find(k => {
      return normalizeStudentName(k) === normStudentName;
    });
    if (keyMatch) return obsSource[keyMatch];
  }
  return { grading: null, notes: '', photo: null };
};

interface StudentObservation {
  grading: KGGrading | null;
  notes: string;
  photo: string | null;
}

const activities: { id: KGActivity; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'MAKE_BELIEVE', label: 'Make-Believe', icon: <Compass />, color: 'teal' },
  { id: 'ISLAMIC_AWARENESS', label: 'Islamic Awareness', icon: <Heart />, color: 'emerald' },
  { id: 'LIBRARY_LITERACY', label: 'Library & Literacy', icon: <BookOpen />, color: 'blue' },
  { id: 'DISCOVERY', label: 'Discovery', icon: <Brain />, color: 'orange' },
  { id: 'BLOCKS_BUILDING', label: 'Blocks & Building', icon: <LayoutGrid />, color: 'indigo' },
  { id: 'ART_EXPLORATIONS', label: 'Art Explorations', icon: <Palette />, color: 'purple' },
  { id: 'ENGLISH', label: 'English', icon: <Languages />, color: 'sky' },
  { id: 'MUSIC', label: 'Music', icon: <Music />, color: 'rose' },
  { id: 'OUTSIDE', label: 'Outside', icon: <Activity />, color: 'lime' },
  { id: 'AUDIO_VISUAL', label: 'Audio Visual', icon: <Film />, color: 'violet' },
];

const domains: { id: KGDomain; label: string; desc: string }[] = [
  { id: 'AGAMA_BUDI_PEKERTI', label: 'Nilai Agama & Budi Pekerti', desc: 'Mengenal tuhan, ibadah harian, budi pekerti mulia' },
  { id: 'SOSIAL_EMOSIONAL', label: 'Sosial-Emosional', desc: 'Regulasi emosi, kemandirian, interaksi sosial, gotong royong' },
  { id: 'BAHASA', label: 'Bahasa', desc: 'Komunikasi ekspresif, reseptif, keaksaraan awal' },
  { id: 'KOGNITIF', label: 'Kognitif', desc: 'Problem solving, berpikir logis, pemecahan masalah sederhana' },
  { id: 'FISIK_MOTORIK', label: 'Fisik-Motorik', desc: 'Motorik kasar, motorik halus, kesehatan fisik' },
  { id: 'SENI', label: 'Seni', desc: 'Apresiasi karya, kreasi seni musik, rupa, peran' },
];

const grades: { id: KGGrading; label: string; color: string; desc: string }[] = [
  { id: 'BB', label: 'Belum Berkembang', color: 'bg-rose-100 text-rose-700 border-rose-200', desc: 'Anak perlu bimbingan penuh' },
  { id: 'MB', label: 'Mulai Berkembang', color: 'bg-yellow-105 text-yellow-800 border-yellow-250', desc: 'Anak mulai mencoba secara mandiri' },
  { id: 'BSH', label: 'Berkembang Sesuai Harapan', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', desc: 'Anak konsisten melakukan secara mandiri' },
  { id: 'BSB', label: 'Berkembang Sangat Baik', color: 'bg-teal-100 text-teal-800 border-teal-200', desc: 'Anak mandiri dan mampu membantu teman' },
  { id: 'ABSENT', label: 'Tidak Masuk', color: 'bg-gray-100 text-gray-500 border-gray-200', desc: 'Siswa tidak datang ke sekolah' },
  { id: 'NOT_PARTICIPATING', label: 'Tidak Mengikuti', color: 'bg-gray-100 text-gray-500 border-gray-200', desc: 'Ada di sekolah tapi tidak mengikuti sesi' },
];

const months = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' }
];

export default function Observation() {
  const { activeYear } = useAcademicYear();
  const [students, setStudents] = React.useState<any[]>(() => getStoredStudents());
  const [classes, setClasses] = React.useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [isLoadingClasses, setIsLoadingClasses] = React.useState<boolean>(false);

  // View States
  const [activeTab, setActiveTab] = React.useState<'input' | 'recap'>('input');
  
  // Monthly Recap Filter States
  const [recapMonth, setRecapMonth] = React.useState<number>(() => new Date().getMonth() + 1);
  const [recapYear, setRecapYear] = React.useState<number>(() => new Date().getFullYear());
  const [recapData, setRecapData] = React.useState<any[]>([]);
  const [isBgFetching, setIsBgFetching] = React.useState<boolean>(false);
  const [recapSubView, setRecapSubView] = React.useState<'matrix' | 'sessions' | 'monthly_table'>('matrix');

  // Popup/Modal detail states
  const [selectedDetailCell, setSelectedDetailCell] = React.useState<{ student: any; domain: any; entries: any[] } | null>(null);
  const [selectedDetailSession, setSelectedDetailSession] = React.useState<any | null>(null);

  const [selectedActivity, setSelectedActivity] = React.useState<KGActivity>('ART_EXPLORATIONS');
  const [selectedDomain, setSelectedDomain] = React.useState<KGDomain>('SOSIAL_EMOSIONAL');
  const [isImportOpen, setIsImportOpen] = React.useState<boolean>(false);
  
  // High fidelity general photo (Starts pre-filled with a beautiful school activity image)
  const [generalPhoto, setGeneralPhoto] = React.useState<string | null>(null);
  
  // Observations for students, keyed by studentId
  const [observations, setObservations] = React.useState<Record<string, StudentObservation>>(() => {
    // Try to load from localStorage first for stateful interactions
    const saved = localStorage.getItem('kg_observation_data');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    // Default initial data
    return getStoredStudents().reduce((acc, student) => {
      acc[student.id] = { grading: null, notes: '', photo: null };
      return acc;
    }, {} as Record<string, StudentObservation>);
  });

  const [isSaving, setIsSaving] = React.useState(false);
  const [isUploadingGeneral, setIsUploadingGeneral] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<Record<string, boolean>>({});

  const isStudentInClass = (studClassId: string, activeClassObj: { id: string; name: string }) => {
    const sClass = (studClassId || '').trim().toLowerCase();
    const actId = (activeClassObj.id || '').trim().toLowerCase();
    const actName = (activeClassObj.name || '').trim().toLowerCase();
    
    if (!sClass) return false;
    if (sClass === actId || sClass === actName) return true;
    
    const norm = (str: string) => str.replace(/[\s\-_]+/g, '').toLowerCase();
    const normS = norm(sClass);
    const normId = norm(actId);
    const normName = norm(actName);
    
    if (normS === normName || normS === normId) return true;
    
    // Check for specific sub-classes
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

    // Prevent generic "tka" from loosely matching specific sub-classes
    const specificClassWords = [
      'koala', 'panda', 'caterpillar', 'butterfly',
      'cenderawasih', 'elang', 'kakatua', 'badak', 'komodo', 'tapir'
    ];
    const hasSpecS = specificClassWords.some(w => normS.includes(w));
    const hasSpecAct = specificClassWords.some(w => normId.includes(w) || normName.includes(w));
    
    if (hasSpecAct && !hasSpecS) {
      return false; // student is general, but active class is specific
    }
    
    if (normId.includes(normS) || normS.includes(normId)) return true;
    
    return false;
  };

  // Load students and classes from Unified Cache-equipped Firestore handlers
  React.useEffect(() => {
    async function loadKindergartenData() {
      try {
        setIsLoadingClasses(true);
        console.log('[Observation Page] Requesting cached Kindergarten data for year:', activeYear);
        
        // 1. Fetch Kindergarten classes from Cache
        const fetchedClasses = await getKindergartenClasses(activeYear || '2025/2026');
        setClasses(fetchedClasses);
        
        if (fetchedClasses.length > 0) {
          setSelectedClassId(fetchedClasses[0].id);
        }

        // 2. Fetch Kindergarten Students from Cache
        const fetchedStudents = await getKindergartenStudents(activeYear || '2025/2026');
        
        if (fetchedStudents.length > 0) {
          setStudents(fetchedStudents);
          saveStoredStudents(fetchedStudents);
        } else {
          const local = getStoredStudents();
          if (local && local.length > 0) {
            setStudents(local);
          }
        }
      } catch (err) {
        console.error('Error loading Kindergarten students from Firestore:', err);
      } finally {
        setIsLoadingClasses(false);
      }
    }

    loadKindergartenData();
  }, [activeYear]);

  // Unified monthly observation aggregator for Rekap Bulanan — optimized to load on-demand by month and year
  const loadRecapData = async () => {
    try {
      setIsBgFetching(true);
      console.log(`[Recap] Loading observation documents for month: ${recapMonth}, year: ${recapYear}...`);
      
      const monthStr = String(recapMonth).padStart(2, '0');
      const startOfRange = `${recapYear}-${monthStr}-01`;
      const endOfRange = `${recapYear}-${monthStr}-31`;

      // 1. Fetch from Firestore using date range filter
      const qObs = query(
        collection(db, 'observations'),
        where('date', '>=', startOfRange),
        where('date', '<=', endOfRange)
      );
      
      const qSnap = await getDocs(qObs).catch(e => {
        console.warn("[Recap] Error querying firestore:", e);
        return { docs: [] };
      });
      
      // Audit log reads
      logFirestoreRead('observations', qSnap.docs.length || 1);
      
      const firestoreItems = qSnap.docs.map(docSnap => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          activity: d.activity,
          domain: d.domain,
          date: d.date, // 'YYYY-MM-DD'
          generalPhoto: d.generalPhotoUrl,
          observations: d.observations || {},
          timestamp: d.timestamp || Date.now()
        };
      });

      // 2. Fetch from LocalStorage
      const localItems: any[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('kg_obs_hist_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            if (data && data.observations) {
              const idxLastUnderscore = key.lastIndexOf('_');
              let dateStr = data.date;
              if (!dateStr && idxLastUnderscore !== -1) {
                const possibleDate = key.substring(idxLastUnderscore + 1);
                if (/^\d{4}-\d{2}-\d{2}$/.test(possibleDate)) {
                  dateStr = possibleDate;
                }
              }
              if (!dateStr && data.timestamp) {
                dateStr = new Date(data.timestamp).toISOString().split('T')[0];
              }

              localItems.push({
                id: key,
                activity: data.selectedActivity || data.activity,
                domain: data.selectedDomain || data.domain,
                date: dateStr,
                generalPhoto: data.generalPhoto,
                observations: data.observations,
                timestamp: data.timestamp || Date.now()
              });
            }
          } catch (e) {
            console.error("[Recap] LocalStorage parsing error:", e);
          }
        }
      }

      // Merge Firestore and LocalStorage by key: activity_domain_date
      const mergedMap = new Map<string, any>();
      
      // Add firestore items first
      firestoreItems.forEach(item => {
        if (item.activity && item.domain && item.date) {
          const comboKey = `${item.activity}_${item.domain}_${item.date}`;
          mergedMap.set(comboKey, item);
        }
      });

      // Add local items (overwriting with latest timestamp if applicable)
      localItems.forEach(item => {
        if (item.activity && item.domain && item.date) {
          const comboKey = `${item.activity}_${item.domain}_${item.date}`;
          const existing = mergedMap.get(comboKey);
          if (!existing || (item.timestamp && item.timestamp > (existing.timestamp || 0))) {
            mergedMap.set(comboKey, item);
          }
        } else if (item.activity && item.domain && !item.date) {
          const fallbackDate = new Date(item.timestamp).toISOString().split('T')[0];
          const comboKey = `${item.activity}_${item.domain}_${fallbackDate}`;
          if (!mergedMap.has(comboKey)) {
            mergedMap.set(comboKey, { ...item, date: fallbackDate });
          }
        }
      });

      const mergedList = Array.from(mergedMap.values());
      console.log(`[Recap] Merged ${mergedList.length} total sessions successfully.`);
      setRecapData(mergedList);
    } catch (err) {
      console.error("[Recap] Error loading observation recap data:", err);
    } finally {
      setIsBgFetching(false);
    }
  };

  // State & function to delete entire class observation records
  const [isDeletingClassObs, setIsDeletingClassObs] = React.useState<boolean>(false);

  const handleDeleteClassObservations = async () => {
    const activeClassObj = classes.find(c => c.id === selectedClassId);
    if (!activeClassObj) {
      toast.error("Silakan pilih kelas terlebih dahulu.");
      return;
    }

    const confirmMsg = `PERINGATAN: Apakah Anda yakin ingin menghapus seluruh data observasi untuk kelas "${activeClassObj.name}"? Tindakan ini bersifat permanen dan tidak dapat dibatalkan.`;
    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      setIsDeletingClassObs(true);
      toast.info(`Memulai proses penghapusan data observasi untuk kelas "${activeClassObj.name}"...`);

      // 1. Get students in this class
      const classStudentsList = students.filter(student => isStudentInClass(student.classId, activeClassObj));
      const studentIds = classStudentsList.map(s => s.id);

      if (studentIds.length === 0) {
        toast.error("Tidak ada siswa terdaftar di kelas ini untuk dihapus datanya.");
        return;
      }

      // 2. Fetch all observations from Firestore
      const qSnap = await getDocs(collection(db, 'observations'));
      let batch = writeBatch(db);
      let operationsInBatch = 0;
      let deletedDocsCount = 0;
      let updatedDocsCount = 0;

      for (const docSnap of qSnap.docs) {
        const d = docSnap.data();
        const obsMap = d.observations || {};
        
        let hasClassStudent = false;
        const newObsMap: Record<string, any> = {};

        Object.keys(obsMap).forEach(studentId => {
          if (studentIds.includes(studentId)) {
            hasClassStudent = true;
          } else {
            newObsMap[studentId] = obsMap[studentId];
          }
        });

        if (hasClassStudent) {
          if (operationsInBatch >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            operationsInBatch = 0;
          }

          if (Object.keys(newObsMap).length === 0) {
            batch.delete(docSnap.ref);
            deletedDocsCount++;
          } else {
            batch.update(docSnap.ref, { observations: newObsMap });
            updatedDocsCount++;
          }
          operationsInBatch++;
        }
      }

      if (operationsInBatch > 0) {
        await batch.commit();
      }

      // 3. Clear from localStorage key: kg_obs_hist_
      let clearedLSHistCount = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('kg_obs_hist_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            if (data && data.observations) {
              const obsMap = data.observations;
              let hasClassStudent = false;
              const newObsMap: Record<string, any> = {};

              Object.keys(obsMap).forEach(studentId => {
                if (studentIds.includes(studentId)) {
                  hasClassStudent = true;
                } else {
                  newObsMap[studentId] = obsMap[studentId];
                }
              });

              if (hasClassStudent) {
                if (Object.keys(newObsMap).length === 0) {
                  localStorage.removeItem(key);
                  clearedLSHistCount++;
                  i--;
                } else {
                  data.observations = newObsMap;
                  localStorage.setItem(key, JSON.stringify(data));
                  clearedLSHistCount++;
                }
              }
            }
          } catch (e) {
            console.error(e);
          }
        }
      }

      // 4. Also clean general kg_observation_data keys
      const kgObsDataSaved = localStorage.getItem('kg_observation_data');
      if (kgObsDataSaved) {
        try {
          const obsMap = JSON.parse(kgObsDataSaved);
          const newObsMap: Record<string, any> = {};
          let changed = false;
          Object.keys(obsMap).forEach(studentId => {
            if (studentIds.includes(studentId)) {
              changed = true;
            } else {
              newObsMap[studentId] = obsMap[studentId];
            }
          });
          if (changed) {
            localStorage.setItem('kg_observation_data', JSON.stringify(newObsMap));
          }
        } catch (e) {
          console.error(e);
        }
      }

      toast.success(`Berhasil menghapus data observasi kelas "${activeClassObj.name}"! (${deletedDocsCount} sesi dihapus penuh, ${updatedDocsCount} dokumen disesuaikan, ${clearedLSHistCount} local storage disinkronkan).`);
      loadRecapData();

    } catch (err: any) {
      console.error(err);
      toast.error(`Gagal menghapus data observasi: ${err.message || String(err)}`);
    } finally {
      setIsDeletingClassObs(false);
    }
  };

  const handleDeleteIndividualObservation = async (studentId: string, studentName: string) => {
    if (!selectedDetailSession) return;
    const confirmMsg = `Hapus data observasi untuk siswa "${studentName}" pada sesi tanggal ${selectedDetailSession.date} ini?`;
    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      const docRef = doc(db, 'observations', selectedDetailSession.id);
      const updatedObservations = { ...selectedDetailSession.observations };
      delete updatedObservations[studentId];

      if (Object.keys(updatedObservations).length === 0) {
        await deleteDoc(docRef);
        const lsKey = `kg_obs_hist_${selectedDetailSession.activity}_${selectedDetailSession.domain}_${selectedDetailSession.date}`;
        localStorage.removeItem(lsKey);
        setSelectedDetailSession(null);
        toast.success(`Seluruh observasi kosong. Sesi ${selectedDetailSession.date} dihapus penuh.`);
      } else {
        await setDoc(docRef, { ...selectedDetailSession, observations: updatedObservations });
        setSelectedDetailSession({
          ...selectedDetailSession,
          observations: updatedObservations
        });
        toast.success(`Berhasil menghapus observasi untuk "${studentName}".`);
      }
      loadRecapData();
    } catch (err: any) {
      console.error(err);
      toast.error(`Gagal menghapus observasi individu: ${err.message || String(err)}`);
    }
  };

  const handleDeleteEntireSession = async () => {
    if (!selectedDetailSession) return;
    const confirmMsg = `Apakah Anda yakin ingin menghapus seluruh dokumentasi sesi (${selectedDetailSession.date}) ini? Semua penilaian siswa pada hari ini akan hilang permanen.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const docRef = doc(db, 'observations', selectedDetailSession.id);
      await deleteDoc(docRef);

      const lsKey = `kg_obs_hist_${selectedDetailSession.activity}_${selectedDetailSession.domain}_${selectedDetailSession.date}`;
      localStorage.removeItem(lsKey);

      toast.success("Berhasil menghapus seluruh sesi.");
      setSelectedDetailSession(null);
      loadRecapData();
    } catch (err: any) {
      console.error(err);
      toast.error(`Gagal menghapus sesi: ${err.message || String(err)}`);
    }
  };

  const handleDeleteMonthlyObservations = async () => {
    const confirmMsg = `PERINGATAN KRITIS: Anda yakin ingin menghapus SELURUH data observasi semua kelas untuk bulan ini? Tindakan ini bersifat permanen.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsBgFetching(true);
      const qSnap = await getDocs(collection(db, 'observations'));
      let batch = writeBatch(db);
      let operationsInBatch = 0;
      let count = 0;

      for (const docSnap of qSnap.docs) {
        const d = docSnap.data();
        if (d.date) {
          const parts = d.date.split('-');
          if (parts.length >= 2) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (y === recapYear && m === recapMonth) {
              if (operationsInBatch >= 450) {
                await batch.commit();
                batch = writeBatch(db);
                operationsInBatch = 0;
              }
              batch.delete(docSnap.ref);
              count++;
              operationsInBatch++;
            }
          }
        }
      }

      if (operationsInBatch > 0) {
        await batch.commit();

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('kg_obs_hist_')) {
            const parts = key.split('_');
            const dateStr = parts[parts.length - 1];
            if (dateStr && dateStr.includes('-')) {
              const dParts = dateStr.split('-');
              if (dParts.length >= 2) {
                const y = parseInt(dParts[0], 10);
                const m = parseInt(dParts[1], 10);
                if (y === recapYear && m === recapMonth) {
                  localStorage.removeItem(key);
                  i--;
                }
              }
            }
          }
        }

        toast.success(`Berhasil menghapus ${count} sesi harian pada bulan ini.`);
      } else {
        toast.info("Tidak ada data observasi harian tercatat pada bulan ini.");
      }
      loadRecapData();
    } catch (err: any) {
      console.error(err);
      toast.error(`Gagal menghapus data bulanan: ${err.message || String(err)}`);
    } finally {
      setIsBgFetching(false);
    }
  };

  // Monthly table helpers
  const daysInMonth = React.useMemo(() => {
    return new Date(recapYear, recapMonth, 0).getDate();
  }, [recapMonth, recapYear]);

  const isWeekendDay = (dayNum: number) => {
    const d = new Date(recapYear, recapMonth - 1, dayNum);
    const day = d.getDay();
    return day === 0 || day === 6;
  };

  const studentDailyObsMap = React.useMemo(() => {
    const map: Record<string, Record<string, Array<{ domain: KGDomain; grading: KGGrading; activity: KGActivity }>>> = {};
    
    recapData.forEach(session => {
      const sDate = session.date;
      if (!sDate) return;
      
      const dateParts = sDate.split('-');
      if (dateParts.length < 2) return;
      const sYear = parseInt(dateParts[0], 10);
      const sMonth = parseInt(dateParts[1], 10);
      if (sYear !== recapYear || sMonth !== recapMonth) return;
      
      Object.keys(session.observations).forEach(studentId => {
        const studentObs = session.observations[studentId];
        if (studentObs && studentObs.grading) {
          if (!map[studentId]) {
            map[studentId] = {};
          }
          if (!map[studentId][sDate]) {
            map[studentId][sDate] = [];
          }
          map[studentId][sDate].push({
            domain: session.domain,
            grading: studentObs.grading,
            activity: session.activity
          });
        }
      });
    });
    
    return map;
  }, [recapData, recapMonth, recapYear]);

  React.useEffect(() => {
    if (activeTab === 'recap') {
      loadRecapData();
    }
  }, [activeTab, selectedClassId, recapMonth, recapYear]);

  // Triggered when selected Sentra + Domain combo changes: load / initialize specific data
  React.useEffect(() => {
    const key = `kg_obs_hist_${selectedActivity}_${selectedDomain}`;
    const savedComboData = localStorage.getItem(key);
    if (savedComboData) {
      try {
        const parsed = JSON.parse(savedComboData);
        if (parsed.observations) setObservations(parsed.observations);
        if (parsed.generalPhoto) setGeneralPhoto(parsed.generalPhoto);
      } catch (e) {
        console.error(e);
      }
    } else {
      // Restore default values if no saved session exist for this combo
      const cleared = getStoredStudents().reduce((acc, kid) => {
        acc[kid.id] = { grading: null, notes: '', photo: null };
        return acc;
      }, {} as Record<string, StudentObservation>);
      setObservations(cleared);
    }
  }, [selectedActivity, selectedDomain]);

  const updateStudentField = (studentId: string, field: keyof StudentObservation, value: any) => {
    setObservations(prev => {
      const updated = {
        ...prev,
        [studentId]: {
          ...prev[studentId],
          [field]: value
        }
      };
      // Keep in running scratchpad state
      localStorage.setItem('kg_observation_data', JSON.stringify(updated));
      return updated;
    });
  };

  // Real uploader for general activity photo
  const handleGeneralPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploadingGeneral(true);
      const reader = new FileReader();
      reader.onloadend = () => {
        setGeneralPhoto(reader.result as string);
        setIsUploadingGeneral(false);
        toast.success('Foto Kegiatan Utama berhasil diunggah! ✨');
      };
      reader.onerror = () => {
        setIsUploadingGeneral(false);
        toast.error('Gagal membaca fail foto.');
      };
      reader.readAsDataURL(file);
    }
  };

  // Real uploader for specific student photo
  const handleStudentPhotoUpload = (studentId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadProgress(prev => ({ ...prev, [studentId]: true }));
      const reader = new FileReader();
      reader.onloadend = () => {
        updateStudentField(studentId, 'photo', reader.result as string);
        setUploadProgress(prev => ({ ...prev, [studentId]: false }));
        toast.success('Foto khusus siswa berhasil diunggah! 📸');
      };
      reader.onerror = () => {
        setUploadProgress(prev => ({ ...prev, [studentId]: false }));
        toast.error('Gagal membaca fail foto.');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveAll = async () => {
    // 1. Mandatory check: general photo MUST escape empty or null values
    if (!generalPhoto) {
      toast.error('Gagal menyimpan! Foto General (kegiatan utama) wajib diisi.', {
        style: { background: '#fecaca', color: '#b91c1c', border: '1px solid #fee2e2' }
      });
      return;
    }

    setIsSaving(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      
      // Enrich with student's names
      const enrichedObservations = { ...observations };
      students.forEach(student => {
        if (enrichedObservations[student.id]) {
          enrichedObservations[student.id] = {
            ...enrichedObservations[student.id],
            studentName: student.name
          };
        } else if (student.oldLuminaId && enrichedObservations[student.oldLuminaId]) {
          enrichedObservations[student.oldLuminaId] = {
            ...enrichedObservations[student.oldLuminaId],
            studentName: student.name
          };
        } else if (student.nis && enrichedObservations[student.nis]) {
          enrichedObservations[student.nis] = {
            ...enrichedObservations[student.nis],
            studentName: student.name
          };
        }
      });

      // Save permanently for this combo key in LocalStorage
      const comboKey = `kg_obs_hist_${selectedActivity}_${selectedDomain}`;
      const payload = {
        selectedActivity,
        selectedDomain,
        generalPhoto,
        observations: enrichedObservations,
        date: todayStr,
        timestamp: Date.now()
      };
      localStorage.setItem(comboKey, JSON.stringify(payload));

      // Save permanently to Firestore 'observations' collection
      const docId = `${selectedActivity}_${selectedDomain}_${todayStr}`;
      const docRef = doc(db, 'observations', docId);
      
      await setDoc(docRef, {
        id: docId,
        activity: selectedActivity,
        domain: selectedDomain,
        date: todayStr,
        generalPhotoUrl: generalPhoto,
        observations: enrichedObservations,
        timestamp: Date.now(),
        updatedAt: Date.now()
      }, { merge: true });

      toast.success('Observation Data berhasil disimpan ke sistem & Firestore! ✨', {
        description: `Sentra: ${activities.find(a => a.id === selectedActivity)?.label}, Domain: ${domains.find(d => d.id === selectedDomain)?.label}`
      });
    } catch (err: any) {
      console.error("Gagal menyimpan ke Firestore:", err);
      toast.error(`Gagal menyimpan data ke Firestore: ${err.message || String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const clearGeneralPhoto = () => {
    setGeneralPhoto(null);
    toast.info('Foto General dikosongkan. Mohon unggah kembali sebelum menyimpan.');
  };

  const currentSentraObj = activities.find(a => a.id === selectedActivity);
  const currentDomainObj = domains.find(d => d.id === selectedDomain);

  if (isImportOpen) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-16 px-4">
        <div className="flex justify-start">
          <button
            type="button"
            onClick={() => setIsImportOpen(false)}
            className="flex items-center gap-2 text-xs font-black text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 rounded-2xl px-5 py-3.5 transition active:scale-95 cursor-pointer border border-emerald-100 uppercase tracking-widest"
          >
            <ArrowLeft size={14} strokeWidth={2.5} /> Kembali ke Workspace
          </button>
        </div>
        <ObservationBulkPeriodImport 
          classes={classes}
          students={students}
          initialClassId={selectedClassId}
          onClose={() => setIsImportOpen(false)}
          onImportSuccess={() => {
            // Success callback: refresh components if needed, etc.
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16 px-4">
      
      {/* Header Banner */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between bg-white rounded-3xl p-8 border border-gray-100 shadow-sm space-y-4 md:space-y-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-black uppercase rounded-full tracking-widest">Kindergarten Unit</span>
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Observation Data</h1>
        </div>
        <div className="flex items-center gap-2.5 self-start md:self-center flex-wrap">
          <button 
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-black px-5 py-3.5 rounded-2xl shadow-md border-0 transition-all active:scale-95 text-xs uppercase tracking-widest cursor-pointer"
          >
            <Sparkles size={15} className="animate-pulse" />
            Smart Bulk Import (Period)
          </button>
          
          <button 
            onClick={handleSaveAll}
            disabled={isSaving}
            className="flex items-center gap-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-6 py-3.5 rounded-2xl shadow-lg shadow-emerald-100 transition-all active:scale-95 disabled:opacity-50 text-xs uppercase tracking-widest"
          >
            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
            Simpan Sesi Observasi
          </button>
        </div>
      </header>

      {/* Sub Mode Tab Switcher */}
      <div className="flex bg-white/80 backdrop-blur p-1.5 rounded-2xl border border-gray-100 shadow-sm self-start gap-1 max-w-sm">
        <button
          type="button"
          onClick={() => setActiveTab('input')}
          className={cn(
            "flex-1 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 border-0 cursor-pointer text-center",
            activeTab === 'input'
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-gray-500 hover:text-gray-950 hover:bg-gray-50/50"
          )}
        >
          📝 Input Observasi
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('recap')}
          className={cn(
            "flex-1 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 border-0 cursor-pointer text-center flex items-center justify-center gap-1.5",
            activeTab === 'recap'
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-gray-500 hover:text-gray-955 hover:bg-gray-50/50"
          )}
        >
          📊 Rekap Bulanan
          {isBgFetching && <RefreshCw size={11} className="animate-spin text-emerald-600" />}
        </button>
      </div>

      {activeTab === 'input' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: Configuration Block (4 grid columns) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* 1. Sentra Selection */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-50 pb-3">
              <div className="flex items-center gap-2">
                <Compass size={18} className="text-emerald-500" />
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">1. Pilih Sentra / Sesi</h3>
              </div>
              <span className="px-2.5 py-0.5 bg-gray-100 text-gray-600 text-[9px] font-black uppercase rounded-full">Pilih 1</span>
            </div>
            
            <div className="grid grid-cols-1 gap-1.5 max-h-[300px] overflow-y-auto pr-1">
              {activities.map(act => {
                const isSelected = selectedActivity === act.id;
                return (
                  <button
                    key={act.id}
                    onClick={() => setSelectedActivity(act.id)}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-2xl text-left transition-all border border-transparent",
                      isSelected 
                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-100 font-bold border-emerald-500 scale-[1.01]" 
                        : "text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 bg-gray-50/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-xl",
                        isSelected ? "bg-white/20 text-white" : "bg-white text-gray-500 shadow-sm"
                      )}>
                        {React.cloneElement(act.icon as React.ReactElement, { size: 14 })}
                      </div>
                      <span className="text-[11px] font-bold tracking-tight">{act.label}</span>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center text-emerald-600">
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Domain Selection */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-50 pb-3">
              <div className="flex items-center gap-2">
                <Brain size={18} className="text-emerald-500" />
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">2. Pilih Domain Perkembangan</h3>
              </div>
              <span className="px-2.5 py-0.5 bg-gray-100 text-gray-600 text-[9px] font-black uppercase rounded-full">Pilih 1</span>
            </div>
            
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
              {domains.map(dom => {
                const isSelected = selectedDomain === dom.id;
                return (
                  <button
                    key={dom.id}
                    onClick={() => setSelectedDomain(dom.id)}
                    className={cn(
                      "w-full flex flex-col p-3 rounded-2xl text-left transition-all border",
                      isSelected 
                        ? "bg-gray-900 text-white border-gray-900 shadow-lg scale-[1.01]" 
                        : "text-gray-700 hover:bg-gray-50 border-gray-100 bg-white"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[11px] font-black tracking-wide">{dom.label}</span>
                      {isSelected ? (
                        <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-white scale-90">
                          <Check size={10} strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-gray-100 border border-gray-200" />
                      )}
                    </div>
                    <span className={cn(
                      "text-[9px] mt-1 line-clamp-1 leading-snug",
                      isSelected ? "text-gray-300" : "text-gray-400"
                    )}>
                      {dom.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. General Photo (Wajib Diisi) */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-50 pb-3">
              <div className="flex items-center gap-2">
                <Camera size={18} className="text-rose-500" />
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">3. Foto General (Wajib)</h3>
              </div>
              <span className="px-2.5 py-0.5 bg-rose-100 text-rose-700 text-[9.5px] font-black uppercase rounded-full animate-pulse">Required</span>
            </div>

            <AnimatePresence mode="wait">
              {generalPhoto ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-3"
                >
                  <div className="relative aspect-video rounded-2xl overflow-hidden group bg-gray-100 border border-gray-100 shadow-inner">
                    <img src={generalPhoto} alt="General Activity" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <label className="p-2.5 bg-white/90 hover:bg-white text-gray-800 rounded-xl font-bold text-xs transition-transform hover:scale-105 flex items-center gap-1.5 shadow-md cursor-pointer">
                        <RefreshCw size={14} className="text-emerald-600" /> Ganti
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={handleGeneralPhotoUpload} 
                          className="hidden" 
                        />
                      </label>
                      <button 
                        onClick={clearGeneralPhoto}
                        className="p-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs transition-transform hover:scale-105 flex items-center gap-1.5 shadow-md cursor-pointer"
                      >
                        <Trash2 size={14} /> Hapus
                      </button>
                    </div>
                    <div className="absolute bottom-2 left-2 bg-rose-600 text-white px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider">
                      Active Fallback
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] bg-emerald-50 text-emerald-800 p-2.5 rounded-xl border border-emerald-150">
                    <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    <span>Lolos verifikasi. Foto ini akan melengkapi arsip harian siswa secara otomatis.</span>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="rounded-2xl border-2 border-dashed border-rose-200 bg-rose-50/20 p-8 flex flex-col items-center justify-center text-center gap-3 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
                    <AlertTriangle size={24} className="animate-bounce" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-rose-800 uppercase tracking-widest">Foto Harian Belum Diisi</h4>
                    <p className="text-[10px] text-rose-600 mt-1 max-w-[200px] leading-relaxed mx-auto">
                      Sesi ini tidak dapat disimpan sebelum Foto General diunggah.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-widest px-5 py-2.5 rounded-xl shadow-lg shadow-rose-100 transition-all hover:scale-103 cursor-pointer">
                    {isUploadingGeneral ? (
                      <>
                        <Loader2 className="animate-spin" size={14} /> Membaca...
                      </>
                    ) : (
                      <>
                        <Upload size={14} /> Unggah Foto Kegiatan
                      </>
                    )}
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleGeneralPhotoUpload} 
                      className="hidden" 
                    />
                  </label>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* RIGHT COLUMN: Active Evaluator Workspace (8 grid columns) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Sesi Header Context Card */}
          <div className="bg-gray-900 rounded-[2rem] p-6 text-white flex flex-col md:flex-row justify-between items-start md:items-center shadow-lg gap-4 relative overflow-hidden">
            <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-48 h-48 bg-white/5 rounded-full pointer-events-none" />
            <div className="space-y-1 bg-white/5 py-3.5 px-5 rounded-2xl border border-white/5">
              <span className="text-[9px] font-black text-emerald-400 tracking-widest uppercase">Target Evaluasi Sesi</span>
              <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-1">
                <span className="text-sm font-black tracking-tight">{currentSentraObj?.label}</span>
                <span className="text-gray-500 text-xs">&gt;</span>
                <span className="text-xs font-bold text-gray-300">{currentDomainObj?.label}</span>
              </div>
            </div>
            
            <div className="text-left md:text-right flex items-center md:flex-col gap-2 md:gap-0 font-mono">
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Waktu Observasi</span>
              <span className="text-xs font-bold text-emerald-400 mt-1">Hari Ini (2026-05-21)</span>
            </div>
          </div>

          {/* Student Observations Loop Container */}
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-2">
              <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                <UserCheck size={16} className="text-emerald-600" /> Lembar Penilaian Siswa KKG
              </h2>
              
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-150 rounded-2xl px-3.5 py-2">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Pilih Kelas:</span>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="bg-transparent text-xs font-bold text-gray-800 outline-none cursor-pointer border-0 p-0 focus:ring-0"
                >
                  {classes.map((cls) => {
                    const classStudentsCount = students.filter(s => isStudentInClass(s.classId, cls)).length;
                    return (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} ({classStudentsCount} Siswa)
                      </option>
                    );
                  })}
                  {classes.length === 0 && (
                    <option value="">Tidak ada kelas aktif</option>
                  )}
                </select>
              </div>
            </div>

            {(() => {
              const activeClassObj = classes.find(c => c.id === selectedClassId);
              const filteredStudents = students.filter((student) => {
                if (!selectedClassId) return false;
                if (!activeClassObj) return false;
                return isStudentInClass(student.classId, activeClassObj);
              });

              if (filteredStudents.length === 0) {
                return (
                  <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-2.5">
                    <UserCheck className="text-gray-300" size={32} />
                    <div>
                      <p className="text-xs font-extrabold text-gray-700 uppercase tracking-wider">Tidak Ada Siswa Terdaftar</p>
                      <p className="text-[11px] text-gray-400 font-medium mt-1">
                        Belum ada siswa yang masuk ke dalam kategori kelas ini di kelompok belajar Lumina Kindergarten.
                      </p>
                    </div>
                  </div>
                );
              }

              return filteredStudents.map((student) => {
                const obs = getStudentObs(observations, student);
                const resolvedPhoto = obs.photo || generalPhoto;
                const hasSpecificPhoto = !!obs.photo;

                return (
                  <div 
                    key={student.id}
                    className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 hover:border-emerald-200 hover:shadow-md transition-all duration-300 grid grid-cols-1 md:grid-cols-12 gap-6 relative"
                  >
                  
                  {/* Left block: student info & initials avatar */}
                  <div className="md:col-span-3 flex flex-col justify-start space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-black text-base flex items-center justify-center shadow-md">
                        {student.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-black text-gray-900 tracking-tight leading-tight uppercase truncate">{student.name}</h4>
                        <p className="text-[10px] font-bold text-gray-400 font-mono mt-0.5">NIS: {student.id}</p>
                      </div>
                    </div>
                    
                    <div className="bg-gray-50/70 rounded-xl p-2.5 border border-gray-100 text-[10px] text-gray-500 leading-normal">
                      <span className="font-bold block text-gray-700">Status Capaian:</span>
                      <span className="font-semibold block italic mt-0.5 text-emerald-700">
                        {grades.find(g => g.id === obs.grading)?.label || 'Belum Dinilai'}
                      </span>
                    </div>
                  </div>

                  {/* Middle block: grading metrics selector & notes */}
                  <div className="md:col-span-6 space-y-4">
                    {/* Capaian Pill selector */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1 leading-none">
                        Tingkat Capaian <HelpCircle size={10} className="text-gray-300" />
                      </label>
                      <div className="flex flex-wrap gap-1">
                        {grades.map((gr) => {
                          const isCurrentGrading = obs.grading === gr.id;
                          return (
                            <button
                              key={gr.id}
                              type="button"
                              onClick={() => updateStudentField(student.id, 'grading', obs.grading === gr.id ? null : gr.id)}
                              title={gr.desc}
                              className={cn(
                                "px-2.5 py-1.5 rounded-xl text-[9px] font-bold transition-all border shrink-0",
                                isCurrentGrading 
                                  ? gr.color + " border-transparent shadow-sm scale-103 font-black" 
                                  : "bg-white text-gray-400 border-gray-200 hover:border-emerald-300 hover:text-emerald-600"
                              )}
                            >
                              {gr.id}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[9.5px] italic text-gray-400 pl-1 leading-normal">
                        Keterangan: {grades.find(g => g.id === obs.grading)?.desc || '-'}
                      </p>
                    </div>

                    {/* Notes textarea */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Catatan Pembelajaran (Opsional)</label>
                      <textarea 
                        rows={2}
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs outline-none focus:ring-1 focus:ring-emerald-400 focus:bg-white transition-all text-gray-700 font-medium placeholder:italic"
                        placeholder={`Tulis momen spesifik mengenai perilaku ${((student.name || "Ananda") + "").split(' ')[0]} terkait ${currentDomainObj?.label}...`}
                        value={obs.notes}
                        onChange={(e) => updateStudentField(student.id, 'notes', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Right block: Student specific photo override */}
                  <div className="md:col-span-3 flex flex-col justify-between space-y-2">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none block">
                        Foto Siswa (Opsional)
                      </label>
                      
                      {/* Photo preview block */}
                      <div className="relative aspect-video md:aspect-square md:w-full rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 flex items-center justify-center group shadow-inner">
                        {resolvedPhoto ? (
                          <>
                            <img src={resolvedPhoto} alt={student.name} className="w-full h-full object-cover" />
                            {hasSpecificPhoto ? (
                              <button
                                onClick={() => updateStudentField(student.id, 'photo', null)}
                                className="absolute top-1 right-1 p-1.5 bg-red-600 text-white rounded-lg hover:scale-110 opacity-0 group-hover:opacity-100 transition-all shadow-md"
                                title="Reset gunakan Foto Harian"
                              >
                                <X size={10} strokeWidth={4} />
                              </button>
                            ) : null}
                          </>
                        ) : (
                          <div className="text-center p-2 flex flex-col items-center justify-center gap-1">
                            <ImageIcon size={18} className="text-gray-300" />
                            <span className="text-[8px] text-gray-400 leading-tight">Belum ada foto</span>
                          </div>
                        )}

                        {/* Glass overlay label specifying photo source */}
                        {resolvedPhoto && (
                          <div className={cn(
                            "absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[8px] font-black tracking-wide uppercase shadow-sm",
                            hasSpecificPhoto 
                              ? "bg-emerald-600/90 text-white" 
                              : "bg-gray-800/80 text-gray-200"
                          )}>
                            {hasSpecificPhoto ? "Foto Khusus" : "Foto Harian"}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Native student-specific file uploader */}
                    <label
                      className={cn(
                        "w-full py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                        hasSpecificPhoto 
                          ? "bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700" 
                          : "bg-white hover:bg-gray-50 border-gray-200 text-gray-600"
                      )}
                    >
                      {uploadProgress[student.id] ? (
                        <>
                          <Loader2 className="animate-spin" size={10} /> Membaca...
                        </>
                      ) : (
                        <>
                          <Camera size={10} /> 
                          {hasSpecificPhoto ? "Ganti Foto Khusus" : "Unggah Foto Khusus"}
                        </>
                      )}
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => handleStudentPhotoUpload(student.id, e)} 
                        className="hidden" 
                      />
                    </label>
                    
                    {!hasSpecificPhoto && generalPhoto && (
                      <span className="text-[8px] text-gray-400 leading-none text-center block italic">
                        Otomatis mewarisi Foto General
                      </span>
                    )}
                  </div>

                </div>
              );
            });
          })()}
          </div>
               {/* Bottom Save Action Panel */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-emerald-50 text-emerald-600">
                <Info size={18} />
              </div>
              <div className="text-xs">
                <p className="font-black text-gray-900">Periksa Ulang Sebelum Menyimpan</p>
                <p className="text-gray-400 mt-0.5">Penilaian ini bernilai dinamis dan langsung disinkronkan ke local storage sasi terkait.</p>
              </div>
            </div>

            <button 
              onClick={handleSaveAll}
              disabled={isSaving}
              className="flex items-center gap-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-8 py-4 rounded-2.5xl shadow-xl shadow-emerald-150 transition-all active:scale-95 disabled:opacity-50 text-xs uppercase tracking-widest shrink-0"
            >
              {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Simpan Observation Data
            </button>
          </div>

        </div>

      </div>
      ) : (
        <div className="space-y-6">
          
          {/* Controls Bar */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {/* Select Class (synced with top selection!) */}
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-150 rounded-2xl px-3.5 py-2">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Kelas:</span>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="bg-transparent text-xs font-bold text-gray-800 outline-none cursor-pointer border-0 p-0 focus:ring-0"
                >
                  {classes.map((cls) => {
                    const classStudentsCount = students.filter(s => isStudentInClass(s.classId, cls)).length;
                    return (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} ({classStudentsCount} Siswa)
                      </option>
                    );
                  })}
                  {classes.length === 0 && (
                    <option value="">Tidak ada kelas aktif</option>
                  )}
                </select>
              </div>

              {/* Select Month */}
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-150 rounded-2xl px-3.5 py-2">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Bulan:</span>
                <select
                  value={recapMonth}
                  onChange={(e) => setRecapMonth(Number(e.target.value))}
                  className="bg-transparent text-xs font-bold text-gray-800 outline-none cursor-pointer border-0 p-0 focus:ring-0"
                >
                  {months.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Select Year */}
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-150 rounded-2xl px-3.5 py-2">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Tahun:</span>
                <select
                  value={recapYear}
                  onChange={(e) => setRecapYear(Number(e.target.value))}
                  className="bg-transparent text-xs font-bold text-gray-800 outline-none cursor-pointer border-0 p-0 focus:ring-0"
                >
                  <option value={2024}>2024</option>
                  <option value={2025}>2025</option>
                  <option value={2026}>2026</option>
                  <option value={2027}>2027</option>
                </select>
              </div>
            </div>

            {/* Sync trigger & sub-views selector */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex flex-col gap-1.5 min-w-[150px]">
                <button
                  type="button"
                  onClick={handleDeleteClassObservations}
                  disabled={isDeletingClassObs}
                  className="flex items-center justify-center gap-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-150 text-rose-700 font-extrabold px-3 py-1.5 text-[10px] uppercase tracking-wider rounded-xl transition active:scale-95 disabled:opacity-50 cursor-pointer w-full"
                  title="Hapus data observasi kelas terpilih"
                >
                  <Trash2 size={11} className={cn(isDeletingClassObs && "animate-spin")} />
                  Hapus OBS Kelas
                </button>

                <button
                  type="button"
                  onClick={handleDeleteMonthlyObservations}
                  disabled={isBgFetching}
                  className="flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 border border-red-150 text-red-700 font-extrabold px-3 py-1.5 text-[10px] uppercase tracking-wider rounded-xl transition active:scale-95 disabled:opacity-50 cursor-pointer w-full"
                  title="Hapus seluruh data observasi di bulan terpilih"
                >
                  <Trash2 size={11} className={cn(isBgFetching && "animate-spin")} />
                  Hapus Data Bulanan
                </button>
              </div>

              <button
                type="button"
                onClick={loadRecapData}
                disabled={isBgFetching}
                className="flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-150 text-gray-700 font-extrabold px-4 py-2.5 text-xs uppercase tracking-wider rounded-2xl transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw size={12} className={cn(isBgFetching && "animate-spin")} />
                Sinkronisasi
              </button>

              <div className="flex bg-gray-100 p-1 rounded-2xl border border-gray-200/50">
                <button
                  type="button"
                  onClick={() => setRecapSubView('matrix')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer border-0",
                    recapSubView === 'matrix'
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700 bg-transparent"
                  )}
                >
                  Perkembangan Domain
                </button>
                <button
                  type="button"
                  onClick={() => setRecapSubView('sessions')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer border-0",
                    recapSubView === 'sessions'
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700 bg-transparent"
                  )}
                >
                  Log Sesi ({recapData.filter(item => {
                    if (!item.date) return false;
                    const parts = item.date.split('-');
                    if (parts.length < 2) return false;
                    const isMonthMatch = parseInt(parts[0], 10) === recapYear && parseInt(parts[1], 10) === recapMonth;
                    if (!isMonthMatch) return false;

                    const activeClassObj = classes.find(c => c.id === selectedClassId);
                    const classStudents = students.filter(student => {
                      if (!selectedClassId || !activeClassObj) return false;
                      return isStudentInClass(student.classId, activeClassObj);
                    });

                    return classStudents.some(student => {
                      const obs = item.observations?.[student.id];
                      return obs && obs.grading;
                    });
                  }).length})
                </button>
                <button
                  type="button"
                  onClick={() => setRecapSubView('monthly_table')}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer border-0",
                    recapSubView === 'monthly_table'
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-755 bg-transparent"
                  )}
                >
                  Tabel Bulanan
                </button>
              </div>
            </div>
          </div>

          {/* Quick Insights Counts */}
          {(() => {
            const activeClassObj = classes.find(c => c.id === selectedClassId);
            const classStudents = students.filter(student => {
              if (!selectedClassId || !activeClassObj) return false;
              return isStudentInClass(student.classId, activeClassObj);
            });

            const filteredRecapSessions = recapData.filter(item => {
              if (!item.date) return false;
              const parts = item.date.split('-');
              if (parts.length < 2) return false;
              const yearItem = parseInt(parts[0], 10);
              const monthItem = parseInt(parts[1], 10);
              const isMonthMatch = monthItem === recapMonth && yearItem === recapYear;
              if (!isMonthMatch) return false;

              // Filter to show sessions only if they contain at least one evaluation for the current class's students
              return classStudents.some(student => {
                const obs = getStudentObs(item.observations, student);
                return obs && obs.grading;
              });
            });

            const assessedStudentsCount = classStudents.filter(student => {
              return filteredRecapSessions.some(session => {
                const obs = getStudentObs(session.observations, student);
                return obs && obs.grading;
              });
            }).length;

            const gradingCounts = { BB: 0, MB: 0, BSH: 0, BSB: 0 };
            filteredRecapSessions.forEach(session => {
              classStudents.forEach(student => {
                const obs = getStudentObs(session.observations, student);
                if (obs && obs.grading && obs.grading in gradingCounts) {
                  gradingCounts[obs.grading as keyof typeof gradingCounts]++;
                }
              });
            });

            let dominantGrade = 'Belum Ada';
            let maxCount = 0;
            Object.entries(gradingCounts).forEach(([grade, count]) => {
              if (count > maxCount) {
                maxCount = count;
                dominantGrade = grade;
              }
            });

            const gradeLabelMap = {
              'BB': 'Belum Berkembang',
              'MB': 'Mulai Berkembang',
              'BSH': 'Capaian Harapan (BSH)',
              'BSB': 'Sangat Baik (BSB)'
            };
            const readableDominant = dominantGrade === 'Belum Ada' ? 'Tidak ada data' : gradeLabelMap[dominantGrade as keyof typeof gradeLabelMap];

            return (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Bento Card 1: Sesi Evaluasi */}
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-3xl p-6 border border-emerald-100 flex items-center justify-between shadow-sm animate-fade-in">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest animate-pulse">Sesi Terlaksana</span>
                      <p className="text-3xl font-black text-gray-900 tracking-tight">{filteredRecapSessions.length}</p>
                      <p className="text-[11px] text-gray-500 font-medium">Pertemuan evaluasi bulan ini</p>
                    </div>
                    <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-100">
                      <Star size={24} />
                    </div>
                  </div>

                  {/* Bento Card 2: Siswa Dinilai */}
                  <div className="bg-gradient-to-br from-indigo-50 to-sky-50 rounded-3xl p-6 border border-indigo-100 flex items-center justify-between shadow-sm animate-fade-in">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Siswa Dinilai</span>
                      <p className="text-3xl font-black text-gray-900 tracking-tight">
                        {assessedStudentsCount} <span className="text-sm font-bold text-gray-400">/ {classStudents.length} siswa</span>
                      </p>
                      <p className="text-[11px] text-gray-500 font-medium">Siswa terdaftar di kelas aktif</p>
                    </div>
                    <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-100">
                      <UserCheck size={24} />
                    </div>
                  </div>

                  {/* Bento Card 3: Dominan Capaian */}
                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl p-6 border border-purple-100 flex items-center justify-between shadow-sm animate-fade-in">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest">Capaian Dominan</span>
                      <p className="text-lg font-black text-gray-900 leading-snug mt-1 truncate max-w-[200px]" title={readableDominant}>
                        {readableDominant}
                      </p>
                      <p className="text-[11px] text-gray-500 font-medium">Berdasarkan akumulasi evaluasi</p>
                    </div>
                    <div className="w-14 h-14 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-100">
                      <Activity size={24} />
                    </div>
                  </div>
                </div>

                {/* Sub View Content */}
                {recapSubView === 'matrix' ? (
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in text-gray-900">
                    <div className="p-6 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Matriks Perkembangan Siswa</h3>
                      </div>
                      <span className="text-[10px] font-black text-emerald-600 bg-emerald-50/70 border border-emerald-100 px-3 py-1.5 rounded-xl uppercase tracking-widest self-start">
                        Klik sel untuk rincian
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[900px]">
                        <thead>
                          <tr className="bg-gray-50/70 text-[10px] font-black text-gray-500 uppercase tracking-wider border-b border-gray-100">
                            <th className="p-4 pl-6 w-56">Siswa</th>
                            {domains.map(dom => (
                              <th key={dom.id} className="p-4 text-center text-[9px] w-40" title={dom.desc}>
                                {dom.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {classStudents.map(student => (
                            <tr key={student.id} className="hover:bg-gray-50/20 transition duration-150">
                              <td className="p-4 pl-6">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white font-black text-xs flex items-center justify-center shadow">
                                    {student.name.charAt(0)}
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="text-xs font-black text-gray-800 uppercase truncate leading-tight">{student.name}</h4>
                                    <span className="text-[9px] text-gray-400 font-mono">NIS: {student.id}</span>
                                  </div>
                                </div>
                              </td>

                              {domains.map(dom => {
                                const entries: any[] = [];
                                filteredRecapSessions.forEach(session => {
                                  if (session.domain === dom.id) {
                                    const studentObs = getStudentObs(session.observations, student);
                                    if (studentObs && studentObs.grading) {
                                      entries.push({
                                        date: session.date,
                                        activity: session.activity,
                                        grading: studentObs.grading,
                                        notes: studentObs.notes,
                                        photo: studentObs.photo || session.generalPhoto,
                                        hasSpecificPhoto: !!studentObs.photo
                                      });
                                    }
                                  }
                                });
                                entries.sort((a, b) => a.date.localeCompare(b.date));

                                const counts = entries.reduce((acc, entry) => {
                                  acc[entry.grading] = (acc[entry.grading] || 0) + 1;
                                  return acc;
                                }, {} as Record<string, number>);

                                const hasData = entries.length > 0;

                                return (
                                  <td 
                                    key={dom.id} 
                                    onClick={() => {
                                      if (hasData) {
                                        setSelectedDetailCell({ student, domain: dom, entries });
                                      }
                                    }}
                                    className={cn(
                                      "p-3 text-center transition cursor-pointer vertical-align-middle",
                                      hasData ? "hover:bg-emerald-50/40" : "cursor-default text-gray-300"
                                    )}
                                  >
                                    <div className="flex flex-col items-center justify-center gap-1 min-h-[46px]">
                                      {hasData ? (
                                        <>
                                          <div className="flex flex-wrap items-center justify-center gap-1 max-w-[140px]">
                                            {Object.entries(counts).map(([grade, count]) => {
                                              const colorCls = grade === 'BB' ? 'bg-rose-50 text-rose-700 border-rose-100'
                                                : grade === 'MB' ? 'bg-amber-50 text-amber-700 border-amber-100'
                                                : grade === 'BSH' ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                : grade === 'BSB' ? 'bg-teal-50 text-teal-700 border-teal-100'
                                                : 'bg-gray-50 text-gray-400 border-gray-100';

                                              return (
                                                <span key={grade} className={cn("px-1.5 py-0.5 rounded text-[8px] font-black uppercase border tracking-tight shrink-0", colorCls)}>
                                                  {grade} <span className="text-[7.5px] font-bold text-gray-400 ml-0.5">({count}x)</span>
                                                </span>
                                              );
                                            })}
                                          </div>
                                          <span className="text-[8px] font-semibold text-gray-400 italic">
                                            {entries.length} Sesi Catatan
                                          </span>
                                        </>
                                      ) : (
                                        <span className="text-[10px] text-gray-300 italic font-mono">— Nihil —</span>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : recapSubView === 'sessions' ? (
                  // Log Sesi & Riwayat Foto Sub-View
                  <div className="space-y-4 animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {filteredRecapSessions.length === 0 ? (
                        <div className="col-span-full bg-white rounded-3xl p-16 text-center border border-gray-100 flex flex-col items-center justify-center gap-3">
                          <ClipboardList className="text-gray-350" size={40} />
                          <div>
                            <p className="text-xs font-black text-gray-700 uppercase tracking-wider">Belum Ada Sesi Bulanan</p>
                            <p className="text-[11px] text-gray-400 mt-1 max-w-sm mx-auto leading-normal">
                              Di bulan {months.find(m => m.value === recapMonth)?.label}, belum ada sesi atau data observasi yang tercatat ke sistem Lumina.
                            </p>
                          </div>
                        </div>
                      ) : (
                        filteredRecapSessions.map(session => {
                          const actConfig = activities.find(a => a.id === session.activity);
                          const totalGradedCount = Object.keys(session.observations).filter(sid => {
                            const inClass = classStudents.some(cs => cs.id === sid);
                            return inClass && session.observations[sid].grading;
                          }).length;

                          return (
                            <div 
                              key={session.id}
                              onClick={() => setSelectedDetailSession(session)}
                              className="bg-white rounded-3xl p-5 border border-gray-100 hover:border-emerald-250 hover:shadow-md transition-all duration-300 flex gap-5 cursor-pointer items-start group"
                            >
                              <div className="w-24 h-24 rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 shrink-0 flex items-center justify-center relative shadow-inner">
                                {session.generalPhoto ? (
                                  <img src={session.generalPhoto} alt={session.activity} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500" />
                                ) : (
                                  <div className="text-center p-2 flex flex-col items-center justify-center gap-1">
                                    <ImageIcon size={22} className="text-gray-350 animate-pulse" />
                                    <span className="text-[7.5px] text-gray-400 font-bold leading-normal">Tanpa Foto</span>
                                  </div>
                                )}
                              </div>

                              <div className="flex-1 min-w-0 space-y-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-lg text-gray-400">
                                    <span className="text-[8.5px] font-bold text-gray-400 font-mono">{session.date}</span>
                                  </div>
                                  <span className="text-[8px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded uppercase tracking-wide">
                                    {totalGradedCount} Siswa Dinilai
                                  </span>
                                </div>

                                <div className="space-y-0.5 mt-1">
                                  <h4 className="text-sm font-black text-gray-850 tracking-tight leading-snug truncate uppercase">
                                    {actConfig?.label || session.activity}
                                  </h4>
                                  <p className="text-[10px] text-gray-400 font-black tracking-widest uppercase">
                                    {domains.find(d => d.id === session.domain)?.label || session.domain}
                                  </p>
                                </div>

                                <p className="text-[10px] text-emerald-600 font-black uppercase tracking-wider flex items-center gap-1 hover:text-emerald-800 transition">
                                  Lihat Sesi Rincian <ChevronRight size={12} strokeWidth={2.5} />
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  // Monthly Observation Daily Table view
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in text-gray-900">
                    <div className="p-6 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Tabel Hasil Observasi Bulanan</h3>
                        <p className="text-[11px] font-medium text-gray-400 mt-0.5">Daftar rekap harian semua domain yang diobservasi dalam sebulan</p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase">
                        <span className="px-2 py-1 rounded bg-rose-50 text-rose-700 border border-rose-100">BB: Belum Berkembang</span>
                        <span className="px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-100">MB: Mulai Berkembang</span>
                        <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">BSH: Berkembang Sesuai Harapan</span>
                        <span className="px-2 py-1 rounded bg-teal-50 text-teal-700 border border-teal-100">BSB: Berkembang Sangat Baik</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-xs min-w-[1000px]">
                        <thead>
                          <tr className="bg-gray-50/70 text-[10px] font-black text-gray-500 uppercase tracking-wider border-b border-gray-100">
                            <th className="p-4 pl-6 sticky left-0 bg-gray-50 border-r border-gray-100/80 w-52 z-10">Siswa</th>
                            {Array.from({ length: daysInMonth }).map((_, idx) => {
                              const day = idx + 1;
                              const weekend = isWeekendDay(day);
                              return (
                                <th 
                                  key={day}
                                  className={cn(
                                    "p-2 text-center font-bold border-r border-gray-100/40 w-10 min-w-[40px] text-[10px]",
                                    weekend ? "bg-red-50/50 text-rose-600" : "text-gray-600"
                                  )}
                                >
                                  {day}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {classStudents.length === 0 ? (
                            <tr>
                              <td colSpan={daysInMonth + 1} className="p-8 text-center text-gray-400 font-bold italic">
                                Belum ada siswa terdaftar di kelas ini.
                              </td>
                            </tr>
                          ) : (
                            classStudents.map(student => {
                              return (
                                <tr key={student.id} className="hover:bg-gray-50/20 transition duration-150">
                                  {/* Student Name */}
                                  <td className="p-4 pl-6 font-bold text-gray-800 sticky left-0 bg-white border-r border-gray-100/80 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)] max-w-[208px] truncate">
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded bg-emerald-500 text-white font-black text-[10px] flex items-center justify-center shrink-0">
                                        {student.name.charAt(0)}
                                      </div>
                                      <div className="truncate">
                                        <p className="text-xs font-black truncate uppercase leading-tight text-gray-850" title={student.name}>{student.name}</p>
                                        <p className="text-[8px] text-gray-400 font-mono">ID: {student.id}</p>
                                      </div>
                                    </div>
                                  </td>

                                  {/* Daily cells */}
                                  {Array.from({ length: daysInMonth }).map((_, idx) => {
                                    const day = idx + 1;
                                    const dayStr = String(day).padStart(2, '0');
                                    const monthStr = String(recapMonth).padStart(2, '0');
                                    const dateStr = `${recapYear}-${monthStr}-${dayStr}`;
                                    
                                    const dailyRecords = studentDailyObsMap[student.id]?.[dateStr] || [];
                                    const hasRecords = dailyRecords.length > 0;
                                    const weekend = isWeekendDay(day);

                                    return (
                                      <td 
                                        key={day}
                                        className={cn(
                                          "p-1 border-r border-gray-100/40 text-center text-[10px]",
                                          weekend ? "bg-red-50/10" : ""
                                        )}
                                      >
                                        <div className="flex flex-col items-center justify-center gap-1 min-h-[36px]">
                                          {hasRecords ? (
                                            dailyRecords.map((rec, rIdx) => {
                                              const grade = rec.grading;
                                              const colorCls = grade === 'BB' ? 'bg-rose-50 text-rose-700 border-rose-100'
                                                : grade === 'MB' ? 'bg-amber-50 text-amber-700 border-amber-100'
                                                : grade === 'BSH' ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                : grade === 'BSB' ? 'bg-teal-50 text-teal-700 border-teal-100'
                                                : 'bg-gray-50 text-gray-400 border-gray-100';
                                              
                                              const domainLabel = domains.find(d => d.id === rec.domain)?.label || rec.domain;
                                              const activityLabel = activities.find(a => a.id === rec.activity)?.label || rec.activity;

                                              return (
                                                <span 
                                                  key={rIdx} 
                                                  className={cn(
                                                    "px-1.5 py-0.5 rounded-[4px] text-[8px] font-black uppercase tracking-tight border cursor-help select-none shrink-0 leading-normal",
                                                    colorCls
                                                  )}
                                                  title={`${domainLabel}\n(${activityLabel})`}
                                                >
                                                  {grade}
                                                </span>
                                              );
                                            })
                                          ) : (
                                            <span className="text-gray-150 inline-block font-black select-none text-[8px]">—</span>
                                          )}
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

        </div>
      )}

      {/* Popups & Lightboxes */}
      <AnimatePresence>
        {selectedDetailCell && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl flex flex-col border border-gray-100"
            >
              {/* Header */}
              <div className="p-6 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between border-0">
                <div>
                  <span className="text-[9px] font-black tracking-widest uppercase text-emerald-100">Lumina Kindergarten Recap</span>
                  <h3 className="text-lg font-black tracking-tight uppercase leading-tight mt-0.5">
                    {selectedDetailCell.student.name}
                  </h3>
                  <p className="text-xs text-emerald-100 font-bold mt-1">
                    Domain: {selectedDetailCell.domain.label}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedDetailCell(null)}
                  className="p-1.5 hover:bg-white/10 rounded-xl transition cursor-pointer text-white border-0 bg-transparent"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-gray-50/50">
                <div className="flex items-center justify-between text-xs text-gray-500 font-medium pb-2 border-b border-gray-100">
                  <span>Bulan {months.find(m => m.value === recapMonth)?.label} {recapYear}</span>
                  <span className="font-bold text-gray-700">Ditemukan {selectedDetailCell.entries.length} Catatan Sesi</span>
                </div>

                <div className="space-y-4">
                  {selectedDetailCell.entries.map((entry, idx) => {
                    const actConfig = activities.find(a => a.id === entry.activity);
                    const grConfig = grades.find(g => g.id === entry.grading);
                    
                    const gradeColor = entry.grading === 'BB' ? 'bg-rose-50 text-rose-700 border-rose-100'
                      : entry.grading === 'MB' ? 'bg-amber-50 text-amber-700 border-amber-100'
                      : entry.grading === 'BSH' ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      : entry.grading === 'BSB' ? 'bg-teal-50 text-teal-700 border-teal-100'
                      : 'bg-gray-50 text-gray-400 border-gray-100';
                    
                    return (
                      <div key={idx} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col md:flex-row gap-5 items-start">
                        {/* Photo */}
                        <div className="w-full md:w-32 aspect-video md:aspect-square bg-gray-100 rounded-xl overflow-hidden shrink-0 border border-gray-100 flex items-center justify-center">
                          {entry.photo ? (
                            <img src={entry.photo} alt={entry.date} className="w-full h-full object-cover" />
                          ) : (
                            <div className="text-center p-2 flex flex-col items-center justify-center gap-1">
                              <ImageIcon size={20} className="text-gray-305" />
                              <span className="text-[8px] text-gray-400 leading-tight">Tidak ada foto</span>
                            </div>
                          )}
                        </div>

                        {/* Text details */}
                        <div className="flex-1 space-y-3 min-w-0">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-50 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-gray-800 uppercase">{actConfig?.label || entry.activity}</span>
                            </div>
                            
                            <span className="text-[10px] font-bold text-gray-400 font-mono">
                              {entry.date}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Capaian:</span>
                            <span className={cn("px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border tracking-tight", gradeColor)}>
                              {grConfig?.label || entry.grading}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Catatan Guru:</span>
                            <p className="text-xs font-semibold text-gray-705 bg-gray-50/70 rounded-xl p-3 border border-gray-100 leading-relaxed font-sans italic pr-2">
                              {entry.notes || '— Tidak ada catatan khusus —'}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-gray-100 bg-white flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedDetailCell(null)}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-black rounded-xl text-[10px] uppercase tracking-wider cursor-pointer border-0"
                >
                  Tutup Rincian
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {selectedDetailSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] max-w-3xl w-full max-h-[85vh] overflow-hidden shadow-2xl flex flex-col border border-gray-100"
            >
              {/* Header */}
              <div className="p-6 bg-gradient-to-r from-teal-700 to-indigo-800 text-white flex items-center justify-between border-0">
                <div>
                  <span className="text-[9px] font-black tracking-widest uppercase text-indigo-100">Lumina Sesi Evaluasi Detail</span>
                  <h3 className="text-lg font-black tracking-tight uppercase leading-tight mt-0.5">
                    Sesi: {activities.find(a => a.id === selectedDetailSession.activity)?.label || selectedDetailSession.activity}
                  </h3>
                  <p className="text-xs text-indigo-100 font-bold mt-1">
                    Domain: {domains.find(d => d.id === selectedDetailSession.domain)?.label || selectedDetailSession.domain} | Tanggal: {selectedDetailSession.date}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedDetailSession(null)}
                  className="p-1.5 hover:bg-white/10 rounded-xl transition cursor-pointer text-white border-0 bg-transparent"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-gray-50/50">
                {/* General session photo if available */}
                {selectedDetailSession.generalPhoto && (
                  <div className="space-y-2">
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Foto Kegiatan Utama (General)</span>
                    <div className="aspect-video w-full max-h-[160px] rounded-2xl overflow-hidden bg-gray-100 border border-gray-200">
                      <img src={selectedDetailSession.generalPhoto} alt="General session photo" className="w-full h-full object-cover" />
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Daftar Penilaian Siswa</span>
                  
                  {(() => {
                    const activeClassObj = classes.find(c => c.id === selectedClassId);
                    const classStudents = students.filter(student => {
                      if (!selectedClassId || !activeClassObj) return false;
                      return isStudentInClass(student.classId, activeClassObj);
                    });

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {classStudents.map(student => {
                          const obs = getStudentObs(selectedDetailSession.observations, student);
                          const studentPhoto = obs.photo || selectedDetailSession.generalPhoto;
                          const grConfig = grades.find(g => g.id === obs.grading);
                          
                          const gradeColor = obs.grading === 'BB' ? 'bg-rose-50 text-rose-700 border-rose-100'
                            : obs.grading === 'MB' ? 'bg-amber-50 text-amber-700 border-amber-100'
                            : obs.grading === 'BSH' ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                            : obs.grading === 'BSB' ? 'bg-teal-50 text-teal-700 border-teal-100'
                            : 'bg-gray-50 text-gray-400 border-gray-100';
                          
                          return (
                            <div key={student.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex gap-4">
                              <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-50 border border-gray-100 shrink-0 flex items-center justify-center">
                                {studentPhoto ? (
                                  <img src={studentPhoto} alt={student.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="text-center p-1 font-black text-xs text-gray-300">
                                    {student.name.charAt(0)}
                                  </div>
                                )}
                              </div>

                              <div className="flex-1 min-w-0 space-y-1.5">
                                <div className="flex items-center justify-between gap-2 min-w-0">
                                  <h4 className="text-xs font-black text-gray-800 uppercase truncate pr-1">{student.name}</h4>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className={cn("px-2 py-0.5 text-[8px] font-black uppercase rounded-lg border leading-none", gradeColor)}>
                                      {grConfig?.id || '—'}
                                    </span>
                                    {obs.grading && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteIndividualObservation(student.id, student.name);
                                        }}
                                        title="Hapus penilaian anak ini"
                                        className="text-red-500 hover:text-red-700 hover:scale-110 transition cursor-pointer p-0.5 border-0 bg-transparent flex items-center justify-center rounded"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <p className="text-[10px] text-gray-500 font-semibold italic line-clamp-2">
                                  {obs.notes || '— Tidak ada catatan khusus —'}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-gray-100 bg-white flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleDeleteEntireSession}
                  className="px-4 py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-extrabold rounded-xl text-[10px] uppercase tracking-wider cursor-pointer flex items-center gap-1.5 transition active:scale-95"
                >
                  <Trash2 size={12} />
                  Hapus Sesi Hari Ini
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDetailSession(null)}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-black rounded-xl text-[10px] uppercase tracking-wider cursor-pointer border-0"
                >
                  Tutup Rincian
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
