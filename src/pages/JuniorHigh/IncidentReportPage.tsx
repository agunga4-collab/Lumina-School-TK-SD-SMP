import * as React from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Download, 
  Edit3, 
  Eye, 
  FileText, 
  Plus, 
  Search, 
  Send, 
  ShieldCheck, 
  Trash2, 
  User, 
  X,
  Loader2,
  Calendar,
  MapPin,
  FileCheck
} from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, where, documentId } from 'firebase/firestore';
import { db, getActiveStudents } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { IncidentReport, IncidentReportStatus } from '../../types/incidentReport';
import { 
  getJHIncidentReports, 
  createJHIncidentReport, 
  updateJHIncidentReport, 
  deleteJHIncidentReport, 
  submitJHIncidentReport, 
  approveJHIncidentReport,
  getJHLogoUrl,
  getJHSignatoryConfig,
  getHomeroomTeacherForClass
} from '../../services/incidentReportService';
import { LuminaLogo } from '../../components/LuminaLogo';
import { jsPDF } from 'jspdf';
import { html2canvasWithModernColors } from '../../lib/html2canvasPatch';

interface StudentOption {
  id: string;
  name: string;
  classId: string;
  className: string;
}

interface ClassOption {
  id: string;
  name: string;
  academicYear?: string;
}

export function IncidentReportPage() {
  const { currentUser } = useAuth();
  const { activeYear } = useAcademicYear();

  // Permissions check
  const isHeadUnit = React.useMemo(() => {
    if (!currentUser) return false;
    const role = (currentUser.role || '').toUpperCase();
    return [
      'SUPER_ADMIN', 
      'HEAD_UNIT', 
      'HEAD_JUNIOR', 
      'PRINCIPAL', 
      'VICE_PRINCIPAL',
      'ADMIN'
    ].includes(role);
  }, [currentUser]);

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  // Data states
  const [reports, setReports] = React.useState<IncidentReport[]>([]);
  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [availableStudents, setAvailableStudents] = React.useState<StudentOption[]>([]);
  const [loadingStudents, setLoadingStudents] = React.useState<boolean>(false);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [statusFilter, setStatusFilter] = React.useState<IncidentReportStatus | 'ALL'>('ALL');

  // School Config states (Logo & JH Signatory)
  const [jhLogoUrl, setJhLogoUrl] = React.useState<string | null>(null);
  const [jhSignatory, setJhSignatory] = React.useState<{
    principalName: string;
    principalTitle: string;
    principalNIY?: string;
    principalSignatureUrl: string | null;
  } | null>(null);

  // Homeroom Teacher info for selected class
  const [homeroomTeacherInfo, setHomeroomTeacherInfo] = React.useState<{
    name: string;
    signatureUrl: string | null;
  } | null>(null);

  // Load Homeroom Teacher info when viewing a report
  React.useEffect(() => {
    if (!viewingReport) {
      setHomeroomTeacherInfo(null);
      return;
    }

    let isCancelled = false;
    const loadHT = async () => {
      const info = await getHomeroomTeacherForClass(viewingReport.classId, viewingReport.classNameSnapshot);
      if (!isCancelled) {
        setHomeroomTeacherInfo(info);
      }
    };

    loadHT();
    return () => {
      isCancelled = true;
    };
  }, [viewingReport]);

  // UI state for Modals
  const [isFormOpen, setIsFormOpen] = React.useState<boolean>(false);
  const [editingReport, setEditingReport] = React.useState<IncidentReport | null>(null);
  const [viewingReport, setViewingReport] = React.useState<IncidentReport | null>(null);
  const [confirmApproveReport, setConfirmApproveReport] = React.useState<IncidentReport | null>(null);
  const [confirmSubmitReport, setConfirmSubmitReport] = React.useState<IncidentReport | null>(null);
  const [confirmDeleteReport, setConfirmDeleteReport] = React.useState<IncidentReport | null>(null);

  // Submitting states
  const [isSaving, setIsSaving] = React.useState<boolean>(false);
  const [isApproving, setIsApproving] = React.useState<boolean>(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = React.useState<boolean>(false);

  // Hidden PDF Printable Ref
  const pdfPrintRef = React.useRef<HTMLDivElement | null>(null);

  // Form Fields State
  const [formData, setFormData] = React.useState({
    classId: '',
    classNameSnapshot: '',
    studentId: '',
    studentNameSnapshot: '',
    academicYearId: activeYear || '2026/2027',
    incidentDate: new Date().toISOString().split('T')[0],
    incidentTime: '',
    witnessesOrAdultsPresent: '',
    incidentPlace: '',
    incidentDescription: '',
    actionTreatmentTaken: '',
    childConditionFollowingIncident: '',
    suggestionNextTreatment: '',
  });

  // Load students for a specific class in the active academic year
  const loadStudentsForClass = React.useCallback(async (targetClassId: string, yr: string) => {
    if (!targetClassId || !yr) {
      setAvailableStudents([]);
      return;
    }

    setLoadingStudents(true);
    try {
      // 1. Primary roster fetch: getActiveStudents from firebase lib
      const activeStudents = await getActiveStudents(targetClassId, yr);

      if (activeStudents && activeStudents.length > 0) {
        const studentList: StudentOption[] = activeStudents.map(s => ({
          id: s.id,
          name: s.name || (s as any).fullName || 'Siswa Tanpa Nama',
          classId: targetClassId,
          className: (s as any).className || ''
        }));
        studentList.sort((a, b) => a.name.localeCompare(b.name));
        setAvailableStudents(studentList);
        setLoadingStudents(false);
        return;
      }

      // 2. Fallback enrollment query if getActiveStudents returned empty list
      let classKeys = [targetClassId];
      const targetClass = classes.find(c => c.id === targetClassId);
      if (targetClass?.name && !classKeys.includes(targetClass.name)) {
        classKeys.push(targetClass.name);
      }

      const enrollSnap = await getDocs(
        query(
          collection(db, 'enrollments'),
          where('academicYear', '==', yr)
        )
      );

      const matchedEnrollments = enrollSnap.docs
        .map(d => d.data())
        .filter((e: any) => classKeys.includes(e.classId) || classKeys.includes(e.className));

      const studentIds = Array.from(new Set(matchedEnrollments.map((e: any) => e.studentId).filter(Boolean)));

      if (studentIds.length > 0) {
        const fetchedStudents: StudentOption[] = [];
        const chunks = [];
        for (let i = 0; i < studentIds.length; i += 10) {
          chunks.push(studentIds.slice(i, i + 10));
        }

        for (const chunk of chunks) {
          const sq = query(collection(db, 'students'), where(documentId(), 'in', chunk));
          const sSnap = await getDocs(sq);
          sSnap.docs.forEach(doc => {
            const data = doc.data();
            fetchedStudents.push({
              id: doc.id,
              name: data.name || data.fullName || 'Siswa Tanpa Nama',
              classId: targetClassId,
              className: targetClass?.name || ''
            });
          });
        }

        if (fetchedStudents.length < studentIds.length) {
          const invSnap = await getDocs(query(collection(db, 'role_invites'), where('role', '==', 'STUDENT')));
          invSnap.docs.forEach(doc => {
            const data = doc.data();
            const sid = data.luminaId || doc.id;
            if (studentIds.includes(sid) && !fetchedStudents.some(s => s.id === sid)) {
              fetchedStudents.push({
                id: sid,
                name: data.name || data.fullName || 'Siswa Tanpa Nama',
                classId: targetClassId,
                className: targetClass?.name || ''
              });
            }
          });
        }

        fetchedStudents.sort((a, b) => a.name.localeCompare(b.name));
        setAvailableStudents(fetchedStudents);
      } else {
        setAvailableStudents([]);
      }
    } catch (err) {
      console.error('Error loading class roster:', err);
      setAvailableStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  }, [classes]);

  // Load Initial Data (Incident Reports, Logo, Signatory, & Active Junior High Classes)
  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Junior High Incident Reports, JH Logo, and JH Signatory Config
      const [allReports, fetchedLogo, fetchedSignatory] = await Promise.all([
        getJHIncidentReports(),
        getJHLogoUrl(),
        getJHSignatoryConfig()
      ]);
      setReports(allReports);
      setJhLogoUrl(fetchedLogo);
      setJhSignatory(fetchedSignatory);

      // 2. Fetch Junior High Classes for ACTIVE academic year ONLY
      const classesSnap = await getDocs(collection(db, 'classes'));
      const rawClasses = classesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const jhClasses = rawClasses.filter((c: any) => {
        const isJH = c.unitId === 'JUNIOR_HIGH' || c.unit === 'JUNIOR_HIGH';
        const isActiveYear = c.academicYear === activeYear;
        const isNotArchived = c.status !== 'archived' && c.status !== 'inactive';
        return isJH && isActiveYear && isNotArchived;
      });

      const classOptionList: ClassOption[] = jhClasses.map((c: any) => ({
        id: c.id,
        name: c.name || c.className || `Kelas ${c.grade || ''}`,
        academicYear: c.academicYear
      }));

      // Sort classes naturally
      classOptionList.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      setClasses(classOptionList);
    } catch (err) {
      console.error('Error loading incident reports data:', err);
      toast.error('Gagal memuat data Incident Report');
    } finally {
      setLoading(false);
    }
  }, [activeYear]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered Reports List (All Junior High staff can see ALL Junior High reports)
  const filteredReports = React.useMemo(() => {
    return reports.filter(r => {
      // Status tab filter
      if (statusFilter !== 'ALL' && r.status !== statusFilter) {
        return false;
      }

      // Text Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const studentName = (r.studentNameSnapshot || '').toLowerCase();
        const className = (r.classNameSnapshot || '').toLowerCase();
        const place = (r.incidentPlace || '').toLowerCase();
        const teacher = (r.teacherName || '').toLowerCase();
        return studentName.includes(q) || className.includes(q) || place.includes(q) || teacher.includes(q);
      }

      return true;
    });
  }, [reports, statusFilter, searchQuery]);

  // Open Form for Creating New Report
  const handleOpenNewForm = () => {
    setEditingReport(null);
    setFormData({
      studentId: '',
      studentNameSnapshot: '',
      classId: '',
      classNameSnapshot: '',
      academicYearId: activeYear,
      incidentDate: new Date().toISOString().split('T')[0],
      incidentTime: '',
      witnessesOrAdultsPresent: '',
      incidentPlace: '',
      incidentDescription: '',
      actionTreatmentTaken: '',
      childConditionFollowingIncident: '',
      suggestionNextTreatment: '',
    });
    setAvailableStudents([]);
    setIsFormOpen(true);
  };

  // Open Form for Editing Draft Report
  const handleOpenEditForm = (report: IncidentReport) => {
    if (report.status !== 'DRAFT') {
      toast.error('Laporan tidak dapat diedit karena sudah dikirim atau disetujui');
      return;
    }
    setEditingReport(report);
    const reportYear = report.academicYearId || activeYear;
    setFormData({
      studentId: report.studentId || '',
      studentNameSnapshot: report.studentNameSnapshot || '',
      classId: report.classId || '',
      classNameSnapshot: report.classNameSnapshot || '',
      academicYearId: reportYear,
      incidentDate: report.incidentDate || new Date().toISOString().split('T')[0],
      incidentTime: report.incidentTime || '',
      witnessesOrAdultsPresent: report.witnessesOrAdultsPresent || '',
      incidentPlace: report.incidentPlace || '',
      incidentDescription: report.incidentDescription || '',
      actionTreatmentTaken: report.actionTreatmentTaken || '',
      childConditionFollowingIncident: report.childConditionFollowingIncident || '',
      suggestionNextTreatment: report.suggestionNextTreatment || '',
    });
    if (report.classId) {
      loadStudentsForClass(report.classId, reportYear);
    } else {
      setAvailableStudents([]);
    }
    setIsFormOpen(true);
  };

  // Class selection handler
  const handleSelectClass = (classId: string) => {
    const selectedClass = classes.find(c => c.id === classId);
    if (selectedClass) {
      setFormData(prev => ({
        ...prev,
        classId: selectedClass.id,
        classNameSnapshot: selectedClass.name,
        studentId: '',
        studentNameSnapshot: '',
        academicYearId: activeYear
      }));
      loadStudentsForClass(selectedClass.id, activeYear);
    } else {
      setFormData(prev => ({
        ...prev,
        classId: '',
        classNameSnapshot: '',
        studentId: '',
        studentNameSnapshot: '',
        academicYearId: activeYear
      }));
      setAvailableStudents([]);
    }
  };

  // Student selection handler
  const handleSelectStudent = (studentId: string) => {
    const selected = availableStudents.find(s => s.id === studentId);
    if (selected) {
      setFormData(prev => ({
        ...prev,
        studentId: selected.id,
        studentNameSnapshot: selected.name,
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        studentId: '',
        studentNameSnapshot: '',
      }));
    }
  };

  // Save Report (as Draft or Direct Submission)
  const handleSaveReport = async (submitForApproval: boolean = false) => {
    // Validations
    if (!formData.classId) {
      toast.error('Silakan pilih kelas terlebih dahulu');
      return;
    }
    if (!formData.studentId) {
      toast.error('Silakan pilih nama siswa');
      return;
    }
    if (!formData.incidentDate) {
      toast.error('Silakan isi tanggal kejadian');
      return;
    }
    if (!formData.incidentPlace.trim()) {
      toast.error('Silakan isi lokasi kejadian');
      return;
    }
    if (!formData.incidentDescription.trim()) {
      toast.error('Silakan isi deskripsi kejadian');
      return;
    }
    if (!formData.actionTreatmentTaken.trim()) {
      toast.error('Silakan isi tindakan/penanganan yang diberikan');
      return;
    }
    if (!formData.childConditionFollowingIncident.trim()) {
      toast.error('Silakan isi kondisi anak setelah kejadian');
      return;
    }
    if (!formData.suggestionNextTreatment.trim()) {
      toast.error('Silakan isi saran penanganan selanjutnya');
      return;
    }

    setIsSaving(true);
    try {
      const reportPayload: Omit<IncidentReport, 'id'> = {
        unit: 'JUNIOR_HIGH',
        status: submitForApproval ? 'MENUNGGU_APPROVAL' : 'DRAFT',
        studentId: formData.studentId,
        studentNameSnapshot: formData.studentNameSnapshot,
        classId: formData.classId,
        classNameSnapshot: formData.classNameSnapshot,
        academicYearId: formData.academicYearId || activeYear,
        incidentDate: formData.incidentDate,
        incidentTime: formData.incidentTime || '',
        witnessesOrAdultsPresent: formData.witnessesOrAdultsPresent || '',
        incidentPlace: formData.incidentPlace.trim(),
        incidentDescription: formData.incidentDescription.trim(),
        actionTreatmentTaken: formData.actionTreatmentTaken.trim(),
        childConditionFollowingIncident: formData.childConditionFollowingIncident.trim(),
        suggestionNextTreatment: formData.suggestionNextTreatment.trim(),
        teacherId: currentUser?.uid || 'GURU_JH',
        teacherName: currentUser?.displayName || currentUser?.email || 'Guru Junior High',
        teacherSignatureUrl: currentUser?.signatureUrl || null,
        createdAt: editingReport?.createdAt || Date.now(),
        updatedAt: Date.now(),
        submittedAt: submitForApproval ? Date.now() : editingReport?.submittedAt,
      };

      if (editingReport?.id) {
        await updateJHIncidentReport(editingReport.id, reportPayload);
        toast.success(submitForApproval ? 'Incident Report dikirim untuk approval!' : 'Draft Incident Report berhasil diperbarui');
      } else {
        await createJHIncidentReport(reportPayload);
        toast.success(submitForApproval ? 'Incident Report berhasil dibuat dan dikirim untuk approval!' : 'Draft Incident Report berhasil disimpan');
      }

      setIsFormOpen(false);
      loadData();
    } catch (err) {
      console.error('Error saving incident report:', err);
      toast.error('Gagal menyimpan Incident Report');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Draft Report
  const handleDeleteReport = async () => {
    if (!confirmDeleteReport?.id) return;
    setIsSaving(true);
    try {
      await deleteJHIncidentReport(confirmDeleteReport.id);
      toast.success('Draft Incident Report berhasil dihapus');
      setConfirmDeleteReport(null);
      loadData();
    } catch (err) {
      console.error('Error deleting report:', err);
      toast.error('Gagal menghapus Incident Report');
    } finally {
      setIsSaving(false);
    }
  };

  // Submit Draft to Approval
  const handleSubmitForApproval = async () => {
    if (!confirmSubmitReport?.id) return;
    setIsSaving(true);
    try {
      await submitJHIncidentReport(confirmSubmitReport.id);
      toast.success('Incident Report berhasil dikirim untuk approval');
      setConfirmSubmitReport(null);
      loadData();
    } catch (err) {
      console.error('Error submitting report:', err);
      toast.error('Gagal mengirim Incident Report');
    } finally {
      setIsSaving(false);
    }
  };

  // Approve Incident Report (Head Unit / Principal)
  const handleApproveReport = async () => {
    if (!confirmApproveReport?.id || !currentUser) return;

    // Security check: regular teacher cannot approve reports
    if (!isHeadUnit) {
      toast.error('Hanya Kepala Unit / Principal Junior High yang dapat menyetujui Incident Report');
      return;
    }

    setIsApproving(true);
    try {
      await approveJHIncidentReport(
        confirmApproveReport.id,
        currentUser.uid,
        currentUser.displayName || currentUser.name || currentUser.email || 'Kepala Unit Junior High'
      );
      toast.success('Incident Report berhasil disetujui (APPROVED)');
      setConfirmApproveReport(null);
      setViewingReport(null);
      loadData();
    } catch (err) {
      console.error('Error approving report:', err);
      toast.error('Gagal menyetujui Incident Report');
    } finally {
      setIsApproving(false);
    }
  };

  // Download PDF Handler
  const handleDownloadPdf = async (report: IncidentReport) => {
    if (report.status !== 'APPROVED') {
      toast.error('PDF resmi hanya dapat diunduh jika status report adalah APPROVED');
      return;
    }

    // Verify presence of logo and principal signature
    const logoToUse = jhLogoUrl;
    const signatureToUse = report.principalSignatureUrl || jhSignatory?.principalSignatureUrl;

    if (!logoToUse) {
      toast.error('Gagal mengunduh PDF: Logo Junior High belum diatur di Lumina Admin → Logo.');
      return;
    }

    if (!signatureToUse) {
      toast.error('Gagal mengunduh PDF: Tanda tangan Principal belum diatur di Settings → Report Config → JH Signatory.');
      return;
    }

    setViewingReport(report);
    setIsDownloadingPdf(true);

    try {
      const htInfo = await getHomeroomTeacherForClass(report.classId, report.classNameSnapshot);
      setHomeroomTeacherInfo(htInfo);

      // Wait for React to render the printable DOM element
      await new Promise(resolve => setTimeout(resolve, 350));

      if (!pdfPrintRef.current) {
        throw new Error('Element PDF tidak ditemukan');
      }

      const canvas = await html2canvasWithModernColors(pdfPrintRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: 794,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, Math.min(imgHeight, pageHeight));

      const cleanStudentName = (report.studentNameSnapshot || 'Siswa').replace(/\s+/g, '_');
      const cleanDate = (report.incidentDate || 'Tanggal').replace(/\-/g, '');
      const fileName = `Incident_Report_${cleanStudentName}_${cleanDate}.pdf`;

      pdf.save(fileName);
      toast.success('PDF Incident Report berhasil diunduh');
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast.error('Gagal mengunduh PDF Incident Report');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const teacherDisplayName = 
    homeroomTeacherInfo?.name || 
    (viewingReport?.teacherName && viewingReport.teacherName !== 'Guru Junior High' ? viewingReport.teacherName : '') || 
    'Wali Kelas';

  const teacherSignature = homeroomTeacherInfo?.signatureUrl || null;

  return (
    <div className="space-y-6 pb-12 font-sans">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-800 text-white p-6 sm:p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-blue-500/30 text-blue-100 border border-blue-400/30">
                Daily Notes • Junior High
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black italic tracking-tight font-sans">
              Incident Report Form
            </h1>
            <p className="text-xs text-blue-100/80 font-medium max-w-xl leading-relaxed">
              Pencatatan resmi kejadian khusus/insiden siswa Lazuardi Junior High.
              Dibuat oleh guru, diverifikasi oleh Kepala Unit, dan dapat diunduh sebagai dokumen PDF resmi.
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenNewForm}
            className="flex items-center gap-2 bg-white text-blue-900 hover:bg-blue-50 font-black text-xs px-5 py-3 rounded-2xl shadow-lg transition-all cursor-pointer border border-blue-100"
          >
            <Plus size={16} />
            <span>Buat Incident Report</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-gray-150 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-gray-100/70 p-1.5 rounded-2xl border border-gray-200">
          {[
            { id: 'ALL', label: 'Semua' },
            { id: 'DRAFT', label: 'Draft' },
            { id: 'MENUNGGU_APPROVAL', label: 'Menunggu Approval' },
            { id: 'APPROVED', label: 'Approved' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer font-sans",
                statusFilter === tab.id
                  ? "bg-white text-blue-700 shadow-xs border border-gray-200/80 font-black"
                  : "text-gray-500 hover:text-gray-800 hover:bg-white/50"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Text Search Box */}
        <div className="relative w-full md:w-72">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cari nama siswa, kelas, lokasi..."
            className="w-full bg-gray-50 hover:bg-white focus:bg-white border border-gray-200 focus:border-blue-500 rounded-2xl pl-10 pr-4 py-2 text-xs font-bold text-gray-750 outline-none transition-all placeholder:text-gray-400 font-sans"
          />
        </div>
      </div>

      {/* Reports Table List */}
      <div className="bg-white rounded-3xl border border-gray-150 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <Loader2 size={28} className="animate-spin text-blue-600 mx-auto" />
            <p className="text-xs font-bold text-gray-400 font-sans">Memuat Incident Report...</p>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="py-16 text-center space-y-3 px-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mx-auto">
              <FileText size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-black text-gray-700 font-sans">Belum Ada Incident Report</h3>
              <p className="text-xs text-gray-400 font-medium max-w-sm mx-auto font-sans leading-relaxed">
                {statusFilter !== 'ALL' 
                  ? `Tidak ada laporan dengan status ${statusFilter}.`
                  : 'Belum ada catat insiden yang dibuat. Klik tombol "Buat Incident Report" untuk memulai.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-150 text-[10px] font-black uppercase tracking-wider text-gray-400 font-sans">
                  <th className="py-3.5 px-4 font-bold">Tanggal Kejadian</th>
                  <th className="py-3.5 px-4 font-bold">Nama Siswa</th>
                  <th className="py-3.5 px-4 font-bold">Kelas</th>
                  <th className="py-3.5 px-4 font-bold">Lokasi</th>
                  <th className="py-3.5 px-4 font-bold">Dibuat Oleh</th>
                  <th className="py-3.5 px-4 font-bold">Status</th>
                  <th className="py-3.5 px-4 font-bold">Terakhir Diperbarui</th>
                  <th className="py-3.5 px-4 font-bold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs font-sans text-gray-700">
                {filteredReports.map(report => {
                  const isOwner = report.teacherId === currentUser?.uid;

                  return (
                    <tr key={report.id} className="hover:bg-blue-50/20 transition-colors">
                      {/* Tanggal Kejadian */}
                      <td className="py-4 px-4 font-bold text-gray-800 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-gray-400 shrink-0" />
                          <span>{report.incidentDate}</span>
                          {report.incidentTime && (
                            <span className="text-[10px] text-gray-400 font-mono bg-gray-100 px-1.5 py-0.5 rounded-md">
                              {report.incidentTime}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Nama Siswa */}
                      <td className="py-4 px-4 font-black text-gray-900">
                        {report.studentNameSnapshot}
                      </td>

                      {/* Kelas */}
                      <td className="py-4 px-4 font-bold text-gray-600">
                        <span className="px-2 py-0.5 rounded-md bg-gray-100 text-[11px]">
                          {report.classNameSnapshot}
                        </span>
                      </td>

                      {/* Lokasi */}
                      <td className="py-4 px-4 font-medium text-gray-600 max-w-[160px] truncate">
                        <div className="flex items-center gap-1">
                          <MapPin size={12} className="text-gray-400 shrink-0" />
                          <span className="truncate">{report.incidentPlace}</span>
                        </div>
                      </td>

                      {/* Dibuat Oleh */}
                      <td className="py-4 px-4 font-medium text-gray-600">
                        {report.teacherName}
                      </td>

                      {/* Status Badge */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        {report.status === 'DRAFT' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock size={11} />
                            Draft
                          </span>
                        )}
                        {report.status === 'MENUNGGU_APPROVAL' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                            <Send size={11} />
                            Menunggu Approval
                          </span>
                        )}
                        {report.status === 'APPROVED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={11} />
                            Approved
                          </span>
                        )}
                      </td>

                      {/* Terakhir Diperbarui */}
                      <td className="py-4 px-4 text-gray-400 text-[11px] font-mono whitespace-nowrap">
                        {new Date(report.updatedAt).toLocaleString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>

                      {/* Aksi */}
                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          
                          {/* DRAFT ACTIONS */}
                          {report.status === 'DRAFT' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenEditForm(report)}
                                className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all cursor-pointer"
                                title="Edit Draft"
                              >
                                <Edit3 size={15} />
                              </button>

                              <button
                                type="button"
                                onClick={() => setConfirmSubmitReport(report)}
                                className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-100/60 rounded-xl transition-all cursor-pointer"
                                title="Kirim untuk Approval"
                              >
                                <Send size={15} />
                              </button>

                              <button
                                type="button"
                                onClick={() => setConfirmDeleteReport(report)}
                                className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                                title="Hapus Draft"
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}

                          {/* MENUNGGU APPROVAL ACTIONS */}
                          {report.status === 'MENUNGGU_APPROVAL' && (
                            <>
                              <button
                                type="button"
                                onClick={() => setViewingReport(report)}
                                className="flex items-center gap-1 text-xs font-black text-gray-600 hover:text-blue-600 bg-gray-100 hover:bg-blue-50 px-2.5 py-1.5 rounded-xl transition-all cursor-pointer"
                              >
                                <Eye size={14} />
                                <span>Lihat</span>
                              </button>

                              {(isHeadUnit || isSuperAdmin) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setViewingReport(report);
                                    setConfirmApproveReport(report);
                                  }}
                                  className="flex items-center gap-1 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-xl transition-all cursor-pointer shadow-xs"
                                >
                                  <ShieldCheck size={14} />
                                  <span>Approve</span>
                                </button>
                              )}
                            </>
                          )}

                          {/* APPROVED ACTIONS */}
                          {report.status === 'APPROVED' && (
                            <>
                              <button
                                type="button"
                                onClick={() => setViewingReport(report)}
                                className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all cursor-pointer"
                                title="Lihat Detail"
                              >
                                <Eye size={15} />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDownloadPdf(report)}
                                className="flex items-center gap-1 text-xs font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                                title="Download PDF Resmi"
                              >
                                <Download size={14} />
                                <span>Download PDF</span>
                              </button>
                            </>
                          )}

                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* MODAL 1: CREATE / EDIT INCIDENT REPORT FORM */}
      {/* ========================================================= */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl border border-gray-100 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
            
            {/* Form Header */}
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-6 sm:p-7 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-200 block">
                  LAZUARDI JUNIOR HIGH
                </span>
                <h2 className="text-xl font-black italic font-sans">
                  {editingReport ? 'Edit Incident Report' : 'Incident Report Form'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form Body */}
            <div className="p-6 sm:p-8 space-y-6 max-h-[75vh] overflow-y-auto text-xs font-sans">
              
              {/* Field 1 & 2 Grid: Class and Student */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Field 1: Class (Kelas) */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-gray-600 block">
                    1. Class (Kelas) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.classId}
                    onChange={e => handleSelectClass(e.target.value)}
                    className="w-full p-3.5 bg-gray-50 hover:bg-gray-100/60 focus:bg-white border border-gray-250 focus:border-blue-500 rounded-2xl font-bold text-gray-800 outline-none transition-all font-sans"
                  >
                    <option value="">-- Pilih Kelas Junior High --</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Field 2: Name (Nama Siswa) */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-gray-600 block">
                    2. Name (Nama Siswa) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.studentId}
                    disabled={(!formData.classId && !formData.classNameSnapshot) || loadingStudents}
                    onChange={e => handleSelectStudent(e.target.value)}
                    className="w-full p-3.5 bg-gray-50 hover:bg-gray-100/60 focus:bg-white border border-gray-250 focus:border-blue-500 rounded-2xl font-bold text-gray-800 outline-none transition-all font-sans disabled:opacity-50 disabled:bg-gray-100"
                  >
                    {!formData.classId && !formData.classNameSnapshot ? (
                      <option value="">-- Pilih Kelas Terlebih Dahulu --</option>
                    ) : loadingStudents ? (
                      <option value="">-- Memuat Daftar Siswa... --</option>
                    ) : availableStudents.length === 0 ? (
                      <option value="">-- Tidak Ada Siswa Aktif di Kelas Ini --</option>
                    ) : (
                      <>
                        <option value="">-- Pilih Siswa ({availableStudents.length} Siswa) --</option>
                        {availableStudents.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>

              </div>

              {/* Selection Summary Badge */}
              {formData.studentNameSnapshot && (
                <div className="p-3 bg-blue-50/70 border border-blue-200/60 rounded-2xl text-[11px] text-blue-800 font-bold flex items-center justify-between">
                  <span>
                    Siswa Terpilih: <span className="underline font-black">{formData.studentNameSnapshot}</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-900 font-black">
                    Kelas: {formData.classNameSnapshot}
                  </span>
                </div>
              )}

              {/* Field 3 & 4 Grid: Date/Time & Place */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Field 3: Day / Date of Incident */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-gray-600 block">
                    3. Day / Date of Incident <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={formData.incidentDate}
                      onChange={e => setFormData(prev => ({ ...prev, incidentDate: e.target.value }))}
                      className="w-full p-3 bg-gray-50 border border-gray-250 focus:border-blue-500 rounded-2xl font-bold text-gray-800 outline-none font-sans"
                    />
                    <input
                      type="time"
                      value={formData.incidentTime}
                      onChange={e => setFormData(prev => ({ ...prev, incidentTime: e.target.value }))}
                      placeholder="Jam"
                      className="w-28 p-3 bg-gray-50 border border-gray-250 focus:border-blue-500 rounded-2xl font-bold text-gray-800 outline-none font-sans"
                    />
                  </div>
                </div>

                {/* Field 4: Place Incident Occurred */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-gray-600 block">
                    4. Place Incident Occurred <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.incidentPlace}
                    onChange={e => setFormData(prev => ({ ...prev, incidentPlace: e.target.value }))}
                    placeholder="Contoh: Lapangan Basket, Kelas 8A, Kantin..."
                    className="w-full p-3.5 bg-gray-50 border border-gray-250 focus:border-blue-500 rounded-2xl font-bold text-gray-800 outline-none font-sans"
                  />
                </div>

              </div>

              {/* Field 5: Name of Witness / Adults Present */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-gray-600 block">
                  5. Name of Witness / Adults Present (Opsional)
                </label>
                <input
                  type="text"
                  value={formData.witnessesOrAdultsPresent}
                  onChange={e => setFormData(prev => ({ ...prev, witnessesOrAdultsPresent: e.target.value }))}
                  placeholder="Tuliskan nama saksi atau guru/orang dewasa yang berada di lokasi..."
                  className="w-full p-3.5 bg-gray-50 border border-gray-250 focus:border-blue-500 rounded-2xl font-bold text-gray-800 outline-none font-sans"
                />
              </div>

              {/* Field 6: Description of the Incident */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-gray-600 block">
                  6. Description of the Incident <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={formData.incidentDescription}
                  onChange={e => setFormData(prev => ({ ...prev, incidentDescription: e.target.value }))}
                  placeholder="Tuliskan deskripsi kronologi insiden..."
                  className="w-full p-3.5 bg-gray-50 border border-gray-250 focus:border-blue-500 rounded-2xl font-medium text-gray-800 outline-none font-sans leading-relaxed"
                />
                <p className="text-[10px] text-gray-400 italic font-sans">
                  Helper text: Tuliskan kronologi secara faktual, jelas, dan objektif.
                </p>
              </div>

              {/* Field 7: Action / Treatment Taken */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-gray-600 block">
                  7. Action / Treatment Taken <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={formData.actionTreatmentTaken}
                  onChange={e => setFormData(prev => ({ ...prev, actionTreatmentTaken: e.target.value }))}
                  placeholder="Tindakan atau penanganan pertama yang langsung dilakukan..."
                  className="w-full p-3.5 bg-gray-50 border border-gray-250 focus:border-blue-500 rounded-2xl font-medium text-gray-800 outline-none font-sans leading-relaxed"
                />
              </div>

              {/* Field 8: Condition of the Child Following the Incident */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-gray-600 block">
                  8. Condition of the Child Following the Incident <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={formData.childConditionFollowingIncident}
                  onChange={e => setFormData(prev => ({ ...prev, childConditionFollowingIncident: e.target.value }))}
                  placeholder="Kondisi fisik, emosional, atau medis anak setelah tindakan..."
                  className="w-full p-3.5 bg-gray-50 border border-gray-250 focus:border-blue-500 rounded-2xl font-medium text-gray-800 outline-none font-sans leading-relaxed"
                />
              </div>

              {/* Field 9: Suggestion for Next Treatment */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase tracking-wider text-gray-600 block">
                  9. Suggestion for Next Treatment <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={formData.suggestionNextTreatment}
                  onChange={e => setFormData(prev => ({ ...prev, suggestionNextTreatment: e.target.value }))}
                  placeholder="Saran tidak lanjut, konseling, pemantauan, atau tindak lanjut dengan wali murid..."
                  className="w-full p-3.5 bg-gray-50 border border-gray-250 focus:border-blue-500 rounded-2xl font-medium text-gray-800 outline-none font-sans leading-relaxed"
                />
              </div>

              {/* Field 10 & 11 Grid: Teacher & Principal */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-black uppercase text-blue-600 tracking-wider block">10. Teacher (Guru Pembuat)</span>
                  <p className="font-extrabold text-gray-800">
                    {editingReport ? editingReport.teacherName : (currentUser?.displayName || currentUser?.email || 'Guru Junior High')}
                  </p>
                  <p className="text-[10px] text-gray-400">Pembuat laporan ini</p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-black uppercase text-blue-600 tracking-wider block">11. Principal / Kepala Unit</span>
                  <p className="font-extrabold text-gray-500 italic">
                    {editingReport?.approvedByName ? editingReport.approvedByName : 'Otomatis terisi saat diapprove Kepala Unit'}
                  </p>
                  <p className="text-[10px] text-gray-400">Approver laporan</p>
                </div>
              </div>

            </div>

            {/* Form Footer Action Buttons */}
            <div className="p-6 bg-gray-50 border-t border-gray-150 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-extrabold text-xs hover:bg-gray-100 cursor-pointer"
              >
                Batal
              </button>

              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveReport(false)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 font-extrabold text-xs cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
                <span>Simpan Draft</span>
              </button>

              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveReport(true)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                <span>Kirim untuk Approval</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: VIEW REPORT DETAILS & HEAD UNIT APPROVAL */}
      {/* ========================================================= */}
      {viewingReport && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl border border-gray-100 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
            
            {/* Detail Header */}
            <div className="bg-slate-900 text-white p-6 sm:p-7 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                    LAZUARDI GCS JUNIOR HIGH
                  </span>
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                    viewingReport.status === 'APPROVED' ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/30" : "bg-blue-500/20 text-blue-300 border-blue-400/30"
                  )}>
                    {viewingReport.status}
                  </span>
                </div>
                <h2 className="text-xl font-black italic font-sans mt-0.5">
                  Incident Report Detail
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setViewingReport(null)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Read-Only Form Fields */}
            <div className="p-6 sm:p-8 space-y-6 max-h-[75vh] overflow-y-auto text-xs font-sans">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-200">
                <div>
                  <span className="text-[10px] font-black uppercase text-gray-400 block">Siswa</span>
                  <p className="text-sm font-black text-gray-900">{viewingReport.studentNameSnapshot}</p>
                  <p className="text-xs text-gray-500 font-bold">Kelas: {viewingReport.classNameSnapshot}</p>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-gray-400 block">Waktu & Tempat Incident</span>
                  <p className="text-sm font-black text-gray-900">
                    {viewingReport.incidentDate} {viewingReport.incidentTime ? `(${viewingReport.incidentTime})` : ''}
                  </p>
                  <p className="text-xs text-gray-600 font-medium">Lokasi: {viewingReport.incidentPlace}</p>
                </div>
              </div>

              {viewingReport.witnessesOrAdultsPresent && (
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase text-gray-400 block">Name of Witness / Adults Present</span>
                  <p className="p-3 bg-gray-50 rounded-xl font-bold text-gray-800">{viewingReport.witnessesOrAdultsPresent}</p>
                </div>
              )}

              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase text-gray-400 block">Description of the Incident</span>
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 text-gray-800 leading-relaxed font-medium whitespace-pre-wrap">
                  {viewingReport.incidentDescription}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase text-gray-400 block">Action / Treatment Taken</span>
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 text-gray-800 leading-relaxed font-medium whitespace-pre-wrap">
                  {viewingReport.actionTreatmentTaken}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase text-gray-400 block">Condition of the Child Following the Incident</span>
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 text-gray-800 leading-relaxed font-medium whitespace-pre-wrap">
                  {viewingReport.childConditionFollowingIncident}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase text-gray-400 block">Suggestion for Next Treatment</span>
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 text-gray-800 leading-relaxed font-medium whitespace-pre-wrap">
                  {viewingReport.suggestionNextTreatment}
                </div>
              </div>

              {/* Signatures & Approvals View */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                <div className="p-4 bg-blue-50/40 rounded-2xl border border-blue-100 space-y-2">
                  <span className="text-[10px] font-black uppercase text-blue-600 block">Wali Kelas / Guru Kelas</span>
                  <p className="font-extrabold text-gray-900">{teacherDisplayName}</p>
                  {teacherSignature ? (
                    <img src={teacherSignature} alt="Teacher Signature" className="h-12 object-contain" />
                  ) : (
                    <p className="text-[11px] text-gray-400 italic">Nama Wali Kelas (Tanpa Tanda Tangan)</p>
                  )}
                  <p className="text-[10px] text-gray-400">
                    Dibuat pada: {new Date(viewingReport.createdAt).toLocaleString('id-ID')}
                  </p>
                </div>

                <div className="p-4 bg-purple-50/40 rounded-2xl border border-purple-100 space-y-2">
                  <span className="text-[10px] font-black uppercase text-purple-600 block">Principal / Kepala Unit</span>
                  {viewingReport.status === 'APPROVED' ? (
                    <>
                      <p className="font-extrabold text-gray-900">{viewingReport.approvedByName || 'Kepala Unit'}</p>
                      {viewingReport.principalSignatureUrl ? (
                        <img src={viewingReport.principalSignatureUrl} alt="Principal Signature" className="h-12 object-contain" />
                      ) : (
                        <p className="text-[11px] text-gray-400 italic">Nama Kepala Unit</p>
                      )}
                      <p className="text-[10px] text-gray-400">
                        Approved: {viewingReport.approvedAt ? new Date(viewingReport.approvedAt).toLocaleString('id-ID') : '-'}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-amber-700 font-bold italic pt-2">
                      Belum Di-approve (Menunggu Persetujuan Kepala Unit)
                    </p>
                  )}
                </div>
              </div>

            </div>

            {/* Modal Footer Actions */}
            <div className="p-6 bg-gray-50 border-t border-gray-150 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setViewingReport(null)}
                className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-extrabold text-xs hover:bg-gray-100 cursor-pointer"
              >
                Tutup
              </button>

              <div className="flex items-center gap-2">
                {/* APPROVAL BUTTON FOR HEAD UNIT */}
                {viewingReport.status === 'MENUNGGU_APPROVAL' && (isHeadUnit || isSuperAdmin) && (
                  <button
                    type="button"
                    onClick={() => setConfirmApproveReport(viewingReport)}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md cursor-pointer"
                  >
                    <ShieldCheck size={16} />
                    <span>Approve Incident Report</span>
                  </button>
                )}

                {/* DOWNLOAD PDF BUTTON */}
                {viewingReport.status === 'APPROVED' && (
                  <button
                    type="button"
                    disabled={isDownloadingPdf}
                    onClick={() => handleDownloadPdf(viewingReport)}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {isDownloadingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    <span>Download PDF Resmi</span>
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* CONFIRMATION MODAL: APPROVE INCIDENT REPORT */}
      {/* ========================================================= */}
      {confirmApproveReport && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h3 className="text-base font-black text-gray-900 font-sans">Konfirmasi Approval</h3>
                <p className="text-xs text-gray-400 font-bold">Lazuardi Junior High</p>
              </div>
            </div>

            <p className="text-xs text-gray-700 font-medium leading-relaxed font-sans bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
              Setujui Incident Report ini? Setelah disetujui, laporan akan dikunci dan PDF resmi dapat diunduh.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmApproveReport(null)}
                className="px-4 py-2 rounded-xl text-xs font-extrabold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isApproving}
                onClick={handleApproveReport}
                className="flex items-center gap-1 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md cursor-pointer disabled:opacity-50"
              >
                {isApproving ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                <span>Setujui (Approve)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* CONFIRMATION MODAL: SUBMIT FOR APPROVAL */}
      {/* ========================================================= */}
      {confirmSubmitReport && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <Send size={20} />
              </div>
              <div>
                <h3 className="text-base font-black text-gray-900 font-sans">Kirim untuk Approval</h3>
                <p className="text-xs text-gray-400 font-bold">Siswa: {confirmSubmitReport.studentNameSnapshot}</p>
              </div>
            </div>

            <p className="text-xs text-gray-700 font-medium leading-relaxed font-sans">
              Kirim laporan ini ke Kepala Unit? Setelah dikirim, Anda tidak dapat mengedit isi laporan kecuali dikembalikan oleh Kepala Unit.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSubmitReport(null)}
                className="px-4 py-2 rounded-xl text-xs font-extrabold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSubmitForApproval}
                className="flex items-center gap-1 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                <span>Ya, Kirim</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* CONFIRMATION MODAL: DELETE DRAFT */}
      {/* ========================================================= */}
      {confirmDeleteReport && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-black text-gray-900 font-sans">Hapus Draft</h3>
                <p className="text-xs text-gray-400 font-bold">Siswa: {confirmDeleteReport.studentNameSnapshot}</p>
              </div>
            </div>

            <p className="text-xs text-gray-700 font-medium leading-relaxed font-sans">
              Apakah Anda yakin ingin menghapus draft Incident Report ini? Tindakan ini tidak dapat dibatalkan.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteReport(null)}
                className="px-4 py-2 rounded-xl text-xs font-extrabold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleDeleteReport}
                className="flex items-center gap-1 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                <span>Hapus</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* HIDDEN PRINTABLE DOM TEMPLATE FOR A4 PDF GENERATION */}
      {/* ========================================================= */}
      {viewingReport && (
        <div className="fixed left-[-9999px] top-[-9999px] pointer-events-none">
          <div
            ref={pdfPrintRef}
            className="w-[794px] min-h-[1123px] bg-white p-10 font-sans text-gray-900 space-y-6 border border-gray-200"
            style={{ width: '794px', boxSizing: 'border-box' }}
          >
            {/* Template Header */}
            <div className="border-b-2 border-slate-900 pb-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {jhLogoUrl ? (
                  <img src={jhLogoUrl} alt="Lazuardi GCS Junior High School Logo" className="h-16 max-w-[220px] object-contain" />
                ) : (
                  <LuminaLogo size="lg" />
                )}
                <div className="space-y-0.5">
                  <h1 className="text-xl font-black italic tracking-tight text-slate-900 uppercase">
                    LAZUARDI GCS JUNIOR HIGH
                  </h1>
                  <h2 className="text-base font-extrabold text-blue-700 uppercase tracking-wider">
                    Incident Report Form
                  </h2>
                  <p className="text-[10px] text-gray-500 font-medium">
                    Official Student Incident Documentation • Confidential Record
                  </p>
                </div>
              </div>
              <div className="text-right space-y-1">
                <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-black uppercase tracking-wider">
                  APPROVED
                </span>
              </div>
            </div>

            {/* 2-Column Incident Form Grid */}
            <div className="border border-slate-300 rounded-xl overflow-hidden divide-y divide-slate-300 text-xs">
              
              {/* Row 1: Name | Day/date of incident */}
              <div className="grid grid-cols-2 divide-x divide-slate-300 bg-gray-50/50">
                <div className="p-3.5 space-y-1">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">Name</span>
                  <p className="text-sm font-black text-slate-900">{viewingReport.studentNameSnapshot}</p>
                  <p className="text-[11px] text-slate-600 font-bold">Class: {viewingReport.classNameSnapshot}</p>
                </div>
                <div className="p-3.5 space-y-1">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">Day / Date of the Incident</span>
                  <p className="text-sm font-black text-slate-900">
                    {viewingReport.incidentDate} {viewingReport.incidentTime ? `(${viewingReport.incidentTime})` : ''}
                  </p>
                </div>
              </div>

              {/* Row 2: Witness | Place */}
              <div className="grid grid-cols-2 divide-x divide-slate-300">
                <div className="p-3.5 space-y-1">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">Name of Witness / Adults Present</span>
                  <p className="font-bold text-slate-800">
                    {viewingReport.witnessesOrAdultsPresent || '-'}
                  </p>
                </div>
                <div className="p-3.5 space-y-1">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">Place Incident Occurred</span>
                  <p className="font-bold text-slate-900">{viewingReport.incidentPlace}</p>
                </div>
              </div>

              {/* Row 3: Description | Action taken */}
              <div className="grid grid-cols-2 divide-x divide-slate-300">
                <div className="p-3.5 space-y-1.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">Description of the Incident</span>
                  <p className="text-slate-800 leading-relaxed font-normal whitespace-pre-wrap">
                    {viewingReport.incidentDescription}
                  </p>
                </div>
                <div className="p-3.5 space-y-1.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">Action / Treatment Taken</span>
                  <p className="text-slate-800 leading-relaxed font-normal whitespace-pre-wrap">
                    {viewingReport.actionTreatmentTaken}
                  </p>
                </div>
              </div>

              {/* Row 4: Condition | Suggestion */}
              <div className="grid grid-cols-2 divide-x divide-slate-300">
                <div className="p-3.5 space-y-1.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">Condition of Child Following Incident</span>
                  <p className="text-slate-800 leading-relaxed font-normal whitespace-pre-wrap">
                    {viewingReport.childConditionFollowingIncident}
                  </p>
                </div>
                <div className="p-3.5 space-y-1.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">Suggestion for Next Treatment</span>
                  <p className="text-slate-800 leading-relaxed font-normal whitespace-pre-wrap">
                    {viewingReport.suggestionNextTreatment}
                  </p>
                </div>
              </div>

            </div>

            {/* Bottom Signatures Section */}
            <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-200 text-xs">
              
              {/* Teacher Signature Box */}
              <div className="text-center space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Teacher</span>
                <div className="h-20 flex items-center justify-center">
                  {teacherSignature ? (
                    <img src={teacherSignature} alt="Teacher Signature" className="max-h-16 object-contain" />
                  ) : null}
                </div>
                <div className="border-t border-slate-400 pt-1">
                  <p className="font-extrabold text-slate-900">{teacherDisplayName}</p>
                  <p className="text-[10px] text-gray-500">
                    Date: {new Date(viewingReport.submittedAt || viewingReport.createdAt).toLocaleDateString('id-ID')}
                  </p>
                </div>
              </div>

              {/* Principal / Kepala Unit Signature Box */}
              <div className="text-center space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                  {viewingReport.principalTitle || jhSignatory?.principalTitle || 'Principal'}
                </span>
                <div className="h-20 flex items-center justify-center">
                  {(viewingReport.principalSignatureUrl || jhSignatory?.principalSignatureUrl) ? (
                    <img 
                      src={viewingReport.principalSignatureUrl || jhSignatory?.principalSignatureUrl!} 
                      alt="Principal Signature" 
                      className="max-h-16 object-contain" 
                    />
                  ) : null}
                </div>
                <div className="border-t border-slate-400 pt-1">
                  <p className="font-extrabold text-slate-900">
                    {viewingReport.approvedByName || jhSignatory?.principalName || 'Kepala Unit Junior High'}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    Approved: {viewingReport.approvedAt ? new Date(viewingReport.approvedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}
                  </p>
                </div>
              </div>

            </div>

            {/* Confidentiality Footer */}
            <div className="pt-6 text-center text-[9px] text-gray-400 border-t border-gray-100">
              Lazuardi GCS Junior High • Incident Report Document • Confidential internal record for school leadership and parents.
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
