import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings, Layers, Users, 
  Sparkles, Calendar, Save,
  ChevronUp, ChevronDown, Plus,
  X, Loader2, AlertCircle, CheckCircle2,
  ListOrdered
} from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { 
  User as AppUser, 
  ReportConfig, 
  LearningGoal,
  UserRole
} from '../../types';
import { 
  getLearningGoals, 
  getReportConfig, 
  updateReportConfig,
  db,
  auth
} from '../../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { cn } from '../../lib/utils';

export default function ReportConfigPage() {
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  const [activeUnit, setActiveUnit] = React.useState<string>(currentUser.unitId || 'ELEMENTARY');
  const [config, setConfig] = React.useState<ReportConfig | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [subjects, setSubjects] = React.useState<string[]>([]);
  const [availableLGs, setAvailableLGs] = React.useState<LearningGoal[]>([]);
  const [teachers, setTeachers] = React.useState<AppUser[]>([]);

  React.useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [configSnap, lgSnap, userSnap] = await Promise.all([
          getReportConfig(activeUnit),
          getLearningGoals({ unitId: activeUnit }),
          getDocs(query(collection(db, 'users'), where('role', '==', 'TEACHER')))
        ]);

        if (configSnap) {
          if (activeUnit === 'JUNIOR_HIGH') {
            setConfig({
              principalName: '',
              principalTitle: 'Principal',
              principalNIY: '',
              principalSignatureUrl: null,
              principalSignatureStoragePath: null,
              ...configSnap
            } as any);
          } else {
            setConfig(configSnap);
          }
        } else {
          // Default config
          if (activeUnit === 'KINDERGARTEN') {
            setConfig({
              unitId: 'KINDERGARTEN',
              principalName: '',
              principalTitle: 'Principal',
              principalSignatureUrl: null,
              principalSignatureStoragePath: null
            } as any);
          } else if (activeUnit === 'JUNIOR_HIGH') {
            setConfig({
              unitId: 'JUNIOR_HIGH',
              subjectOrder: [],
              studentProfileMapping: {
                "Spiritual Health": [],
                "Islamic Awareness": [],
                "Thinking, Research and Academic Abilities": [],
                "Arts Proficiency": [],
                "Range of Interests Talents and Dispositions": [],
                "Physical Fitness": []
              },
              spiritualHealthLGId: '',
              principalName: '',
              principalTitle: 'Principal',
              principalNIY: '',
              principalSignatureUrl: null,
              principalSignatureStoragePath: null
            } as any);
          } else {
            setConfig({
              unitId: activeUnit,
              subjectOrder: [],
              studentProfileMapping: {
                "Spiritual Health": [],
                "Islamic Awareness": [],
                "Thinking, Research and Academic Abilities": [],
                "Arts Proficiency": [],
                "Range of Interests Talents and Dispositions": [],
                "Physical Fitness": []
              },
              spiritualHealthLGId: ''
            });
          }
        }

        const uniqueSubjects = Array.from(new Set(lgSnap.map(lg => lg.subject))).sort();
        setSubjects(uniqueSubjects);
        setAvailableLGs(lgSnap.filter(lg => lg.subject === 'Spiritual Health' || lg.subject === 'Pendidikan Agama Islam'));
        setTeachers(userSnap.docs.map(d => d.data() as AppUser));

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [activeUnit]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const auditPayload = {
        ...config,
        unit: activeUnit,
        updatedAt: new Date(),
        updatedByUid: currentUser.uid || '',
        updatedByName: currentUser.displayName || (currentUser as any).name || (currentUser as any).fullName || '',
        updatedByEmail: currentUser.email || ''
      };
      await updateReportConfig(activeUnit, auditPayload as any);
      alert("Konfigurasi berhasil disimpan!");
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan konfigurasi.");
    } finally {
      setSaving(false);
    }
  };

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Supported formats check: PNG, JPG, JPEG
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      alert("Format file tidak didukung! Harap pilih file gambar (.png, .jpg, .jpeg)!");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("Ukuran gambar maksimal 2MB!");
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            throw new Error("Gagal menginisialisasi canvas.");
          }

          // Signature bounds: Resize and compress to an elegant size (300 x 150 px)
          const targetWidth = 300;
          const targetHeight = 150;

          canvas.width = targetWidth;
          canvas.height = targetHeight;

          ctx.fillStyle = "transparent";
          ctx.fillRect(0, 0, targetWidth, targetHeight);
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          // Highly compressed PNG or JPEG image
          const compressedBase64 = canvas.toDataURL("image/png");

          setConfig(prev => prev ? ({
            ...prev,
            principalSignatureUrl: compressedBase64,
            principalSignatureStoragePath: "base64_compressed"
          } as any) : null);

          alert("Tanda tangan berhasil diunggah! Jangan lupa klik 'Simpan Semua' untuk menyimpan konfigurasi.");
        } catch (err: any) {
          console.error("[SignatureUpload] Failed to compress signature using HTML canvas:", err);
          alert("Upload tanda tangan gagal. Silakan coba lagi atau hubungi administrator.");
        } finally {
          setUploading(false);
        }
      };
      img.onerror = (err) => {
        console.error("[SignatureUpload] Failed to load signature image object:", err);
        alert("Upload tanda tangan gagal. Silakan coba lagi atau hubungi administrator.");
        setUploading(false);
      };
      img.src = base64;
    };
    reader.onerror = (err) => {
      console.error("[SignatureUpload] FileReader failed to process signature:", err);
      alert("Upload tanda tangan gagal. Silakan coba lagi atau hubungi administrator.");
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSignatureRemove = () => {
    if (!config || !('principalSignatureUrl' in config)) return;
    
    setConfig(prev => prev ? ({
      ...prev,
      principalSignatureUrl: null,
      principalSignatureStoragePath: null
    } as any) : null);

    alert("Tanda tangan dihapus dari draf konfigurasi. Jangan lupa klik 'Simpan Semua' untuk menyimpan.");
  };

  const moveSubject = (index: number, direction: 'up' | 'down') => {
    if (!config) return;
    const newOrder = [...config.subjectOrder];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    setConfig({ ...config, subjectOrder: newOrder });
  };

  const addSubjectToOrder = (subject: string) => {
    if (!config || config.subjectOrder.includes(subject)) return;
    setConfig({ ...config, subjectOrder: [...config.subjectOrder, subject] });
  };

  const removeSubjectFromOrder = (subject: string) => {
    if (!config) return;
    setConfig({ ...config, subjectOrder: config.subjectOrder.filter(s => s !== subject) });
  };

  const toggleSubjectMapping = (category: keyof ReportConfig['studentProfileMapping'], subject: string) => {
    if (!config) return;
    const current = config.studentProfileMapping[category] || [];
    let next: string[];
    
    if (current.includes(subject)) {
      next = current.filter(s => s !== subject);
    } else {
      // Ensure subject is only in ONE category
      const cleanedMapping = { ...config.studentProfileMapping };
      Object.keys(cleanedMapping).forEach(key => {
        const k = key as keyof ReportConfig['studentProfileMapping'];
        cleanedMapping[k] = cleanedMapping[k].filter(s => s !== subject);
      });
      cleanedMapping[category] = [...cleanedMapping[category], subject];
      setConfig({ ...config, studentProfileMapping: cleanedMapping });
      return;
    }

    setConfig({
      ...config,
      studentProfileMapping: {
        ...config.studentProfileMapping,
        [category]: next
      }
    });
  };

  if (loading) return <div className="h-[60vh] flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-32 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-white p-12 rounded-[3.5rem] border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-20 -mt-20" />
        <div className="space-y-4 relative">
          <h1 className="text-5xl font-black tracking-tighter italic uppercase text-gray-900 leading-none">
            Report <span className="text-blue-600">Config</span>
          </h1>
          <p className="text-gray-400 font-bold max-w-lg">Atur parameter laporan, pemetaan profil siswa, dan hak akses wali kelas.</p>
        </div>

        <div className="relative flex gap-3 p-2 bg-gray-50 rounded-3xl">
          {['KINDERGARTEN', 'ELEMENTARY', 'JUNIOR_HIGH'].map(u => (
            <button
              key={u}
              onClick={() => setActiveUnit(u)}
              className={cn(
                "px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
                activeUnit === u ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
              )}
            >
              {u.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
        <div className="lg:col-span-1 space-y-4 sticky top-8 h-fit">
           <nav className="space-y-2">
              {activeUnit === 'KINDERGARTEN' ? (
                <a href="#section-kindy-signatory" className="block p-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-blue-600 bg-blue-50 transition-all flex items-center gap-3">
                   <Users size={16} /> Kindy Signatory
                </a>
              ) : (
                <>
                  <a href="#section-order" className="block p-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center gap-3">
                     <ListOrdered size={16} /> Urutan Mapel
                  </a>
                  <a href="#section-profile" className="block p-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center gap-3">
                     <Users size={16} /> Student Profile
                  </a>
                  <a href="#section-spiritual" className="block p-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center gap-3">
                     <Sparkles size={16} /> Spiritual Health
                  </a>
                  <a href="#section-homeroom" className="block p-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center gap-3">
                     <Layers size={16} /> Wali Kelas
                  </a>
                  {activeUnit === 'JUNIOR_HIGH' && (
                    <a href="#section-jh-signatory" className="block p-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center gap-3">
                       <Users size={16} /> JH Signatory
                    </a>
                  )}
                </>
              )}
           </nav>
           <button 
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-3 py-5 bg-blue-600 text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl hover:bg-blue-700 transition-all shadow-blue-100 active:scale-95"
           >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              Simpan Semua
           </button>
        </div>

        <div className="lg:col-span-3 space-y-20">
          {activeUnit === 'KINDERGARTEN' ? (
            <section id="section-kindy-signatory" className="space-y-8 scroll-mt-32">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white">
                     <Users size={24} />
                  </div>
                  <div>
                     <h2 className="text-2xl font-black uppercase italic tracking-tighter">Kindergarten Weekly Report Signatory</h2>
                     <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Atur nama, jabatan, dan tanda tangan digital Kepala Unit/Principal Kindergarten.</p>
                  </div>
               </div>

               <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 font-sans block">Principal Name</label>
                        <input 
                           type="text"
                           value={(config as any)?.principalName || ''}
                           onChange={(e) => setConfig(prev => prev ? ({ ...prev, principalName: e.target.value } as any) : null)}
                           placeholder="Masukkan nama kepala sekolah/Principal..."
                           className="w-full p-4 bg-gray-50 rounded-2xl border-none font-bold text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500 font-sans text-sm"
                        />
                     </div>

                     <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 font-sans block">Principal Title</label>
                        <input 
                           type="text"
                           value={(config as any)?.principalTitle || 'Principal'}
                           onChange={(e) => setConfig(prev => prev ? ({ ...prev, principalTitle: e.target.value } as any) : null)}
                           placeholder="Principal"
                           className="w-full p-4 bg-gray-50 rounded-2xl border-none font-bold text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500 font-sans text-sm"
                        />
                     </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-gray-50">
                     <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 font-sans block">Principal Signature</label>
                     <div className="flex flex-col md:flex-row items-center gap-6 p-6 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                        <div className="w-40 h-28 bg-white rounded-2xl border border-gray-150 flex items-center justify-center overflow-hidden shrink-0 relative">
                           {uploading ? (
                              <Loader2 className="animate-spin text-emerald-600" size={24} />
                           ) : (config as any)?.principalSignatureUrl ? (
                              <img 
                                 src={(config as any).principalSignatureUrl} 
                                 alt="Principal Signature Preview" 
                                 className="w-full h-full object-contain p-2"
                              />
                           ) : (
                              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider text-center px-4">Tanda Tangan Belum Ada</span>
                           )}
                        </div>

                        <div className="space-y-4 flex-1">
                           <div className="flex flex-wrap gap-2">
                              <input 
                                 type="file"
                                 accept="image/png, image/jpeg, image/jpg"
                                 id="principal-sig-upload"
                                 className="hidden"
                                 onChange={handleSignatureUpload}
                                 disabled={uploading}
                              />
                              <label
                                 htmlFor="principal-sig-upload"
                                 className={cn(
                                    "px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-sm shadow-emerald-100 cursor-pointer flex items-center gap-1.5",
                                    uploading && "opacity-50 pointer-events-none"
                                 )}
                              >
                                 {(config as any)?.principalSignatureUrl ? "Replace" : "Upload Signature"}
                              </label>

                              {(config as any)?.principalSignatureUrl && (
                                 <button
                                    type="button"
                                    onClick={handleSignatureRemove}
                                    disabled={uploading}
                                    className="px-4 py-2.5 border border-red-200 hover:bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer disabled:opacity-50"
                                 >
                                    Remove
                                 </button>
                              )}
                           </div>
                           <p className="text-[10px] text-gray-400 leading-normal font-sans">
                              Recommended: PNG with transparent background. Max 2MB.
                           </p>
                        </div>
                     </div>
                  </div>
               </div>
            </section>
          ) : (
            <>
              {/* Section 1: Subject Order */}
              <section id="section-order" className="space-y-8 scroll-mt-32">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-900 rounded-2xl flex items-center justify-center text-white">
                       <ListOrdered size={24} />
                    </div>
                    <div>
                       <h2 className="text-2xl font-black uppercase italic tracking-tighter">Urutan Mata Pelajaran</h2>
                       <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Digunakan untuk Rapor Diknas dan urutan tabel rapor.</p>
                    </div>
                 </div>

                 <div className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm space-y-6">
                    <div className="flex flex-wrap gap-2 pb-6 border-b border-gray-50">
                       {subjects.filter(s => !config?.subjectOrder.includes(s)).map(s => (
                         <button 
                            key={s}
                            onClick={() => addSubjectToOrder(s)}
                            className="px-4 py-2 bg-gray-50 text-gray-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 hover:text-blue-600 transition-all flex items-center gap-2"
                         >
                            <Plus size={12} /> {s}
                         </button>
                       ))}
                    </div>

                    <div className="space-y-3">
                       {config?.subjectOrder.length === 0 && (
                         <p className="text-sm text-gray-400 font-bold text-center py-10 italic">Belum ada mata pelajaran dalam urutan. Klik di atas untuk menambah.</p>
                       )}
                       {config?.subjectOrder.map((s, idx) => (
                         <div key={s} className="group flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-transparent hover:border-blue-200 hover:bg-white transition-all">
                            <div className="flex items-center gap-4">
                               <span className="w-8 h-8 flex items-center justify-center bg-gray-900 text-white rounded-lg text-xs font-black italic">{idx + 1}</span>
                               <span className="font-bold text-sm text-gray-700">{s}</span>
                            </div>
                            <div className="flex items-center gap-2">
                               <button onClick={() => moveSubject(idx, 'up')} className="p-2 text-gray-400 hover:text-blue-600 transition-colors"><ChevronUp size={16} /></button>
                               <button onClick={() => moveSubject(idx, 'down')} className="p-2 text-gray-400 hover:text-blue-600 transition-colors"><ChevronDown size={16} /></button>
                               <button onClick={() => removeSubjectFromOrder(s)} className="p-2 text-gray-400 hover:text-red-500 transition-colors ml-2"><X size={16} /></button>
                            </div>
                         </div>
                       ))}
                    </div>
                 </div>
              </section>

              {/* Section 2: Student Profile Mapping */}
              <section id="section-profile" className="space-y-8 scroll-mt-32">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white">
                       <Users size={24} />
                    </div>
                    <div>
                       <h2 className="text-2xl font-black uppercase italic tracking-tighter">Student Profile Mapping</h2>
                       <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Petakan mapel ke 6 Kategori Student Profile (Lazuardi end-term).</p>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {(Object.keys(config?.studentProfileMapping || {}) as (keyof ReportConfig['studentProfileMapping'])[]).map(category => (
                      <div key={category} className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm space-y-6">
                         <h3 className="font-black text-gray-900 uppercase italic tracking-tighter border-b border-gray-50 pb-4">{category}</h3>
                         
                         <div className="flex flex-wrap gap-2">
                            {subjects.map(s => {
                               const isSelected = config?.studentProfileMapping[category]?.includes(s);
                               return (
                                 <button
                                   key={s}
                                   onClick={() => toggleSubjectMapping(category, s)}
                                   className={cn(
                                     "px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                                     isSelected 
                                       ? "bg-blue-600 text-white shadow-lg"
                                       : "bg-gray-50 text-gray-400 hover:bg-gray-100"
                                   )}
                                 >
                                   {s}
                                 </button>
                               );
                            })}
                         </div>
                      </div>
                    ))}
                 </div>
              </section>

              {/* Section 3: Spiritual Health LG */}
              <section id="section-spiritual" className="space-y-8 scroll-mt-32">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white">
                       <Sparkles size={24} />
                    </div>
                    <div>
                       <h2 className="text-2xl font-black uppercase italic tracking-tighter">Spiritual Health Goal</h2>
                       <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Pilih TP Spiritual Health yang akan muncul di rapor.</p>
                    </div>
                 </div>

                 <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm space-y-6">
                    <select 
                       value={config?.spiritualHealthLGId}
                       onChange={(e) => setConfig(prev => prev ? ({ ...prev, spiritualHealthLGId: e.target.value }) : null)}
                       className="w-full p-5 bg-gray-50 rounded-2xl border-none font-bold text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                       <option value="">Pilih Tujuan Pembelajaran (LG)...</option>
                       {availableLGs.map(lg => (
                         <option key={lg.id} value={lg.id}>[{lg.code}] {lg.goalText}</option>
                       ))}
                    </select>
                    
                    {config?.spiritualHealthLGId && (
                       <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-2xl flex gap-3 items-start">
                          <CheckCircle2 className="text-emerald-600 shrink-0" size={18} />
                          <div className="space-y-1">
                             <p className="text-[10px] font-black uppercase text-emerald-900">LG Terpilih:</p>
                             <p className="text-sm font-bold text-emerald-700 italic">
                                {availableLGs.find(l => l.id === config.spiritualHealthLGId)?.goalText}
                             </p>
                          </div>
                       </div>
                    )}
                 </div>
              </section>

              {/* Section 4 & 5 placeholder */}
              <section className="bg-gray-50 p-12 rounded-[4rem] text-center space-y-4 border-2 border-dashed border-gray-200">
                 <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto">
                    <AlertCircle className="text-gray-300" size={32} />
                 </div>
                 <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Fitur Homeroom Assignment & SE Period sedang dalam tahap rilis.</p>
              </section>

              {activeUnit === 'JUNIOR_HIGH' && (
                <section id="section-jh-signatory" className="space-y-8 scroll-mt-32">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white">
                         <Users size={24} />
                      </div>
                      <div>
                         <h2 className="text-2xl font-black uppercase italic tracking-tighter">Junior High Midterm Report Signatory</h2>
                         <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Atur nama, jabatan, NIY, dan tanda tangan digital Principal Junior High.</p>
                      </div>
                   </div>

                   <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm space-y-8">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 font-sans block">Principal Name</label>
                            <input 
                               type="text"
                               value={(config as any)?.principalName || ''}
                               onChange={(e) => setConfig(prev => prev ? ({ ...prev, principalName: e.target.value } as any) : null)}
                               placeholder="Masukkan nama kepala sekolah/Principal..."
                               className="w-full p-4 bg-gray-50 rounded-2xl border-none font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 font-sans text-sm"
                            />
                         </div>

                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 font-sans block">Principal Title</label>
                            <input 
                               type="text"
                               value={(config as any)?.principalTitle || 'Principal'}
                               onChange={(e) => setConfig(prev => prev ? ({ ...prev, principalTitle: e.target.value } as any) : null)}
                               placeholder="Principal"
                               className="w-full p-4 bg-gray-50 rounded-2xl border-none font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 font-sans text-sm"
                            />
                         </div>

                         <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 font-sans block">Principal NIY</label>
                            <input 
                               type="text"
                               value={(config as any)?.principalNIY || ''}
                               onChange={(e) => setConfig(prev => prev ? ({ ...prev, principalNIY: e.target.value } as any) : null)}
                               placeholder="Masukkan NIY..."
                               className="w-full p-4 bg-gray-50 rounded-2xl border-none font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 font-sans text-sm"
                            />
                         </div>
                      </div>

                      <div className="space-y-4 pt-4 border-t border-gray-50">
                         <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 font-sans block">Principal Signature</label>
                         <div className="flex flex-col md:flex-row items-center gap-6 p-6 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                            <div className="w-40 h-28 bg-white rounded-2xl border border-gray-150 flex items-center justify-center overflow-hidden shrink-0 relative">
                               {uploading ? (
                                  <Loader2 className="animate-spin text-blue-600" size={24} />
                               ) : (config as any)?.principalSignatureUrl ? (
                                  <img 
                                     src={(config as any).principalSignatureUrl} 
                                     alt="Principal Signature Preview" 
                                     className="w-full h-full object-contain p-2"
                                  />
                               ) : (
                                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider text-center px-4">Tanda Tangan Belum Ada</span>
                               )}
                            </div>

                            <div className="space-y-4 flex-1">
                               <div className="flex flex-wrap gap-2">
                                  <input 
                                     type="file"
                                     accept="image/png, image/jpeg, image/jpg"
                                     id="principal-sig-upload-jh"
                                     className="hidden"
                                     onChange={handleSignatureUpload}
                                     disabled={uploading}
                                  />
                                  <label
                                     htmlFor="principal-sig-upload-jh"
                                     className={cn(
                                        "px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-sm shadow-blue-100 cursor-pointer flex items-center gap-1.5",
                                        uploading && "opacity-50 pointer-events-none"
                                     )}
                                  >
                                     {(config as any)?.principalSignatureUrl ? "Replace" : "Upload Signature"}
                                  </label>

                                  {(config as any)?.principalSignatureUrl && (
                                     <button
                                        type="button"
                                        onClick={handleSignatureRemove}
                                        disabled={uploading}
                                        className="px-4 py-2.5 border border-red-200 hover:bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer disabled:opacity-50"
                                     >
                                        Remove
                                     </button>
                                  )}
                               </div>
                               <p className="text-[10px] text-gray-400 leading-normal font-sans">
                                  Recommended: PNG with transparent background. Max 2MB.
                               </p>
                            </div>
                         </div>
                      </div>
                   </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
