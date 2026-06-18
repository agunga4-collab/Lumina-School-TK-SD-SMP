import * as React from "react";
import { useState, useEffect } from "react";
import {
  Search,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  Brain,
  Users,
  Plus,
  Info,
  Save,
  Check,
  GraduationCap
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  getStudentsByClass,
  getMTSSAcademicCases,
  getClasses,
  getTier1Assessments,
  saveTier1Assessment,
  addMTSSAcademicCase
} from "../../lib/firebase";
import {
  Student,
  MTSSAcademicCase,
  Class,
  MTSSAcademicDomain
} from "../../types";
import { toast } from "sonner";

interface RouteModalProps {
  onClose: () => void;
  student: Student;
  domain: 'NUMERACY' | 'BAHASA_INDONESIA' | 'ENGLISH';
  onSubmit: (notes: string) => Promise<void>;
  isSubmitting: boolean;
}

function RouteToTier2Modal({ onClose, student, domain, onSubmit, isSubmitting }: RouteModalProps) {
  const [notes, setNotes] = useState("");
  const domainLabel = domain === 'NUMERACY' ? 'Math / Numeracy' : domain === 'BAHASA_INDONESIA' ? 'Bahasa Indonesia Literacy' : 'English Literacy';

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) {
      toast.error("Please provide custom observations / primary concerns.");
      return;
    }
    onSubmit(notes);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-100"
      >
        <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-lg font-black text-slate-900">Route to Tier 2 Intervention</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5 font-mono">{student.name}</p>
          </div>
          <button onClick={onClose} className="p-1 px-3 hover:bg-slate-100 rounded-xl text-slate-400 text-lg font-bold">×</button>
        </div>

        <form onSubmit={handleFormSubmit} className="p-8 space-y-5">
          <div className="bg-rose-50 border border-rose-100/60 rounded-2xl p-4 flex gap-3 text-rose-800">
            <AlertTriangle className="shrink-0 mt-0.5 text-rose-600" size={18} />
            <div className="text-xs leading-relaxed font-medium">
              This student has been diagnosed for <span className="font-bold">{domainLabel}</span> support because both AAP and Tier 1 Test Out scores are below the 70 threshold. Routing will launch a formal Tier 2 case tracking profile.
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2 font-mono">
              Primary Concern / Assessment Notes <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe observations, specific skill deficits (e.g., struggles with reading comprehension, word problems, fraction conversions)..."
              className="w-full p-4 bg-slate-50/50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 outline-none transition-all resize-none text-sm placeholder:text-slate-400 font-medium"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-bold text-xs uppercase tracking-widest transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-[2] px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 font-bold text-xs uppercase tracking-widest shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Launch Tier 2 Case"
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default function Screening() {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const { filters } = useOutletContext<{ filters: any }>();

  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [cases, setCases] = useState<MTSSAcademicCase[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [assessmentData, setAssessmentData] = useState<any[]>([]);

  // Local state for assessment inputs currently being edited
  const [draftScores, setDraftScores] = useState<{ [studentId: string]: any }>({});
  const [savingRows, setSavingRows] = useState<{ [studentId: string]: boolean }>({});
  const [savedStatus, setSavedStatus] = useState<{ [studentId: string]: boolean }>({});

  // Route to tier 2 modal state
  const [routingModal, setRoutingModal] = useState<{ student: Student; domain: 'NUMERACY' | 'BAHASA_INDONESIA' | 'ENGLISH' } | null>(null);
  const [routingSubmitting, setRoutingSubmitting] = useState(false);

  useEffect(() => {
    fetchClassroomAndCaseMetadata();
  }, [filters.academicYear, filters.semester]);

  useEffect(() => {
    if (selectedClassId) {
      loadTier1Data();
    } else {
      setDraftScores({});
    }
  }, [selectedClassId, filters.academicYear, filters.semester]);

  const fetchClassroomAndCaseMetadata = async () => {
    setLoading(true);
    try {
      const [allClasses, allCases] = await Promise.all([
        getClasses(),
        getMTSSAcademicCases({ academicYear: filters.academicYear, semester: filters.semester })
      ]);

      const jhClasses = allClasses.filter(c => c.unitId === 'JUNIOR_HIGH' && c.academicYear === filters.academicYear);
      setClasses(jhClasses);
      setCases(allCases || []);

      // Pre-select first class if available
      if (jhClasses.length > 0) {
        const isValidPreselect = jhClasses.some(c => c.id === selectedClassId);
        if (!selectedClassId || !isValidPreselect) {
          setSelectedClassId(jhClasses[0].id);
        } else {
          // If already validly set but we're reloading context, force refresh the students
          loadTier1Data();
        }
      } else {
        setSelectedClassId("");
        setStudents([]);
      }
    } catch (err) {
      console.error("Error fetching class/case metadata:", err);
      toast.error("Failed to load metadata. Please refresh.");
    } finally {
      setLoading(false);
    }
  };

  const loadTier1Data = async () => {
    try {
      setLoading(true);
      const [assessmentsList, activeClassStudents, allCases] = await Promise.all([
        getTier1Assessments(filters.academicYear, filters.semester),
        getStudentsByClass(selectedClassId, filters.academicYear),
        getMTSSAcademicCases({ academicYear: filters.academicYear, semester: filters.semester })
      ]);
      setAssessmentData(assessmentsList);
      setStudents(activeClassStudents || []);
      setCases(allCases || []);

      // Populate draft scores for students in this class
      const drafts: any = {};
      const classStudents = activeClassStudents || [];

      classStudents.forEach(st => {
        const studentRecord = assessmentsList.find(a => a.studentId === st.id);
        const studentActiveCases = (allCases || []).filter(c => c.studentId === st.id && c.status !== 'CLOSED');
        const mathRoutedCase = studentActiveCases.find(c => c.subjectDomains.includes('NUMERACY'));
        const biRoutedCase = studentActiveCases.find(c => c.subjectDomains.includes('BAHASA_INDONESIA'));
        const engRoutedCase = studentActiveCases.find(c => c.subjectDomains.includes('ENGLISH'));

        drafts[st.id] = {
          studentId: st.id,
          aapNumeracy: studentRecord?.aapNumeracy !== undefined ? studentRecord.aapNumeracy : "",
          testOutNumeracy: studentRecord?.testOutNumeracy !== undefined ? studentRecord.testOutNumeracy : "",
          aapLiteracyBI: studentRecord?.aapLiteracyBI !== undefined ? studentRecord.aapLiteracyBI : "",
          testOutLiteracyBI: studentRecord?.testOutLiteracyBI !== undefined ? studentRecord.testOutLiteracyBI : "",
          aapLiteracyENG: studentRecord?.aapLiteracyENG !== undefined ? studentRecord.aapLiteracyENG : "",
          testOutLiteracyENG: studentRecord?.testOutLiteracyENG !== undefined ? studentRecord.testOutLiteracyENG : "",
          tierNumeracy: studentRecord?.tierNumeracy || (mathRoutedCase ? "Tier 2" : "Tier 1"),
          tierLiteracyBI: studentRecord?.tierLiteracyBI || (biRoutedCase ? "Tier 2" : "Tier 1"),
          tierLiteracyENG: studentRecord?.tierLiteracyENG || (engRoutedCase ? "Tier 2" : "Tier 1")
        };
      });
      setDraftScores(drafts);
    } catch (err) {
      console.error("Error obtaining assessment records:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleScoreChange = (studentId: string, field: string, val: string) => {
    const numericVal = val === "" ? "" : Math.min(100, Math.max(0, parseInt(val) || 0));
    setDraftScores(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: numericVal
      }
    }));

    // Reset row save mark feedback
    if (savedStatus[studentId]) {
      setSavedStatus(prev => ({ ...prev, [studentId]: false }));
    }
  };

  const handleTierChange = (studentId: string, field: "tierNumeracy" | "tierLiteracyBI" | "tierLiteracyENG", val: "Tier 1" | "Tier 2") => {
    setDraftScores(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: val
      }
    }));

    // Reset row save mark feedback
    if (savedStatus[studentId]) {
      setSavedStatus(prev => ({ ...prev, [studentId]: false }));
    }
  };

  const handleSaveStudentRow = async (studentId: string) => {
    setSavingRows(prev => ({ ...prev, [studentId]: true }));
    try {
      const student = students.find(s => s.id === studentId);
      if (!student) throw new Error("Student data error");

      const docId = `${studentId}_${filters.academicYear.replace(/\//g, '-')}_S${filters.semester}`;
      const draft = draftScores[studentId] || {};

      const dataToSave = {
        studentId,
        studentName: student.name,
        classId: selectedClassId,
        className: classes.find(c => c.id === selectedClassId)?.name || "Unknown",
        academicYear: filters.academicYear,
        semester: filters.semester,
        aapNumeracy: draft.aapNumeracy !== "" ? draft.aapNumeracy : null,
        testOutNumeracy: draft.testOutNumeracy !== "" ? draft.testOutNumeracy : null,
        aapLiteracyBI: draft.aapLiteracyBI !== "" ? draft.aapLiteracyBI : null,
        testOutLiteracyBI: draft.testOutLiteracyBI !== "" ? draft.testOutLiteracyBI : null,
        aapLiteracyENG: draft.aapLiteracyENG !== "" ? draft.aapLiteracyENG : null,
        testOutLiteracyENG: draft.testOutLiteracyENG !== "" ? draft.testOutLiteracyENG : null,
        tierNumeracy: draft.tierNumeracy || "Tier 1",
        tierLiteracyBI: draft.tierLiteracyBI || "Tier 1",
        tierLiteracyENG: draft.tierLiteracyENG || "Tier 1",
        updatedBy: currentUser?.uid || "teacher"
      };

      await saveTier1Assessment(docId, dataToSave);

      // Check and automatically create Tier 2 active cases if marked as "Tier 2" and not already active
      const studentActiveCases = cases.filter(c => c.studentId === studentId && c.status !== 'CLOSED');
      const mathRoutedCase = studentActiveCases.find(c => c.subjectDomains.includes('NUMERACY'));
      const biRoutedCase = studentActiveCases.find(c => c.subjectDomains.includes('BAHASA_INDONESIA'));
      const engRoutedCase = studentActiveCases.find(c => c.subjectDomains.includes('ENGLISH'));

      const targetClass = classes.find(c => c.id === selectedClassId);

      // Auto-route Numeracy if manual tier is "Tier 2" and no case exists
      if (draft.tierNumeracy === "Tier 2" && !mathRoutedCase) {
        await addMTSSAcademicCase({
          schoolUnit: 'JUNIOR_HIGH',
          academicYear: filters.academicYear,
          semester: filters.semester,
          studentId: student.id,
          studentName: student.name,
          classId: selectedClassId,
          className: targetClass?.name || 'Class JUNIOR_HIGH',
          homeroomTeacherId: currentUser?.uid || '',
          subjectDomains: ['NUMERACY'],
          primaryConcern: 'Automatically routed via Tier 1 manual screening decision.',
          currentTier: 'Tier 2',
          status: 'ACTIVE',
          sourceType: 'SCREENING',
          assignedTeacherIds: [currentUser?.uid || ''],
          assignedSubjectTeacherIds: [],
          assignedCounselorIds: [],
          parentMeetingStatus: 'NOT_STARTED',
          parentCommitmentStatus: 'NOT_SENT',
          latestDecision: null,
          closedAt: null
        });
      }

      // Auto-route BI if manual tier is "Tier 2" and no case exists
      if (draft.tierLiteracyBI === "Tier 2" && !biRoutedCase) {
        await addMTSSAcademicCase({
          schoolUnit: 'JUNIOR_HIGH',
          academicYear: filters.academicYear,
          semester: filters.semester,
          studentId: student.id,
          studentName: student.name,
          classId: selectedClassId,
          className: targetClass?.name || 'Class JUNIOR_HIGH',
          homeroomTeacherId: currentUser?.uid || '',
          subjectDomains: ['BAHASA_INDONESIA'],
          primaryConcern: 'Automatically routed via Tier 1 manual screening decision.',
          currentTier: 'Tier 2',
          status: 'ACTIVE',
          sourceType: 'SCREENING',
          assignedTeacherIds: [currentUser?.uid || ''],
          assignedSubjectTeacherIds: [],
          assignedCounselorIds: [],
          parentMeetingStatus: 'NOT_STARTED',
          parentCommitmentStatus: 'NOT_SENT',
          latestDecision: null,
          closedAt: null
        });
      }

      // Auto-route English if manual tier is "Tier 2" and no case exists
      if (draft.tierLiteracyENG === "Tier 2" && !engRoutedCase) {
        await addMTSSAcademicCase({
          schoolUnit: 'JUNIOR_HIGH',
          academicYear: filters.academicYear,
          semester: filters.semester,
          studentId: student.id,
          studentName: student.name,
          classId: selectedClassId,
          className: targetClass?.name || 'Class JUNIOR_HIGH',
          homeroomTeacherId: currentUser?.uid || '',
          subjectDomains: ['ENGLISH'],
          primaryConcern: 'Automatically routed via Tier 1 manual screening decision.',
          currentTier: 'Tier 2',
          status: 'ACTIVE',
          sourceType: 'SCREENING',
          assignedTeacherIds: [currentUser?.uid || ''],
          assignedSubjectTeacherIds: [],
          assignedCounselorIds: [],
          parentMeetingStatus: 'NOT_STARTED',
          parentCommitmentStatus: 'NOT_SENT',
          latestDecision: null,
          closedAt: null
        });
      }

      toast.success(`Saved successfully for ${student.name}`);
      setSavedStatus(prev => ({ ...prev, [studentId]: true }));

      // Refresh list and cases
      const [updatedList, updatedCases] = await Promise.all([
        getTier1Assessments(filters.academicYear, filters.semester),
        getMTSSAcademicCases({ academicYear: filters.academicYear, semester: filters.semester })
      ]);
      setAssessmentData(updatedList);
      setCases(updatedCases || []);
    } catch (err) {
      console.error("Save error:", err);
      toast.error("Failed to save student scores.");
    } finally {
      setSavingRows(prev => ({ ...prev, [studentId]: false }));
    }
  };

  // Diagnosis engine
  const runDiagnosis = (aap: any, testOut: any) => {
    if (aap === "" || aap === null || testOut === "" || testOut === null) {
      return { status: "PENDING", label: "", color: "" };
    }
    const aapNum = Number(aap);
    const testOutNum = Number(testOut);

    if (aapNum < 70 && testOutNum < 70) {
      return { status: "TIER2", label: "Recommend Tier 2", color: "bg-rose-50 text-rose-700 border-rose-200 font-bold" };
    }
    return { status: "TIER1", label: "Remain in Tier 1", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  };

  const handleRouteToTier2Click = (student: Student, domain: 'NUMERACY' | 'BAHASA_INDONESIA' | 'ENGLISH') => {
    setRoutingModal({ student, domain });
  };

  const submitRoutingToTier2 = async (notes: string) => {
    if (!routingModal) return;
    setRoutingSubmitting(true);
    try {
      const { student, domain } = routingModal;
      const targetClass = classes.find(c => c.id === selectedClassId);

      // Create physical case in firebase juniorhigh_mtss_academic_cases
      const newCaseId = await addMTSSAcademicCase({
        schoolUnit: 'JUNIOR_HIGH',
        academicYear: filters.academicYear,
        semester: filters.semester,
        studentId: student.id,
        studentName: student.name,
        classId: selectedClassId,
        className: targetClass?.name || 'Class JUNIOR_HIGH',
        homeroomTeacherId: currentUser?.uid || '',
        subjectDomains: [domain],
        primaryConcern: notes,
        currentTier: 'Tier 2',
        status: 'ACTIVE',
        sourceType: 'SCREENING',
        assignedTeacherIds: [currentUser?.uid || ''],
        assignedSubjectTeacherIds: [],
        assignedCounselorIds: [],
        parentMeetingStatus: 'NOT_STARTED',
        parentCommitmentStatus: 'NOT_SENT',
        latestDecision: null,
        closedAt: null
      });

      toast.success(`${student.name} successfully routed to Tier 2!`);
      // Re-fetch cases to reflect change
      const updatedCases = await getMTSSAcademicCases({ academicYear: filters.academicYear, semester: filters.semester });
      setCases(updatedCases || []);
      setRoutingModal(null);
    } catch (err) {
      console.error(err);
      toast.error("An error occurred routing student to Tier 2.");
    } finally {
      setRoutingSubmitting(false);
    }
  };

  // Filter students in selected class
  const classStudents = students;

  // SOP calculation on how many students in this class are recommended for Tier 2 support
  let classTier2DiagCount = 0;
  classStudents.forEach(st => {
    const sDraft = draftScores[st.id] || {};
    const mathDiag = runDiagnosis(sDraft.aapNumeracy, sDraft.testOutNumeracy);
    const biDiag = runDiagnosis(sDraft.aapLiteracyBI, sDraft.testOutLiteracyBI);
    const engDiag = runDiagnosis(sDraft.aapLiteracyENG, sDraft.testOutLiteracyENG);

    if (mathDiag.status === "TIER2" || biDiag.status === "TIER2" || engDiag.status === "TIER2") {
      classTier2DiagCount++;
    }
  });

  const totalClassCount = classStudents.length || 1;
  const ratioTier2 = (classTier2DiagCount / totalClassCount) * 100;
  const exceedsSOPThreshold = ratioTier2 > 20;

  return (
    <div className="space-y-6">
      {/* Description Headers */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2 uppercase italic">
            Tier 1 <span className="text-indigo-600">Class Table & Assessments</span>
          </h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1 font-mono">
            Secondary Classroom screening, baseline AAP inputs, and instruction outcome diagnostics
          </p>
        </div>

        {/* Dropdown class selection */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black uppercase tracking-widest font-mono text-slate-400">Classroom:</span>
          {loading ? (
            <div className="h-9 w-24 bg-slate-100 rounded-xl animate-pulse" />
          ) : (
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="px-4 py-2 border border-slate-200 bg-slate-50 hover:bg-white rounded-xl text-xs font-black uppercase tracking-widest text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-600/10 cursor-pointer"
            >
              {classes.length === 0 ? (
                <option value="">No Classes Registered</option>
              ) : (
                classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))
              )}
            </select>
          )}
        </div>
      </div>

      {/* SLA Metric Alert on Class Ratios */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className={`p-6 rounded-3xl border shadow-sm ${exceedsSOPThreshold ? "bg-rose-50 border-rose-100 text-rose-800" : "bg-emerald-50 border-emerald-100 text-emerald-800"}`}>
          <p className="text-[10px] font-black uppercase tracking-widest font-mono opacity-80 mb-1">
            20% SOP Threshold Indicator
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black">{ratioTier2.toFixed(0)}%</span>
            <span className="text-xs font-bold opacity-75">({classTier2DiagCount} / {totalClassCount} students recommended)</span>
          </div>
          {exceedsSOPThreshold ? (
            <p className="text-[10px] font-medium leading-relaxed mt-2 uppercase text-rose-700 font-mono">
              ⚠️ Warning: Exceeds 20% SOP recommendation. Consider reviewing general academic delivery at Tier 1.
            </p>
          ) : (
            <p className="text-[10px] font-medium leading-relaxed mt-2 uppercase text-emerald-700 font-mono">
              ✓ Compliant: Class intervention percentage resides healthily within standard thresholds.
            </p>
          )}
        </div>

        <div className="bg-slate-900 text-white p-6 rounded-3xl flex flex-col justify-between shadow-sm border border-slate-800">
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400 font-mono block mb-1">Academic Diagnostic Rule</span>
            <p className="text-xs font-medium text-slate-300 leading-relaxed">
              If initial assessment (AAP) is below 70 AND Tier 1 Test Out outcomes fall below 70, students are routed to active Tier 2 interventions.
            </p>
          </div>
          <div className="pt-2 text-[10px] text-slate-400 font-black uppercase font-mono italic">Lumina Junior High SOP</div>
        </div>

        <div className="bg-white border border-slate-200 p-6 rounded-3xl flex items-center gap-4 shadow-sm">
          <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
            <Users size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Class Capacity</p>
            <h4 className="text-2xl font-black text-slate-900">{classStudents.length} Students</h4>
            <span className="text-[10px] text-slate-400 uppercase font-bold font-mono">Active in Junior High</span>
          </div>
        </div>
      </div>

      {/* Main Student Assessment Grid Sheet */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="p-32 text-center">
            <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-400 font-black uppercase tracking-widest text-xs font-mono">
              Assembling Grade List...
            </p>
          </div>
        ) : classStudents.length === 0 ? (
          <div className="p-32 text-center text-slate-400">
            <Users className="mx-auto mb-4 text-slate-300 rotate-12" size={48} />
            <p className="text-sm font-black uppercase tracking-widest text-slate-500">No students found</p>
            <p className="text-xs text-slate-400 mt-1">Check class assignments or enrollment years.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 font-mono">
                  <th rowSpan={2} className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[150px] align-middle">
                    Student ID & Name
                  </th>
                  <th colSpan={3} className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center border-l bg-indigo-50/10">
                    Numeracy (Math)
                  </th>
                  <th colSpan={3} className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center border-l bg-emerald-50/10">
                    Bahasa Indonesia
                  </th>
                  <th colSpan={3} className="px-4 py-2.5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center border-l bg-blue-50/10">
                    English Literacy
                  </th>
                  <th rowSpan={2} className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center border-l align-middle w-[80px]">
                    Save
                  </th>
                </tr>
                <tr className="bg-slate-50/30 border-b border-slate-100 font-mono text-[9px] font-extrabold text-slate-400 uppercase tracking-widest text-center">
                  <th className="px-2 py-1.5 border-l bg-indigo-50/5">AAP</th>
                  <th className="px-2 py-1.5 border-l bg-indigo-50/15">Test Out</th>
                  <th className="px-4 py-1.5 border-l bg-indigo-50/25">Tier</th>
                  <th className="px-2 py-1.5 border-l bg-emerald-50/5">AAP</th>
                  <th className="px-2 py-1.5 border-l bg-emerald-50/15">Test Out</th>
                  <th className="px-4 py-1.5 border-l bg-emerald-50/25">Tier</th>
                  <th className="px-2 py-1.5 border-l bg-blue-50/5">AAP</th>
                  <th className="px-2 py-1.5 border-l bg-blue-50/15">Test Out</th>
                  <th className="px-4 py-1.5 border-l bg-blue-50/25">Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {classStudents.map((st, idx) => {
                  const sDraft = draftScores[st.id] || {
                    aapNumeracy: "", testOutNumeracy: "",
                    aapLiteracyBI: "", testOutLiteracyBI: "",
                    aapLiteracyENG: "", testOutLiteracyENG: "",
                    tierNumeracy: "Tier 1", tierLiteracyBI: "Tier 1", tierLiteracyENG: "Tier 1"
                  };

                  // Run automated diagnosis
                  const mathDiag = runDiagnosis(sDraft.aapNumeracy, sDraft.testOutNumeracy);
                  const biDiag = runDiagnosis(sDraft.aapLiteracyBI, sDraft.testOutLiteracyBI);
                  const engDiag = runDiagnosis(sDraft.aapLiteracyENG, sDraft.testOutLiteracyENG);

                  // Identify case matching domain
                  const studentActiveCases = cases.filter(c => c.studentId === st.id && c.status !== 'CLOSED');
                  const mathRoutedCase = studentActiveCases.find(c => c.subjectDomains.includes('NUMERACY'));
                  const biRoutedCase = studentActiveCases.find(c => c.subjectDomains.includes('BAHASA_INDONESIA'));
                  const engRoutedCase = studentActiveCases.find(c => c.subjectDomains.includes('ENGLISH'));

                  return (
                    <tr key={st.id} className="hover:bg-slate-50/50 transition-all">
                      {/* Name Card */}
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-xs uppercase">
                            {st.name.charAt(0)}
                          </div>
                          <div className="max-w-[140px] truncate">
                            <p className="font-extrabold text-slate-800 text-xs truncate" title={st.name}>
                              {st.name}
                            </p>
                            <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider font-mono mt-0.5">
                              ID: {st.id}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Numeracy AAP */}
                      <td className="px-2 py-4 border-l bg-indigo-50/[0.03] text-center w-[60px]">
                        <div className="flex justify-center">
                          <input
                            type="number"
                            placeholder="..."
                            value={sDraft.aapNumeracy}
                            onChange={(e) => handleScoreChange(st.id, "aapNumeracy", e.target.value)}
                            className="w-12 px-1 py-1 text-center font-bold bg-white border border-slate-200 rounded-lg text-xs hover:border-slate-300 focus:border-indigo-600 focus:outline-none"
                          />
                        </div>
                      </td>

                      {/* Numeracy Test Out */}
                      <td className="px-2 py-4 border-l bg-indigo-50/10 text-center w-[60px]">
                        <div className="flex justify-center">
                          <input
                            type="number"
                            placeholder="..."
                            value={sDraft.testOutNumeracy}
                            onChange={(e) => handleScoreChange(st.id, "testOutNumeracy", e.target.value)}
                            className="w-12 px-1 py-1 text-center font-bold bg-white border border-slate-200 rounded-lg text-xs hover:border-slate-300 focus:border-indigo-600 focus:outline-none"
                          />
                        </div>
                      </td>

                      {/* Numeracy Tier selection */}
                      <td className="px-2 py-4 border-l bg-indigo-50/[0.15] text-center min-w-[130px]">
                        <div className="flex flex-col gap-1 items-center justify-center">
                          <select
                            value={sDraft.tierNumeracy || "Tier 1"}
                            onChange={(e) => handleTierChange(st.id, "tierNumeracy", e.target.value as "Tier 1" | "Tier 2")}
                            className={`px-1.5 py-1 text-center font-black rounded-lg text-[10px] border tracking-wider focus:outline-none transition-all cursor-pointer ${
                              sDraft.tierNumeracy === "Tier 2"
                                ? "border-rose-400 text-rose-700 bg-rose-50 hover:bg-rose-100"
                                : "border-slate-200 text-slate-700 bg-white hover:border-slate-300"
                            }`}
                          >
                            <option value="Tier 1">Tier 1</option>
                            <option value="Tier 2">Tier 2</option>
                          </select>

                          {/* Diag Badge */}
                          {mathDiag.label && (
                            <div className="w-[105px]">
                              <div className={`p-0.5 text-[8px] text-center rounded border tracking-wide uppercase font-mono ${mathDiag.color}`}>
                                {mathDiag.label}
                              </div>
                            </div>
                          )}

                          {/* Active Interventions Indicators */}
                          {mathRoutedCase && (
                            <div className="pt-0.5">
                              <button
                                onClick={() => navigate(`/junior-high/academic/mtss/cases/${mathRoutedCase.id}`)}
                                className="px-2 py-0.5 bg-indigo-100 text-indigo-700 border border-indigo-200 rounded text-[8px] font-semibold tracking-wider hover:bg-indigo-600 hover:text-white transition-colors"
                              >
                                View Case
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Bahasa Indonesia AAP */}
                      <td className="px-2 py-4 border-l bg-emerald-50/[0.03] text-center w-[60px]">
                        <div className="flex justify-center">
                          <input
                            type="number"
                            placeholder="..."
                            value={sDraft.aapLiteracyBI}
                            onChange={(e) => handleScoreChange(st.id, "aapLiteracyBI", e.target.value)}
                            className="w-12 px-1 py-1 text-center font-bold bg-white border border-slate-200 rounded-lg text-xs hover:border-slate-300 focus:border-indigo-600 focus:outline-none"
                          />
                        </div>
                      </td>

                      {/* Bahasa Indonesia Test Out */}
                      <td className="px-2 py-4 border-l bg-emerald-50/10 text-center w-[60px]">
                        <div className="flex justify-center">
                          <input
                            type="number"
                            placeholder="..."
                            value={sDraft.testOutLiteracyBI}
                            onChange={(e) => handleScoreChange(st.id, "testOutLiteracyBI", e.target.value)}
                            className="w-12 px-1 py-1 text-center font-bold bg-white border border-slate-200 rounded-lg text-xs hover:border-slate-300 focus:border-indigo-600 focus:outline-none"
                          />
                        </div>
                      </td>

                      {/* Bahasa Indonesia Tier selection */}
                      <td className="px-2 py-4 border-l bg-emerald-50/[0.15] text-center min-w-[130px]">
                        <div className="flex flex-col gap-1 items-center justify-center">
                          <select
                            value={sDraft.tierLiteracyBI || "Tier 1"}
                            onChange={(e) => handleTierChange(st.id, "tierLiteracyBI", e.target.value as "Tier 1" | "Tier 2")}
                            className={`px-1.5 py-1 text-center font-black rounded-lg text-[10px] border tracking-wider focus:outline-none transition-all cursor-pointer ${
                              sDraft.tierLiteracyBI === "Tier 2"
                                ? "border-rose-400 text-rose-700 bg-rose-50 hover:bg-rose-100"
                                : "border-slate-200 text-slate-700 bg-white hover:border-slate-300"
                            }`}
                          >
                            <option value="Tier 1">Tier 1</option>
                            <option value="Tier 2">Tier 2</option>
                          </select>

                          {/* Diag Badge */}
                          {biDiag.label && (
                            <div className="w-[105px]">
                              <div className={`p-0.5 text-[8px] text-center rounded border tracking-wide uppercase font-mono ${biDiag.color}`}>
                                {biDiag.label}
                              </div>
                            </div>
                          )}

                          {/* Active Interventions Indicators */}
                          {biRoutedCase && (
                            <div className="pt-0.5">
                              <button
                                onClick={() => navigate(`/junior-high/academic/mtss/cases/${biRoutedCase.id}`)}
                                className="px-2 py-0.5 bg-indigo-100 text-indigo-700 border border-indigo-200 rounded text-[8px] font-semibold tracking-wider hover:bg-indigo-600 hover:text-white transition-colors"
                              >
                                View Case
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* English AAP */}
                      <td className="px-2 py-4 border-l bg-blue-50/[0.03] text-center w-[60px]">
                        <div className="flex justify-center">
                          <input
                            type="number"
                            placeholder="..."
                            value={sDraft.aapLiteracyENG}
                            onChange={(e) => handleScoreChange(st.id, "aapLiteracyENG", e.target.value)}
                            className="w-12 px-1 py-1 text-center font-bold bg-white border border-slate-200 rounded-lg text-xs hover:border-slate-300 focus:border-indigo-600 focus:outline-none"
                          />
                        </div>
                      </td>

                      {/* English Test Out */}
                      <td className="px-2 py-4 border-l bg-blue-50/10 text-center w-[60px]">
                        <div className="flex justify-center">
                          <input
                            type="number"
                            placeholder="..."
                            value={sDraft.testOutLiteracyENG}
                            onChange={(e) => handleScoreChange(st.id, "testOutLiteracyENG", e.target.value)}
                            className="w-12 px-1 py-1 text-center font-bold bg-white border border-slate-200 rounded-lg text-xs hover:border-slate-300 focus:border-indigo-600 focus:outline-none"
                          />
                        </div>
                      </td>

                      {/* English Tier selection */}
                      <td className="px-2 py-4 border-l bg-blue-50/[0.15] text-center min-w-[130px]">
                        <div className="flex flex-col gap-1 items-center justify-center">
                          <select
                            value={sDraft.tierLiteracyENG || "Tier 1"}
                            onChange={(e) => handleTierChange(st.id, "tierLiteracyENG", e.target.value as "Tier 1" | "Tier 2")}
                            className={`px-1.5 py-1 text-center font-black rounded-lg text-[10px] border tracking-wider focus:outline-none transition-all cursor-pointer ${
                              sDraft.tierLiteracyENG === "Tier 2"
                                ? "border-rose-400 text-rose-700 bg-rose-50 hover:bg-rose-100"
                                : "border-slate-200 text-slate-700 bg-white hover:border-slate-300"
                            }`}
                          >
                            <option value="Tier 1">Tier 1</option>
                            <option value="Tier 2">Tier 2</option>
                          </select>

                          {/* Diag Badge */}
                          {engDiag.label && (
                            <div className="w-[105px]">
                              <div className={`p-0.5 text-[8px] text-center rounded border tracking-wide uppercase font-mono ${engDiag.color}`}>
                                {engDiag.label}
                              </div>
                            </div>
                          )}

                          {/* Active Interventions Indicators */}
                          {engRoutedCase && (
                            <div className="pt-0.5">
                              <button
                                onClick={() => navigate(`/junior-high/academic/mtss/cases/${engRoutedCase.id}`)}
                                className="px-2 py-0.5 bg-indigo-100 text-indigo-700 border border-indigo-200 rounded text-[8px] font-semibold tracking-wider hover:bg-indigo-600 hover:text-white transition-colors"
                              >
                                View Case
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Save Action */}
                      <td className="px-4 py-4 text-center border-l">
                        <button
                          disabled={savingRows[st.id]}
                          onClick={() => handleSaveStudentRow(st.id)}
                          className={`p-2 rounded-xl transition-all shadow-sm ${
                            savedStatus[st.id]
                              ? "bg-emerald-500 text-white"
                              : "bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white"
                          }`}
                        >
                          {savingRows[st.id] ? (
                            <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                          ) : savedStatus[st.id] ? (
                            <Check size={16} />
                          ) : (
                            <Save size={16} />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SLA/SOP Instruction Guidelines Panel at Base */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-8 rounded-[40px] border border-slate-200">
        <div className="flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-2 font-mono flex items-center gap-1.5">
              <Info size={16} className="text-indigo-600" />
              SOP: Baseline Placement (AAP) Instruction
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed font-semibold">
              AAP (Initial Academic Assessment) must be proctored during the very first week of the semester for Literacy (English & Bahasa Indo) and Numeracy.
              These diagnostic levels give teachers visual risk groups. No students will reside in Tier 2 at starting phase block without completing Tier 1 Test Out attempts initially.
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-2 font-mono flex items-center gap-1.5">
              <Brain size={16} className="text-emerald-700" />
              SOP: Tier 1 Test Out Instruction
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed font-semibold">
              Following 4-6 weeks of solid, quality-oriented core classroom curriculum delivery, teachers will proctor the Tier 1 Test Out assessment.
              Students obtaining scores ≥ 70 successfully bypass the MTSS referral cycle. Remaining candidates on track below 70 are dispatched into formal Tier 2 cycles immediately.
            </p>
          </div>
        </div>
      </div>

      {/* Render popover Routing Modal */}
      <AnimatePresence>
        {routingModal && (
          <RouteToTier2Modal
            onClose={() => setRoutingModal(null)}
            student={routingModal.student}
            domain={routingModal.domain}
            onSubmit={submitRoutingToTier2}
            isSubmitting={routingSubmitting}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
