import * as React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, getDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { 
  ClipboardCheck, Printer, Save, FileText, ChevronLeft, RefreshCw, 
  TrendingUp, Layers, Award, CheckCircle2, User, BookOpen, Signature, Sparkles,
  AlertCircle, Plus, Edit3, X, Calendar, ChevronDown, ChevronUp, Link2, Trash2, ExternalLink, Eye, Paperclip
} from 'lucide-react';
import { normalizeStudentName } from '../../lib/namecentricResolver';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { 
  getKindergartenClasses 
} from '../../lib/kindergartenMetadataCache';
import { getKindergartenActiveRoster } from '../../services/kindergartenRosterService';
import { 
  AAP_ASPECTS, 
  getStageFromPercentage, 
  STAGE_LABELS,
  AAPAspectName
} from '../../config/aapRubric';
import { 
  AAP_RECOMMENDATIONS, 
  AAP_DEVELOPMENT_ANALYSIS 
} from '../../config/aapRecommendations';
import { html2canvasWithModernColors } from '../../lib/html2canvasPatch';
import { jsPDF } from 'jspdf';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList 
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { useTeacherAssignedClasses } from '../../hooks/useTeacherAssignedClasses';

const KM_ASPECTS = [
  {
    id: 'nilai_agama_budi_pekerti',
    name: 'Nilai Agama dan Budi Pekerti',
    aapAspects: ['Sosial & Kemandirian'],
    description: 'Mengenal tuhan, ibadah harian, budi pekerti mulia'
  },
  {
    id: 'jati_diri',
    name: 'Jati Diri',
    aapAspects: ['Motorik Kasar', 'Motorik Halus', 'Sosial & Kemandirian'],
    description: 'Identitas diri, emosi, motorik kasar & halus'
  },
  {
    id: 'literasi_sains',
    name: 'Dasar-dasar Literasi, Matematika, Sains, Teknologi, Rekayasa, dan Seni',
    aapAspects: ['Bahasa', 'Kognitif'],
    description: 'Kemampuan bahasa, berpikir logis, matematika, sains, seni'
  }
];

const getDraftForAspect = (aspectId: string, assessment: any) => {
  if (!assessment || !assessment.aspects) return { summary: '', recommendation: '' };

  const getAspectData = (name: string) => assessment.aspects.find((a: any) => a.aspectName === name) || {};

  if (aspectId === 'nilai_agama_budi_pekerti') {
    const s = getAspectData('Sosial & Kemandirian');
    const sDesc = s.analysis || AAP_DEVELOPMENT_ANALYSIS['Sosial & Kemandirian']?.[s.stage as any] || 'Siswa menunjukkan kemampuan sosial dan emosional yang memadai.';
    const sRec = s.stimulationRecommendation || AAP_RECOMMENDATIONS['Sosial & Kemandirian']?.[s.stage as any] || 'Sediakan kegiatan teratur untuk memupuk kemandirian dan sopan santun.';
    return {
      summary: `Sosial & Kemandirian (${s.stage || 'Belum Dinilai'}): ${sDesc}`,
      recommendation: sRec
    };
  } else if (aspectId === 'jati_diri') {
    const mk = getAspectData('Motorik Kasar');
    const mh = getAspectData('Motorik Halus');
    const s = getAspectData('Sosial & Kemandirian');

    const mkDesc = mk.analysis || AAP_DEVELOPMENT_ANALYSIS['Motorik Kasar']?.[mk.stage as any] || 'Siswa menunjukkan perkembangan fisik kasar sesuai tahapan.';
    const mhDesc = mh.analysis || AAP_DEVELOPMENT_ANALYSIS['Motorik Halus']?.[mh.stage as any] || 'Siswa menunjukkan perkembangan fisik halus sesuai tahapan.';
    const sDesc = s.analysis || AAP_DEVELOPMENT_ANALYSIS['Sosial & Kemandirian']?.[s.stage as any] || 'Siswa menunjukkan perkembangan sosial emosional sesuai tahapan.';

    const mkRec = mk.stimulationRecommendation || AAP_RECOMMENDATIONS['Motorik Kasar']?.[mk.stage as any] || 'Sediakan latihan fisik motorik terstruktur.';
    const mhRec = mh.stimulationRecommendation || AAP_RECOMMENDATIONS['Motorik Halus']?.[mh.stage as any] || 'Latih koordinasi mata-tangan secara teratur.';
    const sRec = s.stimulationRecommendation || AAP_RECOMMENDATIONS['Sosial & Kemandirian']?.[s.stage as any] || 'Sediakan bimbingan kemandirian seimbang.';

    return {
      summary: `• Motorik Kasar (${mk.stage || '-'}): ${mkDesc}\n• Motorik Halus (${mh.stage || '-'}): ${mhDesc}\n• Sosial & Kemandirian (${s.stage || '-'}): ${sDesc}`,
      recommendation: `• Motorik Kasar: ${mkRec}\n• Motorik Halus: ${mhRec}\n• Sosial & Kemandirian: ${sRec}`
    };
  } else if (aspectId === 'literasi_sains') {
    const b = getAspectData('Bahasa');
    const k = getAspectData('Kognitif');

    const bDesc = b.analysis || AAP_DEVELOPMENT_ANALYSIS['Bahasa']?.[b.stage as any] || 'Siswa menunjukkan kemampuan berbahasa memadai.';
    const kDesc = k.analysis || AAP_DEVELOPMENT_ANALYSIS['Kognitif']?.[k.stage as any] || 'Siswa menunjukkan kemampuan kognitif memadai.';

    const bRec = b.stimulationRecommendation || AAP_RECOMMENDATIONS['Bahasa']?.[b.stage as any] || 'Stimulasi dengan membaca buku cerita bergambar.';
    const kRec = k.stimulationRecommendation || AAP_RECOMMENDATIONS['Kognitif']?.[k.stage as any] || 'Latih klasifikasi benda multi-atribut.';

    return {
      summary: `• Bahasa (${b.stage || '-'}): ${bDesc}\n• Kognitif (${k.stage || '-'}): ${kDesc}`,
      recommendation: `• Bahasa: ${bRec}\n• Kognitif: ${kRec}`
    };
  }

  return { summary: '', recommendation: '' };
};

export default function AAPReport() {
  const { activeYear } = useAcademicYear();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();

  // Navigation state / Active tabs
  const [activeTab, setActiveTab] = React.useState<'individual' | 'followup' | 'class'>('individual');

  // Metadata states
  const [students, setStudents] = React.useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>('');
  const [assessments, setAssessments] = React.useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSavingConclusion, setIsSavingConclusion] = React.useState(false);

  const {
    assignedClasses: classes,
    assignedClassIds,
    primaryClassId,
    isRestrictedToAssignedClasses,
    loading: isLoadingClasses,
    setLastSelectedClassId
  } = useTeacherAssignedClasses({
    userId: profile?.uid,
    academicYearId: activeYear || '2026/2027'
  });

  // General Conclusion Custom Edit State
  const [generalConclusion, setGeneralConclusion] = React.useState<string>('');

  // Follow-up Action Plan states
  const [followupPlans, setFollowupPlans] = React.useState<Record<string, any>>({});
  const [isLoadingPlans, setIsLoadingPlans] = React.useState(false);
  const [isSavingPlan, setIsSavingPlan] = React.useState<Record<string, boolean>>({});
  const [editingAspectId, setEditingAspectId] = React.useState<string | null>(null);

  // Phase 2: Evidence of Implementation (Bukti Pelaksanaan) states
  const [connectedEvidences, setConnectedEvidences] = React.useState<any[]>([]);
  const [isLoadingConnectedEvidences, setIsLoadingConnectedEvidences] = React.useState(false);
  const [expandedEvidenceAspects, setExpandedEvidenceAspects] = React.useState<Record<string, boolean>>({});
  
  // Modal state for linking evidence
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = React.useState(false);
  const [activeModalAspectId, setActiveModalAspectId] = React.useState<string | null>(null);
  const [availableEvidence, setAvailableEvidence] = React.useState<any[]>([]);
  const [isFetchingEvidence, setIsFetchingEvidence] = React.useState(false);
  const [isSavingEvidence, setIsSavingEvidence] = React.useState(false);
  
  // Modal filters
  const [modalStartDate, setModalStartDate] = React.useState('');
  const [modalEndDate, setModalEndDate] = React.useState('');
  const [modalSourceFilter, setModalSourceFilter] = React.useState<'ALL' | 'OBSERVATION' | 'CHECKLIST' | 'WEEKLY_SUMMARY' | 'WEEKLY_REPORT'>('ALL');
  const [modalDomainFilter, setModalDomainFilter] = React.useState('ALL');
  const [modalSearchQuery, setModalSearchQuery] = React.useState('');
  const [selectedSourcesMap, setSelectedSourcesMap] = React.useState<Record<string, boolean>>({});

  // Inline notes editing states
  const [relevanceNotesEdit, setRelevanceNotesEdit] = React.useState<Record<string, string>>({});

  // Status suggest state
  const [suggestStatusChangeAspectId, setSuggestStatusChangeAspectId] = React.useState<string | null>(null);

  // Detail view state
  const [isDetailViewOpen, setIsDetailViewOpen] = React.useState(false);
  const [detailViewEvidence, setDetailViewEvidence] = React.useState<any | null>(null);

  // Temporary edit states for Follow-up Plan form
  const [editSummary, setEditSummary] = React.useState('');
  const [editRecommendation, setEditRecommendation] = React.useState('');
  const [editTargetDevelopment, setEditTargetDevelopment] = React.useState('');
  const [editStimulationStrategy, setEditStimulationStrategy] = React.useState('');
  const [editFrequency, setEditFrequency] = React.useState('');
  const [editStartDate, setEditStartDate] = React.useState('');
  const [editEndDate, setEditEndDate] = React.useState('');
  const [editStatus, setEditStatus] = React.useState<'Belum Dimulai' | 'Berjalan' | 'Selesai' | 'Disesuaikan'>('Belum Dimulai');
  const [editTeacherNotes, setEditTeacherNotes] = React.useState('');

  // Effect to load follow-up plans when student changes
  React.useEffect(() => {
    if (!selectedStudentId || !activeYear) {
      setFollowupPlans({});
      return;
    }

    async function loadFollowupPlans() {
      try {
        setIsLoadingPlans(true);
        const docRef = doc(db, 'aap_followup_plans', `${selectedStudentId}_${activeYear.replace('/', '_')}`);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setFollowupPlans(docSnap.data().plans || {});
        } else {
          setFollowupPlans({});
        }
      } catch (err) {
        console.error("Error loading follow-up plans:", err);
      } finally {
        setIsLoadingPlans(false);
      }
    }

    loadFollowupPlans();
  }, [selectedStudentId, activeYear]);

  // Read URL parameters if redirecting from Assessment Page
  const urlClassId = searchParams.get('classId');
  const urlStudentId = searchParams.get('studentId');

  React.useEffect(() => {
    if (!isLoadingClasses && classes.length > 0) {
      const validUrlClassId = urlClassId && assignedClassIds.includes(urlClassId) ? urlClassId : null;
      const defaultClassId = validUrlClassId || primaryClassId;
      if (defaultClassId) {
        setSelectedClassId(defaultClassId);
      }
      if (urlStudentId) {
        setSelectedStudentId(urlStudentId);
      }
    }
  }, [classes, assignedClassIds, primaryClassId, urlClassId, urlStudentId, isLoadingClasses]);

  // Real-time access check
  React.useEffect(() => {
    if (!isLoadingClasses && isRestrictedToAssignedClasses && selectedClassId) {
      if (assignedClassIds.length > 0 && !assignedClassIds.includes(selectedClassId)) {
        toast.error('Anda tidak memiliki hak akses untuk kelas ini. Mengembalikan ke kelas penugasan Anda.');
        setSelectedClassId(primaryClassId || '');
      }
    }
  }, [selectedClassId, isRestrictedToAssignedClasses, assignedClassIds, primaryClassId, isLoadingClasses]);

  // Load students and assessments for the selected class
  React.useEffect(() => {
    if (!selectedClassId) return;

    async function loadStudentsAndAssessments() {
      try {
        setIsLoading(true);
        const filteredStudents = await getKindergartenActiveRoster({
          classId: selectedClassId,
          academicYearId: activeYear || '2026/2027'
        });
        setStudents(filteredStudents);

        // Select first student if none selected or if selected student is not in the new class
        const hasSelectedStudentInClass = filteredStudents.some(s => s.id === selectedStudentId);
        if (filteredStudents.length > 0 && (!selectedStudentId || !hasSelectedStudentInClass)) {
          setSelectedStudentId(filteredStudents[0].id);
        }

        // Fetch assessments
        const q = query(
          collection(db, 'aap_assessments'),
          where('classId', '==', selectedClassId),
          where('academicYear', '==', activeYear)
        );
        const querySnapshot = await getDocs(q);
        const loadedAssessments: Record<string, any> = {};
        querySnapshot.forEach(docSnap => {
          const data = docSnap.data();
          loadedAssessments[data.studentId] = data;
        });
        setAssessments(loadedAssessments);
      } catch (err) {
        console.error("Error loading class students or assessments:", err);
        toast.error("Gagal memuat data penilaian.");
      } finally {
        setIsLoading(false);
      }
    }

    loadStudentsAndAssessments();
  }, [selectedClassId, activeYear]);

  // Sync general conclusion state with loaded assessment
  const currentAssessment = assessments[selectedStudentId];
  React.useEffect(() => {
    if (currentAssessment) {
      if (currentAssessment.generalConclusion) {
        setGeneralConclusion(currentAssessment.generalConclusion);
      } else {
        // Auto generate default template
        const studentName = currentAssessment.studentName || 'Siswa';
        
        // Find high/low aspects
        const aspects = currentAssessment.aspects || [];
        if (aspects.length > 0) {
          const sorted = [...aspects].sort((a, b) => b.percentage - a.percentage);
          const bestAspect = sorted[0];
          const weakAspect = sorted[sorted.length - 1];
          
          const text = `${studentName} telah mengikuti Asesmen Awal Pembelajaran (AAP) tahun ajaran ${activeYear}. Secara keseluruhan, ${studentName} menunjukkan perkembangan terbaik pada aspek [${bestAspect.aspectName}] dengan capaian [${bestAspect.stage}]. Area yang memerlukan perhatian dan stimulasi berkelanjutan adalah aspek [${weakAspect.aspectName}] dengan capaian saat ini [${weakAspect.stage}]. Direkomendasikan stimulasi kolaboratif antara sekolah dan orang tua di rumah sesuai dengan butir-butir tindak lanjut terlampir.`;
          setGeneralConclusion(text);
        } else {
          setGeneralConclusion('');
        }
      }
    } else {
      setGeneralConclusion('');
    }
  }, [selectedStudentId, currentAssessment, activeYear]);

  // Handle saving the general conclusion
  const handleSaveConclusion = async () => {
    if (!selectedStudentId || !currentAssessment) return;
    setIsSavingConclusion(true);

    try {
      const docRef = doc(db, 'aap_assessments', `${selectedStudentId}_${activeYear.replace('/', '_')}`);
      const updatedDoc = {
        ...currentAssessment,
        generalConclusion,
        updatedAt: new Date().toISOString()
      };

      await setDoc(docRef, updatedDoc);
      
      // Update local assessments map
      setAssessments(prev => ({
        ...prev,
        [selectedStudentId]: updatedDoc
      }));

      toast.success("Kesimpulan umum berhasil disimpan!");
    } catch (err) {
      console.error("Error saving general conclusion:", err);
      toast.error("Gagal menyimpan kesimpulan.");
    } finally {
      setIsSavingConclusion(false);
    }
  };

  // Generate automated general conclusion template on request
  const handleGenerateTemplate = () => {
    if (!currentAssessment) return;
    const studentName = currentAssessment.studentName || 'Siswa';
    const aspects = currentAssessment.aspects || [];
    if (aspects.length === 0) return;

    const sorted = [...aspects].sort((a, b) => b.percentage - a.percentage);
    const bestAspect = sorted[0];
    const weakAspect = sorted[sorted.length - 1];

    const text = `${studentName} telah mengikuti Asesmen Awal Pembelajaran (AAP) tahun ajaran ${activeYear}. Secara keseluruhan, ${studentName} menunjukkan perkembangan terbaik pada aspek [${bestAspect.aspectName}] dengan capaian [${bestAspect.stage}]. Area yang memerlukan perhatian dan stimulasi berkelanjutan adalah aspek [${weakAspect.aspectName}] dengan capaian saat ini [${weakAspect.stage}]. Direkomendasikan stimulasi kolaboratif antara sekolah dan orang tua di rumah sesuai dengan butir-butir tindak lanjut terlampir.`;
    setGeneralConclusion(text);
    toast.info("Template kesimpulan berhasil di-generate!");
  };

  // Export PDF functionality using the precise patterns
  const handleExportPDF = async () => {
    const studentName = students.find(s => s.id === selectedStudentId)?.name || 'Siswa';
    const className = classes.find(c => c.id === selectedClassId)?.name || 'Kelas';

    const element = document.getElementById("printable-aap-report");
    if (!element) {
      toast.error("Elemen laporan tidak ditemukan.");
      return;
    }

    toast.loading("Membuat file PDF...", { id: "export-pdf-aap" });
    try {
      const canvas = await html2canvasWithModernColors(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Laporan_AAP_${studentName.replace(/\s+/g, '_')}_${className.replace(/\s+/g, '_')}_${activeYear.replace('/', '_')}.pdf`);
      toast.success("Laporan PDF berhasil diunduh!", { id: "export-pdf-aap" });
    } catch (err) {
      console.error("PDF generation error:", err);
      toast.error("Gagal mengekspor PDF.", { id: "export-pdf-aap" });
    }
  };

  // Formulate data for the Recharts Bar Chart
  const chartData = React.useMemo(() => {
    if (!currentAssessment || !currentAssessment.aspects) return [];
    return currentAssessment.aspects.map((asp: any) => ({
      name: asp.aspectName,
      persentase: asp.percentage,
      skor: asp.rawScore,
      max: asp.maxScore
    }));
  }, [currentAssessment]);

  // Selected details
  const activeClassObj = classes.find(c => c.id === selectedClassId);
  const activeStudentObj = students.find(s => s.id === selectedStudentId);

  // ==========================================
  // PHASE 2: BUKTI PELAKSANAAN IMPLEMENTATION
  // ==========================================

  const loadConnectedEvidences = React.useCallback(async () => {
    if (!selectedStudentId || !activeYear) {
      setConnectedEvidences([]);
      return;
    }
    setIsLoadingConnectedEvidences(true);
    try {
      const q = query(
        collection(db, 'aap_followup_plan_evidence'),
        where('studentId', '==', selectedStudentId),
        where('academicYearId', '==', activeYear)
      );
      const snap = await getDocs(q);
      const items: any[] = [];
      snap.forEach(docSnap => {
        items.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });
      items.sort((a, b) => (b.evidenceDate || '').localeCompare(a.evidenceDate || ''));
      setConnectedEvidences(items);
    } catch (err) {
      console.error("Error loading connected evidences:", err);
    } finally {
      setIsLoadingConnectedEvidences(false);
    }
  }, [selectedStudentId, activeYear]);

  React.useEffect(() => {
    loadConnectedEvidences();
  }, [selectedStudentId, activeYear, loadConnectedEvidences]);

  const toggleEvidenceExpanded = (aspectId: string) => {
    setExpandedEvidenceAspects(prev => ({
      ...prev,
      [aspectId]: !prev[aspectId]
    }));
  };

  const handleOpenDetailView = (evidence: any) => {
    setDetailViewEvidence(evidence);
    setIsDetailViewOpen(true);
  };

  const handleUnlinkEvidence = async (evidenceId: string) => {
    const confirmUnlink = window.confirm("Apakah Anda yakin ingin menghapus hubungan bukti ini? (Dokumen asli tidak akan dihapus)");
    if (!confirmUnlink) return;

    try {
      await deleteDoc(doc(db, 'aap_followup_plan_evidence', evidenceId));
      toast.success("Hubungan bukti berhasil dihapus.");
      await loadConnectedEvidences();
    } catch (err: any) {
      console.error("Error unlinking evidence:", err);
      toast.error(`Gagal menghapus hubungan bukti: ${err.message}`);
    }
  };

  const handleSaveRelevanceNote = async (evidenceId: string, noteText: string) => {
    try {
      const docRef = doc(db, 'aap_followup_plan_evidence', evidenceId);
      await setDoc(docRef, { teacherRelevanceNote: noteText }, { merge: true });
      toast.success("Catatan keterkaitan berhasil disimpan! ✨");
      setConnectedEvidences(prev => prev.map(item => {
        if (item.id === evidenceId) {
          return { ...item, teacherRelevanceNote: noteText };
        }
        return item;
      }));
    } catch (err: any) {
      console.error("Error saving relevance note:", err);
      toast.error(`Gagal menyimpan catatan: ${err.message}`);
    }
  };

  const handleUpdatePlanStatus = async (aspectId: string, newStatus: string) => {
    if (!selectedStudentId || !activeYear) return;
    try {
      const docRef = doc(db, 'aap_followup_plans', `${selectedStudentId}_${activeYear.replace('/', '_')}`);
      const currentPlan = followupPlans[aspectId];
      if (!currentPlan) return;

      const updatedPlans = {
        ...followupPlans,
        [aspectId]: {
          ...currentPlan,
          status: newStatus,
          updatedAt: new Date().toISOString()
        }
      };

      await setDoc(docRef, { plans: updatedPlans }, { merge: true });
      setFollowupPlans(updatedPlans);
      setSuggestStatusChangeAspectId(null);
      toast.success(`Status rencana berhasil diperbarui menjadi "${newStatus}"!`);
    } catch (err: any) {
      console.error("Error updating plan status:", err);
      toast.error(`Gagal memperbarui status: ${err.message}`);
    }
  };

  const fetchAvailableEvidenceSources = async () => {
    if (!selectedStudentId || !selectedClassId) return;
    setIsFetchingEvidence(true);
    try {
      const promises: Promise<any>[] = [];

      // 1. Observations
      const obsQuery = query(
        collection(db, 'observations'),
        where('classId', '==', selectedClassId)
      );
      promises.push(getDocs(obsQuery).then(snap => {
        const items: any[] = [];
        snap.forEach(docSnap => {
          const d = docSnap.data();
          const studentObs = d.observations?.[selectedStudentId] ||
            (activeStudentObj?.oldLuminaId && d.observations?.[activeStudentObj.oldLuminaId]) ||
            (activeStudentObj?.nis && d.observations?.[activeStudentObj.nis]) ||
            (activeStudentObj?.name && Object.entries(d.observations || {}).find(([k]) => normalizeStudentName(k) === normalizeStudentName(activeStudentObj.name))?.[1]);

          if (studentObs && (studentObs.notes || studentObs.photoUrl || studentObs.photo)) {
            items.push({
              id: `OBSERVATION_${docSnap.id}`,
              sourceType: 'OBSERVATION',
              sourceDocumentId: docSnap.id,
              evidenceDate: d.date || '',
              sourceLabel: 'Observation Data',
              title: `Sesi Observasi: ${d.activity ? d.activity.replace(/_/g, ' ') : 'Umum'}`,
              summary: studentObs.notes || '',
              domain: d.domain || 'Lainnya',
              thumbnailUrl: studentObs.photoUrl || studentObs.photo || d.generalPhotoUrl || d.generalPhoto || null
            });
          }
        });
        return items;
      }).catch(err => {
        console.warn("Failed fetching observations for evidence modal", err);
        return [];
      }));

      // 2. Attendance/Emotional Checklist
      const attQuery = query(
        collection(db, 'attendance'),
        where('classId', '==', selectedClassId)
      );
      promises.push(getDocs(attQuery).then(snap => {
        const items: any[] = [];
        snap.forEach(docSnap => {
          const d = docSnap.data();
          const studentRecord = d.students?.find((s: any) => s.studentId === selectedStudentId);
          if (studentRecord && (studentRecord.emotion || studentRecord.notes)) {
            let summaryStr = `Kehadiran: ${studentRecord.attendance || 'Hadir'}`;
            if (studentRecord.emotion) {
              summaryStr += ` | Emosi: ${studentRecord.emotion}`;
            }
            if (studentRecord.notes) {
              summaryStr += ` | Catatan: ${studentRecord.notes}`;
            }

            items.push({
              id: `CHECKLIST_${docSnap.id}`,
              sourceType: 'CHECKLIST',
              sourceDocumentId: docSnap.id,
              evidenceDate: d.date || '',
              sourceLabel: 'Emotional Checklist',
              title: `Kehadiran & Emosi Harian`,
              summary: summaryStr,
              domain: 'Sosial Emosional',
              thumbnailUrl: null
            });
          }
        });
        return items;
      }).catch(err => {
        console.warn("Failed fetching attendance checklist for evidence modal", err);
        return [];
      }));

      // 3. Weekly Summary drafts
      const draftsQuery = query(
        collection(db, 'weekly_summary_drafts'),
        where('studentId', '==', selectedStudentId)
      );
      promises.push(getDocs(draftsQuery).then(snap => {
        const items: any[] = [];
        snap.forEach(docSnap => {
          const d = docSnap.data();
          if (d.socialEmotional || d.weeklyComments || d.notes) {
            let summaryParts = [];
            if (d.weeklyComments) summaryParts.push(`Observasi: ${d.weeklyComments}`);
            if (d.socialEmotional) summaryParts.push(`Sosial Emosional: ${d.socialEmotional}`);
            if (d.notes) summaryParts.push(`Catatan: ${d.notes}`);

            items.push({
              id: `WEEKLY_SUMMARY_${docSnap.id}`,
              sourceType: 'WEEKLY_SUMMARY',
              sourceDocumentId: docSnap.id,
              evidenceDate: d.startDate || d.date || '',
              sourceLabel: 'Weekly Summary',
              title: `Draft Laporan Mingguan (Tema: ${d.theme || 'Umum'}, W${d.week || ''})`,
              summary: summaryParts.join('\n'),
              domain: 'Multi-Aspek',
              thumbnailUrl: null
            });
          }
        });
        return items;
      }).catch(err => {
        console.warn("Failed fetching weekly summary drafts for evidence modal", err);
        return [];
      }));

      // 4. Weekly Report / Published KG Reports
      const publishedQuery = query(
        collection(db, 'published_kg_reports'),
        where('studentId', '==', selectedStudentId)
      );
      promises.push(getDocs(publishedQuery).then(snap => {
        const items: any[] = [];
        snap.forEach(docSnap => {
          const d = docSnap.data();
          if (d.weeklyComments || d.socialEmotional) {
            let summaryParts = [];
            if (d.weeklyComments) summaryParts.push(`Komentar: ${d.weeklyComments}`);
            if (d.socialEmotional) summaryParts.push(`Sosial Emosional: ${d.socialEmotional}`);

            items.push({
              id: `WEEKLY_REPORT_${docSnap.id}`,
              sourceType: 'WEEKLY_REPORT',
              sourceDocumentId: docSnap.id,
              evidenceDate: d.startDate || '',
              sourceLabel: 'Weekly Report',
              title: `Laporan Mingguan Terbit (Tema: ${d.theme || 'Umum'}, W${d.week || ''})`,
              summary: summaryParts.join('\n'),
              domain: 'Multi-Aspek',
              thumbnailUrl: null
            });
          }
        });
        return items;
      }).catch(err => {
        console.warn("Failed fetching published weekly reports for evidence modal", err);
        return [];
      }));

      const results = await Promise.all(promises);
      const flattened = results.flat();
      
      flattened.sort((a, b) => (b.evidenceDate || '').localeCompare(a.evidenceDate || ''));
      setAvailableEvidence(flattened);
    } catch (error) {
      console.error("Error fetching all evidence sources:", error);
      toast.error("Gagal memuat daftar bukti dari database.");
    } finally {
      setIsFetchingEvidence(false);
    }
  };

  const handleSaveEvidence = async (aspectId: string, selectedSources: any[]) => {
    if (!selectedStudentId || !activeYear) return;
    const planId = `${selectedStudentId}_${activeYear.replace('/', '_')}_${aspectId}`;
    
    setIsSavingEvidence(true);
    try {
      const alreadyConnected = connectedEvidences.filter(e => e.planId === planId);
      
      let addedCount = 0;
      for (const source of selectedSources) {
        const exists = alreadyConnected.some(e => e.sourceType === source.sourceType && e.sourceDocumentId === source.sourceDocumentId);
        if (!exists) {
          const payload = {
            planId,
            studentId: selectedStudentId,
            academicYearId: activeYear,
            aspectId,
            sourceType: source.sourceType,
            sourceDocumentId: source.sourceDocumentId,
            evidenceDate: source.evidenceDate,
            teacherRelevanceNote: '',
            createdAt: new Date().toISOString(),
            createdBy: profile?.uid || 'Unknown Teacher',
            createdByEmail: profile?.email || '',
            cachedSourceLabel: source.sourceLabel,
            cachedTitle: source.title,
            cachedSummary: source.summary,
            cachedDomain: source.domain,
            cachedThumbnailUrl: source.thumbnailUrl || null
          };
          await addDoc(collection(db, 'aap_followup_plan_evidence'), payload);
          addedCount++;
        }
      }
      toast.success("Bukti berhasil dihubungkan! 🎉");
      
      const currentPlan = followupPlans[aspectId];
      if (currentPlan && currentPlan.status === 'Belum Dimulai' && alreadyConnected.length === 0 && addedCount > 0) {
        setSuggestStatusChangeAspectId(aspectId);
      }
      
      await loadConnectedEvidences();
      setIsEvidenceModalOpen(false);
    } catch (err: any) {
      console.error("Error linking evidence:", err);
      toast.error(`Gagal menghubungkan bukti: ${err.message}`);
    } finally {
      setIsSavingEvidence(false);
    }
  };

  const handleLinkSelectedEvidence = () => {
    if (!activeModalAspectId) return;
    const selectedSources = availableEvidence.filter(item => selectedSourcesMap[item.id]);
    if (selectedSources.length === 0) {
      toast.error("Pilih minimal satu bukti untuk dihubungkan.");
      return;
    }
    handleSaveEvidence(activeModalAspectId, selectedSources);
  };

  const handleOpenEvidenceModal = (aspectId: string) => {
    const plan = followupPlans[aspectId] || {};
    setModalStartDate(plan.startDate || '');
    setModalEndDate(plan.endDate || '');
    setModalSourceFilter('ALL');
    setModalDomainFilter('ALL');
    setModalSearchQuery('');
    setSelectedSourcesMap({});
    setActiveModalAspectId(aspectId);
    setIsEvidenceModalOpen(true);
    fetchAvailableEvidenceSources();
  };

  const filteredEvidence = React.useMemo(() => {
    return availableEvidence.filter(item => {
      if (modalStartDate && item.evidenceDate && item.evidenceDate < modalStartDate) {
        return false;
      }
      if (modalEndDate && item.evidenceDate && item.evidenceDate > modalEndDate) {
        return false;
      }
      if (modalSourceFilter !== 'ALL' && item.sourceType !== modalSourceFilter) {
        return false;
      }
      if (modalDomainFilter !== 'ALL') {
        const itemDomainLower = (item.domain || '').toLowerCase();
        const itemTitleLower = (item.title || '').toLowerCase();
        const filterLower = modalDomainFilter.toLowerCase();
        if (!itemDomainLower.includes(filterLower) && !itemTitleLower.includes(filterLower)) {
          return false;
        }
      }
      if (modalSearchQuery) {
        const q = modalSearchQuery.toLowerCase();
        const matchTitle = (item.title || '').toLowerCase().includes(q);
        const matchSummary = (item.summary || '').toLowerCase().includes(q);
        if (!matchTitle && !matchSummary) {
          return false;
        }
      }
      return true;
    });
  }, [availableEvidence, modalStartDate, modalEndDate, modalSourceFilter, modalDomainFilter, modalSearchQuery]);

  // Start or Edit Plan
  const handleStartPlanning = (aspectId: string) => {
    const existing = followupPlans[aspectId] || {};
    
    if (existing.hasPlan) {
      setEditSummary(existing.aapSummary || '');
      setEditRecommendation(existing.aapRecommendation || '');
      setEditTargetDevelopment(existing.targetDevelopment || '');
      setEditStimulationStrategy(existing.stimulationStrategy || '');
      setEditFrequency(existing.frequency || '');
      setEditStartDate(existing.startDate || '');
      setEditEndDate(existing.endDate || '');
      setEditStatus(existing.status || 'Belum Dimulai');
      setEditTeacherNotes(existing.teacherNotes || '');
    } else {
      const draft = getDraftForAspect(aspectId, currentAssessment);
      setEditSummary(draft.summary);
      setEditRecommendation(draft.recommendation);
      setEditTargetDevelopment('');
      setEditStimulationStrategy('');
      setEditFrequency('');
      setEditStartDate('');
      setEditEndDate('');
      setEditStatus('Belum Dimulai');
      setEditTeacherNotes('');
    }
    setEditingAspectId(aspectId);
  };

  // Save Plan
  const handleSaveFollowupPlan = async (aspectId: string) => {
    if (!selectedStudentId || !activeYear) return;

    setIsSavingPlan(prev => ({ ...prev, [aspectId]: true }));
    try {
      const updatedPlans = {
        ...followupPlans,
        [aspectId]: {
          aspectId,
          aspectName: KM_ASPECTS.find(a => a.id === aspectId)?.name || aspectId,
          hasPlan: true,
          aapSummary: editSummary,
          aapRecommendation: editRecommendation,
          targetDevelopment: editTargetDevelopment,
          stimulationStrategy: editStimulationStrategy,
          frequency: editFrequency,
          startDate: editStartDate,
          endDate: editEndDate,
          status: editStatus,
          teacherNotes: editTeacherNotes,
          updatedAt: new Date().toISOString()
        }
      };

      const docRef = doc(db, 'aap_followup_plans', `${selectedStudentId}_${activeYear.replace('/', '_')}`);
      await setDoc(docRef, {
        studentId: selectedStudentId,
        studentName: activeStudentObj?.name || 'Siswa',
        academicYear: activeYear,
        classId: selectedClassId,
        className: activeClassObj?.name || 'Kelas',
        plans: updatedPlans,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setFollowupPlans(updatedPlans);
      setEditingAspectId(null);
      toast.success("Rencana tindak lanjut berhasil disimpan!");
    } catch (err) {
      console.error("Error saving follow-up plan:", err);
      toast.error("Gagal menyimpan rencana tindak lanjut.");
    } finally {
      setIsSavingPlan(prev => ({ ...prev, [aspectId]: false }));
    }
  };

  if (isRestrictedToAssignedClasses && classes.length === 0 && !isLoadingClasses) {
    return (
      <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-8 pb-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/kindy/aap-assessment')}
            className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white border border-gray-100 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all cursor-pointer active:scale-95"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
              <span>Kindergarten</span>
              <span>/</span>
              <span>Asesmen Awal Pembelajaran</span>
            </div>
            <h1 className="text-xl font-black text-gray-900 tracking-tight mt-1">Laporan & Analisis Hasil AAP</h1>
          </div>
        </div>

        <div className="max-w-4xl mx-auto my-12 p-12 bg-white border border-gray-150 rounded-3xl shadow-sm text-center">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="p-4 bg-amber-50 text-amber-600 rounded-full">
              <AlertCircle size={36} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Belum Ada Kelas Ditugaskan</h2>
            <p className="text-gray-600 max-w-md">
              Belum ada kelas aktif yang ditugaskan kepada Anda pada Tahun Ajaran {activeYear || '2026/2027'}. Hubungi Kepala Unit atau admin untuk memperbarui assignment kelas.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-8 pb-20">
      {/* Header and Controls (Hidden on Print) */}
      <div className="flex flex-col gap-6 print:hidden">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/kindy/aap-assessment')}
              className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white border border-gray-100 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all cursor-pointer active:scale-95"
            >
              <ChevronLeft size={20} />
            </button>
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
                <span>Kindergarten</span>
                <span>/</span>
                <span>Asesmen Awal Pembelajaran</span>
              </div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight mt-1">Laporan & Analisis Hasil AAP</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/kindy/aap-assessment')}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-gray-100 rounded-xl text-xs font-black uppercase text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all active:scale-95"
            >
              <ClipboardCheck size={14} /> Input Penilaian
            </button>
          </div>
        </div>

        {/* Global Nav Tabs */}
        <div className="bg-white border border-gray-150 p-1.5 rounded-2xl flex items-center gap-1 max-w-xl">
          <button
            onClick={() => setActiveTab('individual')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
              activeTab === 'individual' 
                ? "bg-indigo-600 text-white shadow-md" 
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            )}
          >
            <User size={14} /> Laporan Individu
          </button>
          <button
            onClick={() => setActiveTab('followup')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
              activeTab === 'followup' 
                ? "bg-indigo-600 text-white shadow-md" 
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            )}
          >
            <ClipboardCheck size={14} /> Rencana Tindak Lanjut
          </button>
          <button
            onClick={() => setActiveTab('class')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
              activeTab === 'class' 
                ? "bg-indigo-600 text-white shadow-md" 
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            )}
          >
            <Layers size={14} /> Rekapitulasi Kelas
          </button>
        </div>

        {/* Filter Bar */}
        <div className="bg-white rounded-3xl border border-gray-150 p-6 flex flex-wrap items-center justify-between gap-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col gap-1.5 min-w-[200px]">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Pilih Kelas</label>
              <select
                value={selectedClassId}
                onChange={(e) => {
                  setSelectedClassId(e.target.value);
                  setLastSelectedClassId(e.target.value);
                }}
                disabled={isRestrictedToAssignedClasses && classes.length <= 1}
                className="w-full bg-gray-50/50 border border-gray-150 rounded-2xl px-4 py-2.5 text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {classes.map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
            </div>

            {activeTab === 'individual' && (
              <div className="flex flex-col gap-1.5 min-w-[220px]">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Pilih Siswa</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full bg-gray-50/50 border border-gray-150 rounded-2xl px-4 py-2.5 text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  {students.map(std => {
                    const hasData = !!assessments[std.id];
                    return (
                      <option key={std.id} value={std.id}>
                        {std.name} {hasData ? "✓" : "(Belum Dinilai)"}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          {activeTab === 'individual' && currentAssessment && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black px-4 py-2.5 rounded-xl text-xs uppercase tracking-widest shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <Printer size={14} /> Cetak / Export PDF
              </button>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-20 gap-3">
          <RefreshCw className="animate-spin text-indigo-600" size={32} />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Memuat Data Asesmen...</p>
        </div>
      ) : activeTab === 'individual' ? (
        // === LAPORAN INDIVIDU ===
        !currentAssessment ? (
          <div className="bg-white rounded-3xl border border-gray-150 p-16 text-center shadow-sm">
            <ClipboardCheck className="mx-auto text-gray-300 animate-pulse mb-4" size={48} />
            <h3 className="text-base font-black text-gray-800 uppercase tracking-wider">Belum Ada Penilaian</h3>
            <p className="text-xs text-gray-400 mt-2 max-w-sm mx-auto leading-relaxed">
              Siswa {activeStudentObj?.name || 'terpilih'} belum memiliki data penilaian untuk tahun ajaran {activeYear}. Silakan isi penilaian di tab "Input Penilaian" terlebih dahulu.
            </p>
            <button
              onClick={() => navigate('/kindy/aap-assessment')}
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md hover:bg-indigo-700 transition-all active:scale-95 cursor-pointer"
            >
              Mulai Input Penilaian
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            
            {/* LEFT-COLUMN: Printable Document Canvas */}
            <div className="lg:col-span-2 space-y-6">
              {/* Printable Wrapper */}
              <div 
                id="printable-aap-report" 
                className="bg-white p-8 md:p-12 border border-gray-200 shadow-xl rounded-3xl print:shadow-none print:border-none print:p-0 font-sans text-gray-950 w-full"
                style={{ contentVisibility: 'auto' }}
              >
                {/* School Letterhead or Header Style */}
                <div className="border-b-4 border-double border-indigo-950 pb-6 mb-8 text-center">
                  <span className="text-[10px] font-black tracking-widest text-indigo-600 uppercase">Unit Kindergarten / TK</span>
                  <h2 className="text-xl font-black text-indigo-950 uppercase tracking-tight mt-1 leading-none">Lumina Kindergarten</h2>
                  <h3 className="text-base font-extrabold text-gray-600 uppercase tracking-widest mt-2">Laporan dan Analisis Hasil AAP</h3>
                  <p className="text-[9px] font-bold font-mono text-gray-400 mt-1 uppercase tracking-wider">Asesmen Awal Pembelajaran • Tahun Ajaran {activeYear}</p>
                </div>

                {/* Report Metadata Block */}
                <div className="grid grid-cols-2 gap-y-4 gap-x-8 bg-gray-50/50 p-6 rounded-2xl border border-gray-100 text-xs font-bold text-gray-800 mb-8">
                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-gray-200/60 pb-1.5">
                      <span className="text-gray-400 font-extrabold uppercase text-[9px] tracking-wide">Nama Siswa</span>
                      <span className="text-right text-gray-900 uppercase font-black">{currentAssessment.studentName}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200/60 pb-1.5">
                      <span className="text-gray-400 font-extrabold uppercase text-[9px] tracking-wide">Nomor Induk / NIS</span>
                      <span className="text-right text-gray-900 font-mono font-black">{currentAssessment.studentId}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200/60 pb-1.5">
                      <span className="text-gray-400 font-extrabold uppercase text-[9px] tracking-wide">Kelompok Usia</span>
                      <span className="text-right text-gray-900 uppercase font-black">Kelompok {currentAssessment.ageRangeUsed} Th</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-gray-200/60 pb-1.5">
                      <span className="text-gray-400 font-extrabold uppercase text-[9px] tracking-wide">Kelas</span>
                      <span className="text-right text-gray-900 uppercase font-black">{currentAssessment.className}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200/60 pb-1.5">
                      <span className="text-gray-400 font-extrabold uppercase text-[9px] tracking-wide">Tahun Ajaran</span>
                      <span className="text-right text-gray-900 uppercase font-mono font-black">{currentAssessment.academicYear}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200/60 pb-1.5">
                      <span className="text-gray-400 font-extrabold uppercase text-[9px] tracking-wide">Tanggal Asesmen</span>
                      <span className="text-right text-gray-900 uppercase font-black">
                        {currentAssessment.updatedAt 
                          ? new Date(currentAssessment.updatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) 
                          : 'Belum Terhitung'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section I: Summary Table */}
                <div className="space-y-3 mb-10">
                  <h4 className="text-xs font-black text-indigo-950 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1.5 h-3 bg-indigo-600 rounded"></span> I. Ringkasan Capaian Aspek Perkembangan
                  </h4>
                  <div className="overflow-hidden border border-gray-200 rounded-2xl shadow-sm bg-white">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-indigo-950 text-white font-bold text-[10px] uppercase tracking-wider">
                          <th className="p-3">No</th>
                          <th className="p-3">Aspek Perkembangan</th>
                          <th className="p-3 text-center">Skor Capaian</th>
                          <th className="p-3 text-center">Skor Maksimal</th>
                          <th className="p-3 text-center">Persentase</th>
                          <th className="p-3 text-center">Tahap Capaian</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-bold text-gray-800">
                        {currentAssessment.aspects.map((asp: any, idx: number) => {
                          const percentage = asp.percentage;
                          return (
                            <tr key={asp.aspectName} className="hover:bg-gray-50/50 transition-colors">
                              <td className="p-3 font-mono text-gray-400 text-center w-12">{idx + 1}</td>
                              <td className="p-3 font-black text-gray-900">{asp.aspectName}</td>
                              <td className="p-3 text-center font-mono text-gray-900">{asp.rawScore}</td>
                              <td className="p-3 text-center font-mono text-gray-400">{asp.maxScore}</td>
                              <td className="p-3 text-center font-mono text-gray-900">{percentage}%</td>
                              <td className="p-3 text-center">
                                <span className={cn(
                                  "px-2 py-1 text-[9px] font-black rounded-lg uppercase tracking-wide border",
                                  asp.stage === 'BSB' ? "bg-indigo-50 text-indigo-700 border-indigo-200" :
                                  asp.stage === 'BSH' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                  asp.stage === 'MB' ? "bg-amber-50 text-amber-700 border-amber-200" :
                                  "bg-rose-50 text-rose-700 border-rose-200"
                                )}>
                                  {asp.stage}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] font-medium text-gray-400 leading-relaxed pt-1">
                    *Keterangan Tahap Capaian: <b>BB</b> (Belum Berkembang), <b>MB</b> (Mulai Berkembang), <b>BSH</b> (Berkembang Sesuai Harapan), <b>BSB</b> (Berkembang Sangat Baik)
                  </p>
                </div>

                {/* Section II: Graphic Visualization */}
                <div className="space-y-3 mb-10 avoid-break">
                  <h4 className="text-xs font-black text-indigo-950 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1.5 h-3 bg-indigo-600 rounded"></span> II. Grafik Capaian Hasil Asesmen (%)
                  </h4>
                  <div className="bg-gray-50/40 border border-gray-100 rounded-3xl p-6 flex justify-center">
                    <div className="w-full h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={chartData}
                          margin={{ top: 20, right: 10, left: -20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                          <XAxis 
                            dataKey="name" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#4b5563', fontSize: 9, fontWeight: 800 }} 
                          />
                          <YAxis 
                            domain={[0, 100]} 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#9ca3af', fontSize: 9, fontWeight: 700 }}
                          />
                          <Tooltip 
                            cursor={{ fill: '#f3f4f6', opacity: 0.5 }}
                            contentStyle={{ borderRadius: '16px', fontSize: '11px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                          />
                          <Bar 
                            dataKey="persentase" 
                            fill="#4f46e5" 
                            radius={[8, 8, 0, 0]} 
                            barSize={32}
                            isAnimationActive={false} // CRITICAL for perfect html2canvas capture without blanks
                          >
                            <LabelList 
                              dataKey="persentase" 
                              position="top" 
                              formatter={(v: number) => `${v}%`}
                              style={{ fill: '#374151', fontSize: 10, fontWeight: 900 }} 
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Section III: Development Analysis & Recommendations */}
                <div className="space-y-4 mb-10 avoid-break">
                  <h4 className="text-xs font-black text-indigo-950 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1.5 h-3 bg-indigo-600 rounded"></span> III. Analisis Perkembangan & Rekomendasi
                  </h4>
                  
                  <div className="space-y-4">
                    {currentAssessment.aspects.map((asp: any) => {
                      const analysis = asp.analysis || AAP_DEVELOPMENT_ANALYSIS[asp.aspectName as AAPAspectName]?.[asp.stage as any] || 'Siswa menunjukkan capaian sesuai dengan butir penilaian.';
                      const recommendation = asp.stimulationRecommendation || AAP_RECOMMENDATIONS[asp.aspectName as AAPAspectName]?.[asp.stage as any] || 'Sediakan stimulasi teratur di kelas dan rumah.';

                      return (
                        <div key={asp.aspectName} className="p-5 border border-gray-150 rounded-2xl space-y-2 bg-white">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-indigo-950">{asp.aspectName}</span>
                            <span className={cn(
                              "text-[8px] font-black uppercase px-2 py-0.5 rounded-md border",
                              asp.stage === 'BSB' ? "bg-indigo-50 text-indigo-700 border-indigo-200" :
                              asp.stage === 'BSH' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                              asp.stage === 'MB' ? "bg-amber-50 text-amber-700 border-amber-200" :
                              "bg-rose-50 text-rose-700 border-rose-200"
                            )}>
                              {asp.stage}
                            </span>
                          </div>
                          <div className="text-[11px] leading-relaxed text-gray-700">
                            <p className="font-bold text-gray-900">Deskripsi Perkembangan:</p>
                            <p className="font-normal text-gray-600 mt-0.5">{analysis}</p>
                          </div>
                          <div className="text-[11px] leading-relaxed text-gray-700 pt-1 border-t border-gray-100/60 mt-1">
                            <p className="font-bold text-gray-900">Rekomendasi Stimulasi & Tindak Lanjut:</p>
                            <p className="font-normal text-gray-600 mt-0.5">{recommendation}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Section IV: General Conclusion */}
                <div className="space-y-3 mb-12 avoid-break">
                  <h4 className="text-xs font-black text-indigo-950 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1.5 h-3 bg-indigo-600 rounded"></span> IV. Kesimpulan Umum Wali Kelas
                  </h4>
                  <div className="p-6 bg-gray-50 border border-gray-200 rounded-2xl min-h-[100px] text-xs font-bold leading-relaxed text-gray-800 whitespace-pre-wrap">
                    {generalConclusion || "Belum ada kesimpulan umum yang ditambahkan. Silakan ketik kesimpulan wali kelas di bagian editor kanan."}
                  </div>
                </div>

                {/* Section V: Signature Blocks */}
                <div className="grid grid-cols-3 gap-6 text-center text-[11px] font-bold text-gray-800 avoid-break pt-8 border-t border-gray-150">
                  <div className="space-y-16">
                    <p className="text-gray-400 font-extrabold uppercase text-[8px] tracking-widest">Wali Kelas / Homeroom Teacher</p>
                    <div>
                      <div className="w-24 h-0.5 bg-gray-300 mx-auto mb-1"></div>
                      <p className="font-black text-gray-900">Wali Kelas</p>
                    </div>
                  </div>

                  <div className="space-y-16">
                    <p className="text-gray-400 font-extrabold uppercase text-[8px] tracking-widest">Kepala Sekolah / Principal</p>
                    <div>
                      <div className="w-24 h-0.5 bg-gray-300 mx-auto mb-1"></div>
                      <p className="font-black text-gray-900">Ms. Nurul Khotimah</p>
                    </div>
                  </div>

                  <div className="space-y-16">
                    <p className="text-gray-400 font-extrabold uppercase text-[8px] tracking-widest">Orang Tua / Wali Siswa</p>
                    <div>
                      <div className="w-24 h-0.5 bg-gray-300 mx-auto mb-1"></div>
                      <p className="font-black text-gray-900">(..........................................)</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT-COLUMN: Pedagogy Tools, General Conclusion Editor, Audit Trails */}
            <div className="space-y-6 lg:sticky lg:top-8 print:hidden">
              {/* General Conclusion Editor */}
              <div className="bg-white border border-gray-150 p-6 rounded-3xl space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-50 pb-3">
                  <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-1.5">
                    <BookOpen size={14} className="text-indigo-600" /> Kesimpulan Wali Kelas
                  </h4>
                  <button
                    onClick={handleGenerateTemplate}
                    className="flex items-center gap-1 text-[9px] font-black uppercase text-indigo-600 hover:text-indigo-700 cursor-pointer bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-lg transition-all"
                  >
                    <Sparkles size={11} /> Auto Fill
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Narasi Kesimpulan Umum</label>
                  <textarea
                    value={generalConclusion}
                    onChange={(e) => setGeneralConclusion(e.target.value)}
                    rows={8}
                    className="w-full text-xs font-bold text-gray-800 bg-gray-50/50 border border-gray-150 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 leading-relaxed"
                    placeholder="Masukkan ulasan umum mengenai perkembangan anak selama asesmen..."
                  />
                </div>

                <button
                  onClick={handleSaveConclusion}
                  disabled={isSavingConclusion}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black px-4 py-2.5 rounded-xl text-xs uppercase tracking-widest shadow-sm transition-all active:scale-95 cursor-pointer"
                >
                  <Save size={13} /> {isSavingConclusion ? "Menyimpan..." : "Simpan Kesimpulan"}
                </button>
              </div>

              {/* Assessment Status Widget */}
              <div className="bg-white border border-gray-150 p-6 rounded-3xl space-y-4 shadow-sm">
                <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-1.5 border-b border-gray-50 pb-3">
                  <Award size={14} className="text-emerald-600" /> Hasil Rekapitulasi Individu
                </h4>

                <div className="space-y-3">
                  {currentAssessment.aspects.map((asp: any) => (
                    <div key={asp.aspectName} className="flex justify-between items-center text-xs">
                      <span className="font-bold text-gray-500">{asp.aspectName}</span>
                      <span className={cn(
                        "font-black uppercase text-[10px]",
                        asp.stage === 'BSB' ? "text-indigo-600" :
                        asp.stage === 'BSH' ? "text-emerald-600" :
                        asp.stage === 'MB' ? "text-amber-600" : "text-rose-600"
                      )}>
                        {asp.stage} ({asp.percentage}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        )
      ) : activeTab === 'followup' ? (
        // === RENCANA TINDAK LANJUT ===
        !currentAssessment ? (
          <div className="bg-white rounded-3xl border border-gray-150 p-16 text-center shadow-sm">
            <ClipboardCheck className="mx-auto text-gray-300 animate-pulse mb-4" size={48} />
            <h3 className="text-base font-black text-gray-800 uppercase tracking-wider">Belum Ada Penilaian</h3>
            <p className="text-xs text-gray-400 mt-2 max-w-sm mx-auto leading-relaxed">
              Siswa {activeStudentObj?.name || 'terpilih'} belum memiliki data penilaian untuk tahun ajaran {activeYear}. Silakan isi penilaian di tab "Input Penilaian" terlebih dahulu.
            </p>
            <button
              onClick={() => navigate('/kindy/aap-assessment')}
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md hover:bg-indigo-700 transition-all active:scale-95 cursor-pointer"
            >
              Mulai Input Penilaian
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
              <div>
                <h2 className="text-base font-black text-gray-900 uppercase tracking-tight">Rencana Tindak Lanjut AAP</h2>
                <p className="text-xs text-gray-500 mt-1">Ubah hasil dan rekomendasi AAP menjadi rencana stimulasi harian/mingguan yang spesifik untuk <b>{activeStudentObj?.name || 'Siswa'}</b>.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-8">
              {KM_ASPECTS.map((aspect) => {
                const plan = followupPlans[aspect.id] || {};
                const isEditing = editingAspectId === aspect.id;

                return (
                  <div key={aspect.id} className="bg-white border border-gray-150 rounded-3xl p-6 md:p-8 shadow-sm transition-all relative overflow-hidden">
                    {/* Header of Card */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-gray-100 pb-4 mb-6">
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1.5 text-[9px] font-black tracking-widest text-indigo-600 uppercase">
                          Aspek Perkembangan Kurikulum Merdeka
                        </span>
                        <h3 className="text-sm font-black text-gray-900 tracking-tight leading-tight">{aspect.name}</h3>
                        <p className="text-[11px] text-gray-500 leading-relaxed max-w-2xl">{aspect.description}</p>
                      </div>

                      {/* Status indicator badge (Only when hasPlan and not editing) */}
                      {plan.hasPlan && !isEditing && (
                        <span className={cn(
                          "px-3 py-1 text-[10px] font-black rounded-xl border uppercase tracking-wider self-start sm:self-center shrink-0",
                          plan.status === 'Selesai' ? "bg-emerald-50 text-emerald-700 border-emerald-150" :
                          plan.status === 'Berjalan' ? "bg-blue-50 text-blue-700 border-blue-150" :
                          plan.status === 'Disesuaikan' ? "bg-amber-50 text-amber-700 border-amber-150" :
                          "bg-gray-100 text-gray-600 border-gray-200"
                        )}>
                          {plan.status || 'Belum Dimulai'}
                        </span>
                      )}
                    </div>

                    {/* Edit mode vs Display mode */}
                    {isEditing ? (
                      /* EDIT MODE FORM */
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Pre-fill Summary (Disabled or Editable draft) */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center justify-between">
                              <span>Ringkasan Hasil AAP Terakhir</span>
                              <span className="text-[9px] text-indigo-500 font-bold lowercase tracking-normal">otomatis diisi</span>
                            </label>
                            <textarea
                              value={editSummary}
                              onChange={(e) => setEditSummary(e.target.value)}
                              rows={4}
                              className="w-full text-xs font-bold text-gray-700 bg-gray-50 border border-gray-150 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 leading-relaxed"
                              placeholder="Ringkasan hasil asesmen..."
                            />
                          </div>

                          {/* Pre-fill Recommendations */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center justify-between">
                              <span>Rekomendasi AAP (Draft)</span>
                              <span className="text-[9px] text-indigo-500 font-bold lowercase tracking-normal">otomatis diisi</span>
                            </label>
                            <textarea
                              value={editRecommendation}
                              onChange={(e) => setEditRecommendation(e.target.value)}
                              rows={4}
                              className="w-full text-xs font-bold text-gray-700 bg-gray-50 border border-gray-150 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 leading-relaxed"
                              placeholder="Rekomendasi stimulasi..."
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {/* Target Perkembangan */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                              Target Perkembangan <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={editTargetDevelopment}
                              onChange={(e) => setEditTargetDevelopment(e.target.value)}
                              className="w-full text-xs font-bold text-gray-800 bg-white border border-gray-150 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                              placeholder="Contoh: Anak mandiri memakai sepatu"
                              required
                            />
                          </div>

                          {/* Frekuensi */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                              Frekuensi Pelaksanaan <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={editFrequency}
                              onChange={(e) => setEditFrequency(e.target.value)}
                              className="w-full text-xs font-bold text-gray-800 bg-white border border-gray-150 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                              placeholder="Contoh: Setiap hari, 3x seminggu"
                              required
                            />
                          </div>

                          {/* Status */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</label>
                            <select
                              value={editStatus}
                              onChange={(e: any) => setEditStatus(e.target.value)}
                              className="w-full text-xs font-bold text-gray-800 bg-white border border-gray-150 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            >
                              <option value="Belum Dimulai">Belum Dimulai</option>
                              <option value="Berjalan">Berjalan</option>
                              <option value="Selesai">Selesai</option>
                              <option value="Disesuaikan">Disesuaikan</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Strategi atau Aktivitas Stimulasi */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                              Strategi / Aktivitas Stimulasi <span className="text-rose-500">*</span>
                            </label>
                            <textarea
                              value={editStimulationStrategy}
                              onChange={(e) => setEditStimulationStrategy(e.target.value)}
                              rows={3}
                              className="w-full text-xs font-bold text-gray-800 bg-white border border-gray-150 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 leading-relaxed"
                              placeholder="Contoh: Memberi tugas meronce manik-manik setiap jam istirahat..."
                              required
                            />
                          </div>

                          {/* Catatan Guru */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Catatan Guru / Catatan Khusus</label>
                            <textarea
                              value={editTeacherNotes}
                              onChange={(e) => setEditTeacherNotes(e.target.value)}
                              rows={3}
                              className="w-full text-xs font-bold text-gray-800 bg-white border border-gray-150 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 leading-relaxed"
                              placeholder="Masukkan catatan tambahan atau kemajuan observasi anak..."
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Periode Pelaksanaan (Start/End Date) */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Periode Pelaksanaan</label>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="relative">
                                <input
                                  type="date"
                                  value={editStartDate}
                                  onChange={(e) => setEditStartDate(e.target.value)}
                                  className="w-full text-xs font-bold text-gray-800 bg-white border border-gray-150 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                                <span className="absolute right-3 top-3.5 text-gray-400 pointer-events-none">
                                  <Calendar size={14} />
                                </span>
                              </div>
                              <div className="relative">
                                <input
                                  type="date"
                                  value={editEndDate}
                                  onChange={(e) => setEditEndDate(e.target.value)}
                                  className="w-full text-xs font-bold text-gray-800 bg-white border border-gray-150 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                                <span className="absolute right-3 top-3.5 text-gray-400 pointer-events-none">
                                  <Calendar size={14} />
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-end justify-end gap-3 pb-0.5">
                            <button
                              type="button"
                              onClick={() => setEditingAspectId(null)}
                              className="px-4 py-2.5 border border-gray-150 text-gray-600 hover:bg-gray-50 font-black rounded-xl text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
                            >
                              Batal
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveFollowupPlan(aspect.id)}
                              disabled={isSavingPlan[aspect.id] || !editTargetDevelopment || !editStimulationStrategy || !editFrequency}
                              className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-md transition-all active:scale-95 cursor-pointer"
                            >
                              <Save size={13} /> {isSavingPlan[aspect.id] ? 'Menyimpan...' : 'Simpan Rencana'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : plan.hasPlan ? (
                      /* DISPLAY MODE FOR FILLED PLAN */
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Summary Display */}
                          <div className="bg-gray-50/50 rounded-2xl border border-gray-100 p-4 space-y-1.5">
                            <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Ringkasan Hasil AAP</h4>
                            <div className="text-xs font-bold text-gray-700 whitespace-pre-wrap leading-relaxed">{plan.aapSummary}</div>
                          </div>

                          {/* Recommendation Display */}
                          <div className="bg-gray-50/50 rounded-2xl border border-gray-100 p-4 space-y-1.5">
                            <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Rekomendasi Stimulasi & Tindak Lanjut</h4>
                            <div className="text-xs font-bold text-gray-700 whitespace-pre-wrap leading-relaxed">{plan.aapRecommendation}</div>
                          </div>
                        </div>

                        {/* Stimulus Action Plan Details */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-indigo-50/20 rounded-2xl border border-indigo-100/50 p-6">
                          <div className="space-y-1 md:col-span-2">
                            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Strategi & Aktivitas Stimulasi</span>
                            <p className="text-xs font-bold text-gray-800 leading-relaxed">{plan.stimulationStrategy}</p>
                          </div>
                          
                          <div className="space-y-3">
                            <div>
                              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Target Perkembangan</span>
                              <p className="text-xs font-extrabold text-gray-900 leading-relaxed">{plan.targetDevelopment}</p>
                            </div>
                            <div>
                              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Frekuensi</span>
                              <p className="text-xs font-extrabold text-gray-900 leading-relaxed">{plan.frequency}</p>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Periode Pelaksanaan</span>
                              <p className="text-xs font-extrabold text-gray-900 leading-relaxed">
                                {plan.startDate || plan.endDate ? (
                                  `${plan.startDate ? plan.startDate : '-'} s/d ${plan.endDate ? plan.endDate : '-'}`
                                ) : (
                                  'Tidak ditentukan'
                                )}
                              </p>
                            </div>
                            <div>
                              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Diperbarui</span>
                              <p className="text-xs font-mono font-bold text-gray-500">{plan.updatedAt ? new Date(plan.updatedAt).toLocaleDateString('id-ID', {day: 'numeric', month: 'short', year: 'numeric'}) : '-'}</p>
                            </div>
                          </div>
                        </div>

                        {/* Teacher Notes (If present) */}
                        {plan.teacherNotes && (
                          <div className="bg-amber-50/30 border border-amber-100/50 rounded-2xl p-4">
                            <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest block mb-1">Catatan Guru</span>
                            <p className="text-xs font-bold text-gray-700 leading-relaxed">{plan.teacherNotes}</p>
                          </div>
                        )}

                        {/* SECTION BUKTI PELAKSANAAN */}
                        <div className="border border-gray-150 rounded-2xl overflow-hidden bg-gray-50/30">
                          {/* Header Toggle */}
                          <div className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 bg-gray-50/50 hover:bg-gray-100/50 transition-colors border-b border-gray-150 gap-4">
                            <button
                              type="button"
                              onClick={() => toggleEvidenceExpanded(aspect.id)}
                              className="flex items-center gap-2 text-left focus:outline-none flex-1"
                            >
                              <Paperclip size={16} className="text-indigo-600 shrink-0" />
                              <div>
                                <h4 className="text-xs font-black text-gray-800 uppercase tracking-wide">Bukti Pelaksanaan</h4>
                                <p className="text-[10px] text-gray-500 font-bold">
                                  {connectedEvidences.filter(e => e.planId === `${selectedStudentId}_${activeYear.replace('/', '_')}_${aspect.id}`).length} bukti terhubung
                                </p>
                              </div>
                            </button>
                            <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                              <button
                                type="button"
                                onClick={() => handleOpenEvidenceModal(aspect.id)}
                                className="px-3 py-1.5 bg-indigo-50 border border-indigo-150 text-indigo-600 hover:bg-indigo-100/50 transition-colors font-black rounded-lg text-[10px] uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                              >
                                <Plus size={12} /> Hubungkan Bukti
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleEvidenceExpanded(aspect.id)}
                                className="p-1 focus:outline-none text-gray-400 hover:text-gray-600 cursor-pointer"
                              >
                                {expandedEvidenceAspects[aspect.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>
                            </div>
                          </div>

                          {/* Collapsible Content */}
                          {expandedEvidenceAspects[aspect.id] && (
                            <div className="p-4 bg-white space-y-4">
                              {/* Non-intrusive status change suggestion */}
                              {suggestStatusChangeAspectId === aspect.id && plan.status === 'Belum Dimulai' && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
                                  <div className="flex items-start gap-2">
                                    <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                                    <div>
                                      <p className="text-[11px] font-bold text-amber-800">Saran Pembaruan Status</p>
                                      <p className="text-[10px] text-amber-600 leading-normal">
                                        Bukti pelaksanaan pertama telah ditambahkan. Apakah rencana ini sudah mulai berjalan?
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => setSuggestStatusChangeAspectId(null)}
                                      className="px-2.5 py-1 text-[10px] font-black text-gray-500 hover:text-gray-700 uppercase cursor-pointer"
                                    >
                                      Tetap Belum Dimulai
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleUpdatePlanStatus(aspect.id, 'Berjalan')}
                                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-[10px] rounded-lg uppercase tracking-wider shadow-sm cursor-pointer"
                                    >
                                      Ubah menjadi Berjalan
                                    </button>
                                  </div>
                                </div>
                              )}

                              {connectedEvidences.filter(e => e.planId === `${selectedStudentId}_${activeYear.replace('/', '_')}_${aspect.id}`).length === 0 ? (
                                <div className="text-center py-6 px-4">
                                  <p className="text-xs font-bold text-gray-400">Belum ada bukti pelaksanaan yang terhubung.</p>
                                  <p className="text-[10px] text-gray-400 mt-1">Gunakan tombol "Hubungkan Bukti" di atas untuk menautkan data observasi, checklist emosional, atau rangkuman mingguan.</p>
                                </div>
                              ) : (
                                <div className="divide-y divide-gray-150">
                                  {connectedEvidences
                                    .filter(e => e.planId === `${selectedStudentId}_${activeYear.replace('/', '_')}_${aspect.id}`)
                                    .map((evidence, idx) => {
                                      const hasThumbnail = !!evidence.cachedThumbnailUrl;
                                      return (
                                        <div key={evidence.id} className={cn("py-4 first:pt-0 last:pb-0 flex flex-col md:flex-row gap-4 justify-between items-start", idx > 0 && "pt-4")}>
                                          <div className="flex gap-3 items-start flex-1 min-w-0">
                                            {/* Thumbnail / Source icon wrapper */}
                                            {hasThumbnail ? (
                                              <img
                                                src={evidence.cachedThumbnailUrl}
                                                alt="Thumbnail bukti"
                                                referrerPolicy="no-referrer"
                                                className="w-12 h-12 object-cover rounded-xl border border-gray-150 shrink-0"
                                              />
                                            ) : (
                                              <div className="w-12 h-12 rounded-xl bg-gray-150 border border-gray-200 flex items-center justify-center shrink-0 text-gray-500">
                                                <FileText size={20} />
                                              </div>
                                            )}

                                            {/* Title and summary info */}
                                            <div className="space-y-1 flex-1 min-w-0">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-[9px] font-mono font-bold text-gray-500">
                                                  {evidence.evidenceDate ? new Date(evidence.evidenceDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'short', year: 'numeric'}) : 'Tanggal -'}
                                                </span>
                                                <span className={cn(
                                                  "px-2 py-0.5 text-[8px] font-black rounded border uppercase tracking-wider",
                                                  evidence.sourceType === 'OBSERVATION' ? "bg-purple-50 text-purple-700 border-purple-150" :
                                                  evidence.sourceType === 'CHECKLIST' ? "bg-teal-50 text-teal-700 border-teal-150" :
                                                  evidence.sourceType === 'WEEKLY_SUMMARY' ? "bg-amber-50 text-amber-700 border-amber-150" :
                                                  "bg-blue-50 text-blue-700 border-blue-150"
                                                )}>
                                                  {evidence.cachedSourceLabel || evidence.sourceType}
                                                </span>
                                                {evidence.cachedDomain && (
                                                  <span className="text-[9px] font-bold text-gray-400 italic">
                                                    ({evidence.cachedDomain})
                                                  </span>
                                                )}
                                              </div>
                                              <h5 className="text-xs font-extrabold text-gray-900 leading-tight truncate">
                                                {evidence.cachedTitle}
                                              </h5>
                                              <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed whitespace-pre-wrap">
                                                {evidence.cachedSummary}
                                              </p>

                                              {/* Teacher's Connection Note */}
                                              <div className="mt-3 pt-2 border-t border-dashed border-gray-150 space-y-1">
                                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Catatan Keterkaitan Guru (Opsional)</label>
                                                <div className="flex gap-2">
                                                  <textarea
                                                    placeholder="Masukkan catatan keterkaitan, misal: Pada kegiatan ini anak menunjukkan kemajuan..."
                                                    value={relevanceNotesEdit[evidence.id] !== undefined ? relevanceNotesEdit[evidence.id] : (evidence.teacherRelevanceNote || '')}
                                                    onChange={(e) => {
                                                      setRelevanceNotesEdit(prev => ({
                                                        ...prev,
                                                        [evidence.id]: e.target.value
                                                      }));
                                                    }}
                                                    rows={2}
                                                    className="flex-1 text-[11px] font-bold text-gray-700 bg-white border border-gray-150 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 leading-relaxed"
                                                  />
                                                  {(relevanceNotesEdit[evidence.id] !== undefined && relevanceNotesEdit[evidence.id] !== evidence.teacherRelevanceNote) && (
                                                    <button
                                                      type="button"
                                                      onClick={() => handleSaveRelevanceNote(evidence.id, relevanceNotesEdit[evidence.id])}
                                                      className="px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] uppercase rounded-xl shadow-sm self-end h-8 transition-all active:scale-95 cursor-pointer"
                                                    >
                                                      Simpan
                                                    </button>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          </div>

                                          {/* Actions (View Detail, Delete Connection) */}
                                          <div className="flex items-center gap-1.5 self-end md:self-start shrink-0">
                                            <button
                                              type="button"
                                              onClick={() => handleOpenDetailView(evidence)}
                                              className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer"
                                              title="Lihat Detail Bukti"
                                            >
                                              <Eye size={15} />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleUnlinkEvidence(evidence.id)}
                                              className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                                              title="Hapus Hubungan Bukti"
                                            >
                                              <Trash2 size={15} />
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Card Edit Button */}
                        <div className="flex justify-end pt-2 border-t border-gray-50">
                          <button
                            type="button"
                            onClick={() => handleStartPlanning(aspect.id)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100 font-black rounded-xl text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
                          >
                            <Edit3 size={13} /> Edit Rencana
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* EMPTY PLAN STATE WITH BUAT RENCANA BUTTON */
                      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                        <ClipboardCheck className="text-gray-300 mb-3 animate-pulse" size={40} />
                        <h4 className="text-xs font-black text-gray-700 uppercase tracking-wider">Belum Ada Rencana Stimulasi</h4>
                        <p className="text-[11px] text-gray-400 mt-1 max-w-sm leading-relaxed">
                          Aspek ini belum memiliki rencana stimulasi tindak lanjut. Tekan tombol di bawah untuk membuat draf rencana stimulasi berdasarkan hasil asesmen awal.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleStartPlanning(aspect.id)}
                          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-sm transition-all active:scale-95 cursor-pointer"
                        >
                          <Plus size={14} /> Buat Rencana
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )
      ) : (
        // === REKAPITULASI KELAS (CLASS SUMMARY) ===
        <div className="bg-white rounded-3xl border border-gray-150 overflow-hidden shadow-sm">
          {/* Summary Table Header */}
          <div className="p-6 md:p-8 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white">
            <div>
              <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Capaian Asesmen Awal Kelas {activeClassObj?.name || 'Dipilih'}</h3>
              <p className="text-xs text-gray-400 font-bold mt-1 uppercase">Rekapitulasi Capaian Pembelajaran Tahunan ({activeYear})</p>
            </div>
            <span className="px-3 py-1.5 bg-indigo-50 text-indigo-700 font-black text-[10px] uppercase rounded-xl border border-indigo-100">
              Selesai Dinilai: {Object.keys(assessments).length} / {students.length} Siswa
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50/75 border-b border-gray-100 font-black text-gray-500 uppercase tracking-wider text-[10px]">
                  <th className="p-4 pl-6">Nama Siswa</th>
                  <th className="p-4 text-center">Motorik Kasar</th>
                  <th className="p-4 text-center">Motorik Halus</th>
                  <th className="p-4 text-center">Bahasa</th>
                  <th className="p-4 text-center">Kognitif</th>
                  <th className="p-4 text-center">Sosial & Kemandirian</th>
                  <th className="p-4 text-center">Rata-rata %</th>
                  <th className="p-4 text-center pr-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-bold text-gray-700">
                {students.map(std => {
                  const assessmentData = assessments[std.id];
                  const hasAssessment = !!assessmentData;

                  // Compute average percent
                  let avgPercent = 0;
                  if (hasAssessment && assessmentData.aspects) {
                    const sum = assessmentData.aspects.reduce((acc: number, item: any) => acc + item.percentage, 0);
                    avgPercent = Math.round(sum / assessmentData.aspects.length);
                  }

                  return (
                    <tr key={std.id} className="hover:bg-gray-50/40 transition-colors">
                      <td className="p-4 pl-6 font-black text-gray-900 uppercase truncate max-w-[200px]">{std.name}</td>
                      
                      {/* Motorik Kasar */}
                      <td className="p-4 text-center">
                        {hasAssessment ? (
                          <span className={cn(
                            "px-2 py-0.5 text-[9px] font-black rounded-lg border uppercase",
                            assessmentData.aspects[0]?.stage === 'BSB' ? "bg-indigo-50 text-indigo-700 border-indigo-100" :
                            assessmentData.aspects[0]?.stage === 'BSH' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                            assessmentData.aspects[0]?.stage === 'MB' ? "bg-amber-50 text-amber-700 border-amber-100" :
                            "bg-rose-50 text-rose-700 border-rose-100"
                          )}>
                            {assessmentData.aspects[0]?.stage || '-'}
                          </span>
                        ) : '-'}
                      </td>

                      {/* Motorik Halus */}
                      <td className="p-4 text-center">
                        {hasAssessment ? (
                          <span className={cn(
                            "px-2 py-0.5 text-[9px] font-black rounded-lg border uppercase",
                            assessmentData.aspects[1]?.stage === 'BSB' ? "bg-indigo-50 text-indigo-700 border-indigo-100" :
                            assessmentData.aspects[1]?.stage === 'BSH' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                            assessmentData.aspects[1]?.stage === 'MB' ? "bg-amber-50 text-amber-700 border-amber-100" :
                            "bg-rose-50 text-rose-700 border-rose-100"
                          )}>
                            {assessmentData.aspects[1]?.stage || '-'}
                          </span>
                        ) : '-'}
                      </td>

                      {/* Bahasa */}
                      <td className="p-4 text-center">
                        {hasAssessment ? (
                          <span className={cn(
                            "px-2 py-0.5 text-[9px] font-black rounded-lg border uppercase",
                            assessmentData.aspects[2]?.stage === 'BSB' ? "bg-indigo-50 text-indigo-700 border-indigo-100" :
                            assessmentData.aspects[2]?.stage === 'BSH' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                            assessmentData.aspects[2]?.stage === 'MB' ? "bg-amber-50 text-amber-700 border-amber-100" :
                            "bg-rose-50 text-rose-700 border-rose-100"
                          )}>
                            {assessmentData.aspects[2]?.stage || '-'}
                          </span>
                        ) : '-'}
                      </td>

                      {/* Kognitif */}
                      <td className="p-4 text-center">
                        {hasAssessment ? (
                          <span className={cn(
                            "px-2 py-0.5 text-[9px] font-black rounded-lg border uppercase",
                            assessmentData.aspects[3]?.stage === 'BSB' ? "bg-indigo-50 text-indigo-700 border-indigo-100" :
                            assessmentData.aspects[3]?.stage === 'BSH' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                            assessmentData.aspects[3]?.stage === 'MB' ? "bg-amber-50 text-amber-700 border-amber-100" :
                            "bg-rose-50 text-rose-700 border-rose-100"
                          )}>
                            {assessmentData.aspects[3]?.stage || '-'}
                          </span>
                        ) : '-'}
                      </td>

                      {/* Sosial & Kemandirian */}
                      <td className="p-4 text-center">
                        {hasAssessment ? (
                          <span className={cn(
                            "px-2 py-0.5 text-[9px] font-black rounded-lg border uppercase",
                            assessmentData.aspects[4]?.stage === 'BSB' ? "bg-indigo-50 text-indigo-700 border-indigo-100" :
                            assessmentData.aspects[4]?.stage === 'BSH' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                            assessmentData.aspects[4]?.stage === 'MB' ? "bg-amber-50 text-amber-700 border-amber-100" :
                            "bg-rose-50 text-rose-700 border-rose-100"
                          )}>
                            {assessmentData.aspects[4]?.stage || '-'}
                          </span>
                        ) : '-'}
                      </td>

                      {/* Average Percentage */}
                      <td className="p-4 text-center font-mono text-gray-900">
                        {hasAssessment ? `${avgPercent}%` : '-'}
                      </td>

                      {/* Status / Quick Action */}
                      <td className="p-4 text-center pr-6">
                        {hasAssessment ? (
                          <div className="flex items-center justify-center gap-2">
                            <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 uppercase">
                              <CheckCircle2 size={12} /> Lengkap
                            </span>
                            <button
                              onClick={() => {
                                setSelectedStudentId(std.id);
                                setActiveTab('individual');
                              }}
                              className="text-[9px] font-extrabold uppercase bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2 py-1 rounded-lg border border-indigo-100 transition-all cursor-pointer"
                            >
                              Detail
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] font-black text-gray-400 uppercase">Belum Dinilai</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* PHASE 2: BUKTI PELAKSANAAN MODALS          */}
      {/* ========================================== */}

      {/* Modal 1: Hubungkan Bukti */}
      {isEvidenceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-150 overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-150 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2.5">
                <Paperclip className="text-indigo-600" size={20} />
                <div>
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">Hubungkan Bukti Pelaksanaan</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Siswa: {activeStudentObj?.name} | Aspek: {activeModalAspectId}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEvidenceModalOpen(false)}
                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* Filter Panel */}
            <div className="p-6 border-b border-gray-150 bg-gray-50/20 grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Date Start Filter */}
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Tanggal Mulai</label>
                <input
                  type="date"
                  value={modalStartDate}
                  onChange={(e) => setModalStartDate(e.target.value)}
                  className="w-full text-xs font-bold text-gray-700 bg-white border border-gray-150 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                />
              </div>

              {/* Date End Filter */}
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Tanggal Selesai</label>
                <input
                  type="date"
                  value={modalEndDate}
                  onChange={(e) => setModalEndDate(e.target.value)}
                  className="w-full text-xs font-bold text-gray-700 bg-white border border-gray-150 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                />
              </div>

              {/* Source Filter */}
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Sumber Bukti</label>
                <select
                  value={modalSourceFilter}
                  onChange={(e) => setModalSourceFilter(e.target.value as any)}
                  className="w-full text-xs font-bold text-gray-700 bg-white border border-gray-150 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                >
                  <option value="ALL">Semua Sumber</option>
                  <option value="OBSERVATION">Observation Data</option>
                  <option value="CHECKLIST">Emotional Checklist</option>
                  <option value="WEEKLY_SUMMARY">Weekly Summary</option>
                  <option value="WEEKLY_REPORT">Weekly Report</option>
                </select>
              </div>

              {/* Domain Filter */}
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Aspek/Domain</label>
                <select
                  value={modalDomainFilter}
                  onChange={(e) => setModalDomainFilter(e.target.value)}
                  className="w-full text-xs font-bold text-gray-700 bg-white border border-gray-150 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                >
                  <option value="ALL">Semua Domain</option>
                  <option value="Motorik">Motorik (Kasar & Halus)</option>
                  <option value="Bahasa">Bahasa</option>
                  <option value="Kognitif">Kognitif</option>
                  <option value="Sosial">Sosial Emosional / Mandiri</option>
                  <option value="Agama">Nilai Agama & Budi Pekerti</option>
                  <option value="Jati Diri">Jati Diri</option>
                  <option value="Literasi">Literasi & STEAM</option>
                </select>
              </div>

              {/* Text Search Filter */}
              <div className="md:col-span-4 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Pencarian Teks</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Cari berdasarkan judul kegiatan, materi, atau ringkasan catatan..."
                    value={modalSearchQuery}
                    onChange={(e) => setModalSearchQuery(e.target.value)}
                    className="flex-1 text-xs font-bold text-gray-700 bg-white border border-gray-150 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setModalStartDate('');
                      setModalEndDate('');
                      setModalSourceFilter('ALL');
                      setModalDomainFilter('ALL');
                      setModalSearchQuery('');
                    }}
                    className="px-3 text-[10px] font-black uppercase text-gray-500 hover:text-gray-700 transition-colors shrink-0"
                  >
                    Reset Filter
                  </button>
                </div>
              </div>
            </div>

            {/* Evidence List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {isFetchingEvidence ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <RefreshCw className="animate-spin mb-2" size={24} />
                  <p className="text-xs font-bold">Sedang memuat dokumen bukti dari database...</p>
                </div>
              ) : filteredEvidence.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-gray-150 rounded-2xl bg-gray-50/50">
                  <FileText className="mx-auto text-gray-300 mb-2" size={32} />
                  <p className="text-xs font-bold text-gray-600">Tidak ada dokumen bukti yang cocok dengan filter.</p>
                  <p className="text-[10px] text-gray-400 mt-1 max-w-md mx-auto">
                    Pastikan Anda telah mengisi Lembar Observasi Harian, Checklist Emosional, atau Rangkuman Mingguan untuk murid ini.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Pilih dokumen yang ingin dihubungkan ({filteredEvidence.length} tersedia):</p>
                  {filteredEvidence.map((item) => {
                    const isSelected = !!selectedSourcesMap[item.id];
                    const hasThumbnail = !!item.thumbnailUrl;
                    
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSelectedSourcesMap(prev => ({
                            ...prev,
                            [item.id]: !prev[item.id]
                          }));
                        }}
                        className={cn(
                          "p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-4",
                          isSelected 
                            ? "bg-indigo-50/40 border-indigo-200/80 shadow-sm" 
                            : "bg-white border-gray-150 hover:bg-gray-50/40"
                        )}
                      >
                        {/* Custom Checkbox */}
                        <div className="pt-0.5 shrink-0">
                          <div className={cn(
                            "w-4.5 h-4.5 rounded-md border flex items-center justify-center transition-all",
                            isSelected 
                              ? "bg-indigo-600 border-indigo-600 text-white" 
                              : "border-gray-350 bg-white"
                          )}>
                            {isSelected && <CheckCircle2 size={11} className="stroke-[3]" />}
                          </div>
                        </div>

                        {/* Thumbnail / Source representation */}
                        {hasThumbnail ? (
                          <img
                            src={item.thumbnailUrl}
                            alt="Preview Bukti"
                            referrerPolicy="no-referrer"
                            className="w-12 h-12 object-cover rounded-xl border border-gray-150 shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-gray-100 border border-gray-150 flex items-center justify-center shrink-0 text-gray-400">
                            <FileText size={18} />
                          </div>
                        )}

                        {/* Information body */}
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[9px] font-mono font-bold text-gray-500">
                              {item.evidenceDate ? new Date(item.evidenceDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'short', year: 'numeric'}) : 'Tanggal -'}
                            </span>
                            <span className={cn(
                              "px-2 py-0.5 text-[8px] font-black rounded border uppercase tracking-wider",
                              item.sourceType === 'OBSERVATION' ? "bg-purple-50 text-purple-700 border-purple-150" :
                              item.sourceType === 'CHECKLIST' ? "bg-teal-50 text-teal-700 border-teal-150" :
                              item.sourceType === 'WEEKLY_SUMMARY' ? "bg-amber-50 text-amber-700 border-amber-150" :
                              "bg-blue-50 text-blue-700 border-blue-150"
                            )}>
                              {item.sourceLabel}
                            </span>
                            {item.domain && (
                              <span className="text-[9px] font-bold text-gray-400 italic">
                                ({item.domain})
                              </span>
                            )}
                          </div>
                          <h4 className="text-xs font-black text-gray-900 leading-tight">
                            {item.title}
                          </h4>
                          <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed whitespace-pre-wrap">
                            {item.summary}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-150 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <span className="text-[11px] text-gray-400 font-bold">
                {Object.values(selectedSourcesMap).filter(Boolean).length} bukti dipilih untuk dihubungkan
              </span>
              <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEvidenceModalOpen(false)}
                  className="px-4 py-2 border border-gray-150 text-gray-600 hover:bg-gray-100 font-black rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleLinkSelectedEvidence}
                  disabled={isSavingEvidence || Object.values(selectedSourcesMap).filter(Boolean).length === 0}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5 cursor-pointer"
                >
                  {isSavingEvidence ? <RefreshCw className="animate-spin" size={13} /> : <Link2 size={13} />}
                  Hubungkan Bukti
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Lihat Detail Bukti */}
      {isDetailViewOpen && detailViewEvidence && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-gray-150 overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-150 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2">
                <Eye className="text-indigo-600" size={18} />
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">Detail Dokumen Bukti</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetailViewEvidence(null);
                  setIsDetailViewOpen(false);
                }}
                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Image attachment if exists */}
              {detailViewEvidence.cachedThumbnailUrl && (
                <div className="rounded-2xl overflow-hidden border border-gray-150 bg-gray-50">
                  <img
                    src={detailViewEvidence.cachedThumbnailUrl}
                    alt="Foto bukti dokumentasi"
                    referrerPolicy="no-referrer"
                    className="w-full max-h-80 object-contain mx-auto"
                  />
                </div>
              )}

              {/* Title & Metadata */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-gray-500">
                    {detailViewEvidence.evidenceDate ? new Date(detailViewEvidence.evidenceDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'short', year: 'numeric'}) : 'Tanggal -'}
                  </span>
                  <span className={cn(
                    "px-2 py-0.5 text-[8px] font-black rounded border uppercase tracking-wider",
                    detailViewEvidence.sourceType === 'OBSERVATION' ? "bg-purple-50 text-purple-700 border-purple-150" :
                    detailViewEvidence.sourceType === 'CHECKLIST' ? "bg-teal-50 text-teal-700 border-teal-150" :
                    detailViewEvidence.sourceType === 'WEEKLY_SUMMARY' ? "bg-amber-50 text-amber-700 border-amber-150" :
                    "bg-blue-50 text-blue-700 border-blue-150"
                  )}>
                    {detailViewEvidence.cachedSourceLabel}
                  </span>
                  {detailViewEvidence.cachedDomain && (
                    <span className="text-xs font-bold text-gray-400 italic">
                      ({detailViewEvidence.cachedDomain})
                    </span>
                  )}
                </div>
                <h4 className="text-base font-black text-gray-900 leading-snug">
                  {detailViewEvidence.cachedTitle}
                </h4>
              </div>

              {/* Summary / Notes content */}
              <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5 space-y-1.5">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Isi Catatan / Deskripsi</span>
                <p className="text-xs font-bold text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {detailViewEvidence.cachedSummary}
                </p>
              </div>

              {/* Connection Log */}
              <div className="bg-indigo-50/20 border border-indigo-100/50 rounded-2xl p-4 space-y-1 text-[11px] font-bold text-gray-500">
                <p className="text-indigo-700 font-extrabold uppercase text-[9px] tracking-wider mb-2">Informasi Relasi Bukti</p>
                <p>Dihubungkan oleh: <span className="text-gray-700 font-extrabold">{detailViewEvidence.createdBy || 'Guru Pengampu'} ({detailViewEvidence.createdByEmail || '-'})</span></p>
                <p>Waktu Pembuatan: <span className="text-gray-700 font-extrabold">{detailViewEvidence.createdAt ? new Date(detailViewEvidence.createdAt).toLocaleString('id-ID') : '-'}</span></p>
                {detailViewEvidence.teacherRelevanceNote && (
                  <div className="mt-3 pt-3 border-t border-indigo-100/50">
                    <span className="text-indigo-700 font-extrabold uppercase text-[9px] tracking-wider block mb-1">Catatan Keterkaitan Guru</span>
                    <p className="text-xs text-gray-700 leading-relaxed italic">"{detailViewEvidence.teacherRelevanceNote}"</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-150 bg-gray-50/50 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setDetailViewEvidence(null);
                  setIsDetailViewOpen(false);
                }}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-sm transition-all active:scale-95 cursor-pointer"
              >
                Tutup Detail
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modern styles injection */}
      <style>{`
        @media print {
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          #printable-aap-report {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
          .avoid-break {
            page-break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  );
}
