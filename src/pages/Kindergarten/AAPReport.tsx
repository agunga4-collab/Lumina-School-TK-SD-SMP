import * as React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { 
  ClipboardCheck, Printer, Save, FileText, ChevronLeft, RefreshCw, 
  TrendingUp, Layers, Award, CheckCircle2, User, BookOpen, Signature, Sparkles
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { 
  getKindergartenClasses, 
  getKindergartenStudents 
} from '../../lib/kindergartenMetadataCache';
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

export default function AAPReport() {
  const { activeYear } = useAcademicYear();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Navigation state / Active tabs
  const [activeTab, setActiveTab] = React.useState<'individual' | 'class'>('individual');

  // Metadata states
  const [classes, setClasses] = React.useState<any[]>([]);
  const [students, setStudents] = React.useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = React.useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>('');
  const [assessments, setAssessments] = React.useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSavingConclusion, setIsSavingConclusion] = React.useState(false);

  // General Conclusion Custom Edit State
  const [generalConclusion, setGeneralConclusion] = React.useState<string>('');

  // Read URL parameters if redirecting from Assessment Page
  React.useEffect(() => {
    const urlClassId = searchParams.get('classId');
    const urlStudentId = searchParams.get('studentId');
    if (urlClassId) setSelectedClassId(urlClassId);
    if (urlStudentId) setSelectedStudentId(urlStudentId);
  }, [searchParams]);

  // Load initial Classes metadata
  React.useEffect(() => {
    async function loadClasses() {
      try {
        const classList = await getKindergartenClasses(activeYear);
        setClasses(classList);
        if (classList.length > 0 && !selectedClassId) {
          setSelectedClassId(classList[0].id);
        }
      } catch (err) {
        console.error("Error loading kindergarten classes:", err);
        toast.error("Gagal memuat daftar kelas.");
      }
    }
    loadClasses();
  }, [activeYear]);

  // Load students and assessments for the selected class
  React.useEffect(() => {
    if (!selectedClassId) return;

    async function loadStudentsAndAssessments() {
      try {
        setIsLoading(true);
        const studentList = await getKindergartenStudents(activeYear);
        const filteredStudents = studentList.filter((s: any) => s.classId === selectedClassId);
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
        <div className="bg-white border border-gray-150 p-1.5 rounded-2xl flex items-center gap-1 max-w-sm">
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
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full bg-gray-50/50 border border-gray-150 rounded-2xl px-4 py-2.5 text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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
                      const analysis = AAP_DEVELOPMENT_ANALYSIS[asp.aspectName as AAPAspectName]?.[asp.stage as any] || 'Siswa menunjukkan capaian sesuai dengan butir penilaian.';
                      const recommendation = AAP_RECOMMENDATIONS[asp.aspectName as AAPAspectName]?.[asp.stage as any] || 'Sediakan stimulasi teratur di kelas dan rumah.';

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
