import * as React from 'react';
import { motion } from 'motion/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  ChevronLeft, Info, Send, User, Calendar, 
  MapPin, Clock, FileText, AlertCircle, Sparkles,
  Layers, MessageSquare, Briefcase, Loader2, X,
  History, PlusCircle, CheckCircle, HelpCircle, ClipboardCheck
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { createMTSSCase, updateMTSSCase, addMTSSConcern, getStudentActiveBehaviorCases, getTeachers, getStudentById, getClasses, getActiveStudents } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { SEVERE_BEHAVIOR_CATEGORIES } from '../../constants/mtssSevereCategories';
import type { MTSSTier, MTSSStatus } from '../../types';

export default function CreateCase() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [activeCases, setActiveCases] = React.useState<any[]>([]);
  const [loadingCases, setLoadingCases] = React.useState(false);
  const [reportingMode, setReportingMode] = React.useState<'NEW' | 'EXISTING'>('NEW');
  const [selectedCaseId, setSelectedCaseId] = React.useState<string>('');
  const [teachers, setTeachers] = React.useState<any[]>([]);
  const [classesList, setClassesList] = React.useState<any[]>([]);
  const [studentsList, setStudentsList] = React.useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = React.useState(false);

  const qStudentId = searchParams.get('studentId');

  const [formData, setFormData] = React.useState({
    studentName: '',
    studentId: '',
    classId: '',
    academicYear: activeYear || '',
    tier: 'Tier 2' as MTSSTier,
    status: 'OPEN' as MTSSStatus,
    categoryCode: '',
    categoryLabel: '',
    date: new Date().toISOString().split('T')[0],
    time: '',
    location: '',
    description: '',
    interventionsTried: '',
    progressNotes: '',
    nextSteps: '',
    nextStepDueDate: '',
    nextStepPicId: '',
    nextStepPicName: '',
  });

  React.useEffect(() => {
    if (activeYear) {
      setFormData(prev => ({ ...prev, academicYear: activeYear }));
    }
  }, [activeYear]);

  React.useEffect(() => {
    const fetchTeachers = async () => {
      try {
        const list = await getTeachers() || [];
        const filteredList = list.filter(u => 
          u.unitId === 'JUNIOR_HIGH' || 
          u.role === 'HEAD_JUNIOR' || 
          u.role === 'SUPER_ADMIN'
        );
        setTeachers(filteredList);
      } catch (err) {
        console.error("Error loading teachers:", err);
      }
    };
    fetchTeachers();
  }, []);

  React.useEffect(() => {
    const fetchClasses = async () => {
      try {
        const classesData = await getClasses();
        const jhClasses = (classesData || []).filter(c => 
          c.unitId === 'JUNIOR_HIGH' && 
          c.academicYear === activeYear && 
          c.status !== 'archived'
        );
        setClassesList(jhClasses);
      } catch (err) {
        console.error("Error loading classes:", err);
      }
    };
    if (activeYear) {
      fetchClasses();
    }
  }, [activeYear]);

  // Pre-fill reporter/PIC with currently logged-in user once teachers list is loaded
  React.useEffect(() => {
    if (profile && !formData.nextStepPicId) {
      setFormData(prev => ({
        ...prev,
        nextStepPicId: profile.uid,
        nextStepPicName: profile.displayName || 'Unknown Teacher'
      }));
    }
  }, [profile, teachers]);

  // Handle studentId from query parameters once classesList is loaded
  React.useEffect(() => {
    if (qStudentId && classesList.length > 0) {
      getStudentById(qStudentId).then(async (student) => {
        if (student) {
          let resolvedClassId = student.classId;
          if (resolvedClassId) {
            const foundClass = classesList.find(c => c.id === resolvedClassId || c.name.toLowerCase() === resolvedClassId.toLowerCase());
            if (foundClass) resolvedClassId = foundClass.id;
          }

          setFormData(prev => ({ 
            ...prev, 
            studentName: student.name || '',
            studentId: student.id,
            classId: resolvedClassId || student.classId || prev.classId
          }));

          if (resolvedClassId) {
            setLoadingStudents(true);
            try {
              const students = await getActiveStudents(resolvedClassId, activeYear);
              setStudentsList(students || []);
            } catch (err) {
              console.error("Error fetching students for query param student:", err);
            } finally {
              setLoadingStudents(false);
            }
          }

          setLoadingCases(true);
          try {
            const cases = await getStudentActiveBehaviorCases(student.id);
            setActiveCases(cases || []);
            const urlMode = searchParams.get('mode');
            if (urlMode === 'NEW' || urlMode === 'EXISTING') {
              setReportingMode(urlMode as 'NEW' | 'EXISTING');
            } else {
              setReportingMode('NEW');
            }
            if (cases && cases.length > 0) {
              setSelectedCaseId(cases[0].id);
            } else {
              setSelectedCaseId('');
            }
          } catch (err) {
            console.error("Error loading active cases:", err);
          } finally {
            setLoadingCases(false);
          }
        }
      }).catch(err => {
        console.error("Error loading student from query param:", err);
      });
    }
  }, [qStudentId, classesList, activeYear]);

  const handleClassChange = async (classId: string) => {
    setFormData(prev => ({ 
      ...prev, 
      classId: classId,
      studentId: '',
      studentName: ''
    }));
    setActiveCases([]);
    setReportingMode('NEW');
    setSelectedCaseId('');
    setStudentsList([]);

    if (classId) {
      setLoadingStudents(true);
      try {
        const students = await getActiveStudents(classId, activeYear);
        setStudentsList(students || []);
      } catch (err) {
        console.error("Error loading students for class:", err);
      } finally {
        setLoadingStudents(false);
      }
    }
  };

  const handleStudentDropdownChange = async (studentId: string) => {
    if (!studentId) {
      setFormData(prev => ({ ...prev, studentId: '', studentName: '' }));
      setActiveCases([]);
      setReportingMode('NEW');
      setSelectedCaseId('');
      return;
    }

    const student = studentsList.find(s => s.id === studentId);
    if (!student) return;

    setFormData(prev => ({
      ...prev,
      studentId: student.id,
      studentName: student.name || ''
    }));

    setLoadingCases(true);
    try {
      const cases = await getStudentActiveBehaviorCases(student.id);
      setActiveCases(cases || []);
      const urlMode = searchParams.get('mode');
      if (urlMode === 'NEW' || urlMode === 'EXISTING') {
        setReportingMode(urlMode as 'NEW' | 'EXISTING');
      } else {
        setReportingMode('NEW');
      }
      if (cases && cases.length > 0) {
        setSelectedCaseId(cases[0].id);
      } else {
        setSelectedCaseId('');
      }
    } catch (err) {
      console.error("Error loading active cases for student:", err);
    } finally {
      setLoadingCases(false);
    }
  };

  const handleStudentClear = () => {
    setFormData(prev => ({ 
      ...prev, 
      studentName: '', 
      studentId: '',
      classId: '' 
    }));
    setActiveCases([]);
    setReportingMode('NEW');
    setSelectedCaseId('');
    setStudentsList([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!formData.studentId) {
      alert("Silakan pilih siswa terlebih dahulu.");
      return;
    }

    if (!formData.categoryCode) {
      alert("Silakan pilih Kategori Pelanggaran (Bagian G nomor 1–17) terlebih dahulu.");
      return;
    }

    if (!formData.description.trim()) {
      alert("Silakan isi deskripsi kronologi kejadian terlebih dahulu.");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const interventionsArray = formData.interventionsTried
        ? formData.interventionsTried.split(',').map(i => i.trim()).filter(Boolean)
        : [];

      const targetPicId = formData.nextStepPicId || profile?.uid || 'unknown';
      const targetPicName = formData.nextStepPicName || profile?.displayName || 'Unknown Teacher';

      const selectedCat = SEVERE_BEHAVIOR_CATEGORIES.find(c => c.code === formData.categoryCode);
      const catCode = selectedCat?.code || formData.categoryCode;
      const catLabel = selectedCat?.label || formData.categoryLabel;

      if (reportingMode === 'EXISTING') {
        if (!selectedCaseId) {
          alert("Silakan pilih kasus aktif yang ingin dilanjutkan.");
          setIsSubmitting(false);
          return;
        }

        // Add concern/incident directly to the selected existing case
        await addMTSSConcern(selectedCaseId, {
          date: formData.date,
          description: formData.description,
          categoryCode: catCode,
          categoryLabel: catLabel,
          reporterId: profile?.uid || 'unknown',
          reporterName: profile?.displayName || 'Unknown Teacher',
          interventionsTried: interventionsArray,
          progressNotes: formData.progressNotes,
          nextSteps: formData.nextSteps,
          nextStepPicId: targetPicId,
          nextStepPicName: targetPicName,
          nextStepDueDate: formData.nextStepDueDate || undefined,
          isDone: false,
        });

        // Update category on parent case if empty
        const existingCase = activeCases.find(c => c.id === selectedCaseId);
        if (!existingCase?.categoryCode && catCode) {
          await updateMTSSCase(selectedCaseId, {
            categoryCode: catCode,
            categoryLabel: catLabel,
          });
        }

        navigate('/junior-high/behavior/mtss/cases/' + selectedCaseId);
      } else {
        // Create a completely new case at Tier 2
        const caseId = await createMTSSCase({
          studentId: formData.studentId,
          studentName: formData.studentName,
          classId: formData.classId,
          academicYear: formData.academicYear,
          semester: String(activeSemester),
          tier: 'Tier 2',
          status: formData.status || 'OPEN',
          categoryCode: catCode,
          categoryLabel: catLabel,
          picId: targetPicId,
          picName: targetPicName,
          totalConcerns: 1,
          lastConcernSummary: formData.description,
          lastConcernDate: Date.now(),
        });

        if (caseId) {
          // Add the initial concern
          await addMTSSConcern(caseId, {
            date: formData.date,
            description: formData.description,
            categoryCode: catCode,
            categoryLabel: catLabel,
            reporterId: profile?.uid || 'unknown',
            reporterName: profile?.displayName || 'Unknown Teacher',
            interventionsTried: interventionsArray,
            progressNotes: formData.progressNotes,
            nextSteps: formData.nextSteps,
            nextStepPicId: targetPicId,
            nextStepPicName: targetPicName,
            nextStepDueDate: formData.nextStepDueDate || undefined,
            isDone: false,
          });

          navigate('/junior-high/behavior/mtss/cases/' + caseId);
        }
      }
    } catch (error) {
      console.error("Error submitting case:", error);
      alert("Terjadi kesalahan saat menyimpan kasus. Silakan coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-20 space-y-6">
      <div className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden">
        <div className="bg-[#002366] px-10 py-12 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-10 opacity-10">
             <MessageSquare size={120} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
               <Sparkles className="text-blue-300" size={20} />
               <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-200">MTSS Behavior Module</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black italic tracking-tighter uppercase mb-2">Lapor Kasus Baru (Tier 2 Intervention)</h1>
            <p className="text-blue-100/70 text-xs font-bold uppercase tracking-widest">SMP Lazuardi GCS</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-12">
          {/* Section: Identitas */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
               <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <User size={18} />
               </div>
               <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Identitas Siswa</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Kelas</label>
                <div className="relative">
                  <select
                    required
                    disabled={reportingMode === 'EXISTING'}
                    className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-sm appearance-none cursor-pointer disabled:opacity-60"
                    value={
                      classesList.find(c => c.id === formData.classId || c.name === formData.classId)?.id || formData.classId
                    }
                    onChange={e => handleClassChange(e.target.value)}
                  >
                    <option value="">Pilih Kelas</option>
                    {classesList.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <ChevronLeft className="absolute right-4 top-1/2 -translate-y-1/2 rotate-[-90deg] text-gray-400 pointer-events-none" size={18} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Pilih Siswa</label>
                <div className="relative">
                  <select
                    required
                    disabled={reportingMode === 'EXISTING' || !formData.classId || loadingStudents}
                    className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-sm appearance-none cursor-pointer disabled:opacity-60"
                    value={formData.studentId}
                    onChange={e => handleStudentDropdownChange(e.target.value)}
                  >
                    <option value="">{loadingStudents ? "Memuat daftar siswa..." : !formData.classId ? "Pilih kelas terlebih dahulu" : "Pilih Siswa"}</option>
                    {studentsList.map(s => (
                      <option key={s.id} value={s.id}>{s.name || s.fullName}</option>
                    ))}
                  </select>
                  {loadingStudents ? (
                    <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-gray-400" size={18} />
                  ) : (
                    <ChevronLeft className="absolute right-4 top-1/2 -translate-y-1/2 rotate-[-90deg] text-gray-400 pointer-events-none" size={18} />
                  )}
                </div>
              </div>
            </div>

            {/* Selection Options: Lanjutkan Kasus Aktif atau Buat Baru */}
            {loadingCases ? (
              <div className="flex items-center gap-2 p-4 bg-gray-50 rounded-2xl">
                <Loader2 className="animate-spin text-blue-500" size={16} />
                <span className="text-xs font-bold text-gray-500">Memeriksa kasus aktif siswa...</span>
              </div>
            ) : (
              activeCases.length > 0 && (
                <div className="bg-amber-50/40 rounded-[2rem] p-6 border border-amber-100 space-y-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="text-amber-500" size={18} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">Siswa Ini Memiliki Kasus Aktif</span>
                  </div>
                  <p className="text-xs text-gray-600 font-medium leading-relaxed">
                    Siswa ini saat ini memiliki penanganan kasus perilaku yang sedang berjalan. Pilih apakah ingin melanjutkan kasus yang ada (menambahkan catatan kejadian) atau memulai kasus baru yang berbeda (menambah kasus berbeda).
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setReportingMode('EXISTING')}
                      className={cn(
                        "p-5 rounded-2xl border text-left transition-all relative flex flex-col justify-between cursor-pointer",
                        reportingMode === 'EXISTING'
                          ? "border-amber-500 bg-amber-50/50 ring-2 ring-amber-200"
                          : "border-gray-200 bg-white hover:bg-gray-50"
                      )}
                    >
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <History size={14} className="text-amber-600" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-amber-800 font-black">Lanjutkan Kasus Aktif</span>
                        </div>
                        <p className="text-[11px] text-gray-500 font-bold leading-relaxed">
                          Menambahkan kejadian/log sebagai timeline baru pada kasus yang sudah berjalan.
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setReportingMode('NEW')}
                      className={cn(
                        "p-5 rounded-2xl border text-left transition-all relative flex flex-col justify-between cursor-pointer",
                        reportingMode === 'NEW'
                          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                          : "border-gray-200 bg-white hover:bg-gray-50"
                      )}
                    >
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <PlusCircle size={14} className="text-blue-600" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-blue-800 font-black">Buat Kasus Baru Berbeda</span>
                        </div>
                        <p className="text-[11px] text-gray-500 font-bold leading-relaxed">
                          Membuat penanganan kasus baru yang berbeda dari yang sedang berjalan.
                        </p>
                      </div>
                    </button>
                  </div>

                  {reportingMode === 'EXISTING' && (
                    <div className="space-y-3 pt-2">
                      <label className="text-[10px] font-black uppercase text-amber-800 tracking-widest ml-1">Pilih Kasus Aktif yang Ingin Dilanjutkan</label>
                      <div className="space-y-2">
                        {activeCases.map((c) => (
                          <label
                            key={c.id}
                            className={cn(
                              "flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all bg-white",
                              selectedCaseId === c.id ? "border-amber-500 bg-amber-50/30" : "border-gray-200 hover:bg-gray-50"
                            )}
                          >
                            <input
                              type="radio"
                              name="selectedCaseId"
                              value={c.id}
                              checked={selectedCaseId === c.id}
                              onChange={() => {
                                setSelectedCaseId(c.id);
                                // Also pre-fill target tier if needed
                                setFormData(prev => ({ ...prev, tier: c.tier }));
                              }}
                              className="mt-1 text-amber-600 focus:ring-amber-500"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[9px] font-black uppercase tracking-widest bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                                  {c.tier}
                                </span>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                  Status: {c.status}
                                </span>
                                <span className="text-[10px] font-bold text-gray-500 ml-auto">
                                  Reporter/PIC: {c.picName || 'BK'}
                                </span>
                              </div>
                              <p className="text-xs font-bold text-gray-800 truncate">
                                Kasus Terakhir: {c.lastConcernSummary || 'Tidak ada deskripsi'}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}

            {reportingMode === 'NEW' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Academic Year</label>
                  <input
                    type="text"
                    readOnly
                    className="w-full px-6 py-4 rounded-2xl bg-gray-100 border border-transparent text-gray-400 font-bold text-sm outline-none"
                    value={formData.academicYear}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section: Kejadian / Detail Laporan */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
               <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <AlertCircle size={18} />
               </div>
               <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Detail Kejadian</h3>
            </div>

            {/* Dropdown Wajib: Kategori Pelanggaran Berat (Bagian G 1-17) */}
            <div className="space-y-2 bg-blue-50/40 p-5 rounded-2xl border border-blue-100">
              <div className="flex items-center justify-between">
                <label htmlFor="kategori-select" className="text-[10px] font-black uppercase text-blue-900 tracking-widest flex items-center gap-1.5">
                  <span>Kategori Pelanggaran</span>
                  <span className="text-rose-500 font-bold">* (Wajib)</span>
                </label>
                <span className="text-[9px] font-black uppercase tracking-wider text-blue-600 bg-blue-100/70 px-2.5 py-0.5 rounded-md">
                  Bagian G (Nomor 1–17)
                </span>
              </div>
              <div className="relative">
                <select
                  id="kategori-select"
                  required
                  className="w-full px-5 py-4 rounded-xl bg-white border border-gray-200 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all font-bold text-sm appearance-none cursor-pointer text-gray-900 shadow-sm"
                  value={formData.categoryCode}
                  onChange={e => {
                    const val = e.target.value;
                    const matched = SEVERE_BEHAVIOR_CATEGORIES.find(c => c.code === val);
                    setFormData(prev => ({
                      ...prev,
                      categoryCode: val,
                      categoryLabel: matched ? matched.label : ''
                    }));
                  }}
                >
                  <option value="">-- Pilih Kategori Pelanggaran --</option>
                  {SEVERE_BEHAVIOR_CATEGORIES.map(cat => (
                    <option key={cat.code} value={cat.code}>
                      {cat.number}. {cat.label}
                    </option>
                  ))}
                </select>
                <ChevronLeft className="absolute right-4 top-1/2 -translate-y-1/2 rotate-[-90deg] text-gray-400 pointer-events-none" size={18} />
              </div>
              <p className="text-[11px] text-gray-500 font-medium">
                Pilih salah satu dari 17 butir pelanggaran berat tata tertib sekolah untuk intervensi Tier 2.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Tanggal</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                  <input
                    required
                    type="date"
                    className="w-full pl-12 pr-4 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-sm"
                    value={formData.date}
                    onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Waktu</label>
                <div className="relative">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                  <input
                    required
                    type="time"
                    className="w-full pl-12 pr-4 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-sm"
                    value={formData.time}
                    onChange={e => setFormData(prev => ({ ...prev, time: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Lokasi</label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                  <input
                    required
                    type="text"
                    placeholder="E.g. Kantin, Koridor, Kelas"
                    className="w-full pl-12 pr-4 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-sm"
                    value={formData.location}
                    onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Behavior Concern</label>
              <textarea
                required
                rows={4}
                placeholder="Jelaskan perilaku yang menjadi kekhawatiran secara spesifik..."
                className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-medium text-sm leading-relaxed"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>

          {/* Section: Intervensi & Tindakan */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
               <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Briefcase size={18} />
               </div>
               <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Intervensi & Tindakan</h3>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Interventions Already Tried</label>
              <textarea
                rows={3}
                placeholder="Sebutkan tindakan/intervensi yang sudah dicoba (pisahkan dengan koma atau baris baru)..."
                className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-medium text-sm leading-relaxed"
                value={formData.interventionsTried}
                onChange={e => setFormData(prev => ({ ...prev, interventionsTried: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Progress After Intervention</label>
              <textarea
                rows={3}
                placeholder="Jelaskan perkembangan atau reaksi siswa setelah diberikan intervensi..."
                className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-medium text-sm leading-relaxed"
                value={formData.progressNotes}
                onChange={e => setFormData(prev => ({ ...prev, progressNotes: e.target.value }))}
              />
            </div>
          </div>

          {/* Section: Next Steps & Penanggung Jawab */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
               <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <ClipboardCheck size={18} />
               </div>
               <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Next Steps & Person Responsible</h3>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Next Steps Plan</label>
              <textarea
                rows={3}
                placeholder="Rencana tindakan selanjutnya untuk membantu siswa..."
                className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-medium text-sm leading-relaxed"
                value={formData.nextSteps}
                onChange={e => setFormData(prev => ({ ...prev, nextSteps: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Target Selesai Next Steps</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                  <input
                    type="date"
                    className="w-full pl-12 pr-4 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-sm"
                    value={formData.nextStepDueDate}
                    onChange={e => setFormData(prev => ({ ...prev, nextStepDueDate: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Person Responsible</label>
                <div className="relative">
                  <select
                    className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-sm appearance-none cursor-pointer"
                    value={formData.nextStepPicId}
                    onChange={e => {
                      const matched = teachers.find(t => t.uid === e.target.value);
                      setFormData(prev => ({
                        ...prev,
                        nextStepPicId: e.target.value,
                        nextStepPicName: matched ? matched.displayName : 'Unknown Teacher'
                      }));
                    }}
                  >
                    <option value="">Pilih Penanggung Jawab</option>
                    {teachers.map(t => (
                      <option key={t.uid} value={t.uid}>{t.displayName} ({t.role})</option>
                    ))}
                  </select>
                  <ChevronLeft className="absolute right-4 top-1/2 -translate-y-1/2 rotate-[-90deg] text-gray-400 pointer-events-none" size={18} />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 p-8 rounded-[2rem] flex gap-4 items-start border border-blue-100 shadow-inner">
            <Info className="text-blue-500 shrink-0 mt-1" size={24} />
            <div className="space-y-1">
               <h4 className="text-xs font-black text-blue-900 tracking-tight uppercase italic">Penting</h4>
               <p className="text-[11px] font-bold text-blue-700 leading-relaxed uppercase tracking-wide">
                  {reportingMode === 'EXISTING' 
                    ? "Laporan ini akan ditambahkan sebagai catatan kejadian baru pada kasus penanganan aktif yang Anda pilih." 
                    : "Laporan ini akan otomatis membuat entitas kasus penanganan perilaku baru pada Tier 2 (Tier 2 Intervention) untuk siswa tersebut."}
               </p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-end gap-4 pt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-10 py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] text-gray-400 hover:text-gray-900 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center justify-center gap-3 bg-gray-900 hover:bg-blue-900 text-white px-12 py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl transition-all hover:-translate-y-1 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
              Kirim Laporan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
