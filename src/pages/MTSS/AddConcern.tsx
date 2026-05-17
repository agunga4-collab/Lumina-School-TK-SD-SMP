import * as React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  ChevronLeft, Save, Sparkles, Loader2, AlertCircle, 
  MessageSquare, ClipboardCheck, TrendingUp, UserCheck,
  Calendar
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { addMTSSConcern, db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { MTSSCase, MTSSConcern } from '../../types';
import { GoogleGenAI, Type } from '@google/genai';

export default function AddConcern() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const [mtssCase, setMtssCase] = React.useState<MTSSCase | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [isAiLoading, setIsAiLoading] = React.useState(false);

  const [formData, setFormData] = React.useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    interventionsTried: [] as string[],
    progressNotes: '',
    nextSteps: '',
    nextStepPicName: profile?.displayName || '',
    nextStepDueDate: '',
    newIntervention: ''
  });

  React.useEffect(() => {
    const fetchCase = async () => {
      if (!caseId) return;
      try {
        const snap = await getDoc(doc(db, 'behaviorCases', caseId));
        if (snap.exists()) {
          setMtssCase({ id: snap.id, ...snap.data() } as MTSSCase);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchCase();
  }, [caseId]);

  const addIntervention = () => {
    if (formData.newIntervention.trim()) {
      setFormData(prev => ({
        ...prev,
        interventionsTried: [...prev.interventionsTried, prev.newIntervention.trim()],
        newIntervention: ''
      }));
    }
  };

  const removeIntervention = (idx: number) => {
    setFormData(prev => ({
      ...prev,
      interventionsTried: prev.interventionsTried.filter((_, i) => i !== idx)
    }));
  };

  const handleAiDraft = async () => {
    if (!formData.description) return alert("Silakan isi deskripsi kejadian terlebih dahulu.");
    setIsAiLoading(true);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Bantu saya merancang intervensi Tier 1 untuk kejadian perilaku berikut: "${formData.description}".
      Siswa ini berada dalam kasus MTSS.
      Fasilitasi 1 langkah intervensi segera (interventionsTried) dan 1 rencana tindak lanjut (nextSteps).
      Konteks: SMP Lazuardi (Positive Discipline).
      
      Kembalikan dalam JSON dengan field: 'intervention' (string singkat), 'nextStep' (string singkat).`;
      
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              intervention: { type: Type.STRING },
              nextStep: { type: Type.STRING }
            },
            required: ["intervention", "nextStep"]
          }
        }
      });
      
      const data = JSON.parse(response.text || '{}');
      if (data.intervention) {
        setFormData(prev => ({
          ...prev,
          interventionsTried: [...prev.interventionsTried, data.intervention],
          nextSteps: data.nextStep || prev.nextSteps
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId || !profile) return;
    setSubmitting(true);
    
    try {
      const concern: Omit<MTSSConcern, 'id' | 'createdAt'> = {
        date: formData.date,
        description: formData.description,
        reporterId: profile.email,
        reporterName: profile.displayName || '',
        interventionsTried: formData.interventionsTried,
        progressNotes: formData.progressNotes,
        nextSteps: formData.nextSteps,
        nextStepPicId: '', // Ideally we have PIC email
        nextStepPicName: formData.nextStepPicName,
        nextStepDueDate: formData.nextStepDueDate,
        isDone: false
      };
      
      await addMTSSConcern(caseId, concern);
      navigate(`/mtss/case/${caseId}`);
    } catch (err) {
      console.error(err);
      alert("Gagal menambahkan data. Silakan coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="max-w-4xl mx-auto pb-20 space-y-8">
      <header className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-400 hover:text-gray-900 transition-colors"
        >
          <ChevronLeft size={18} />
          Batal & Kembali
        </button>
        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
           Tambah Unit Data MTSS
        </div>
      </header>

      <div className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden">
        <div className="bg-[#002366] px-10 py-12 text-white relative">
          <div className="absolute top-0 right-0 p-8 opacity-10">
             <MessageSquare size={100} />
          </div>
          <div className="relative z-10 space-y-4">
             <div className="flex items-center gap-2">
                <AlertCircle className="text-blue-300" size={20} />
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-200">Incident Recording / Tier 1 Data</span>
             </div>
             <h1 className="text-4xl font-black italic tracking-tighter uppercase leading-none">Record New Interaction</h1>
             <p className="text-blue-100/70 text-xs font-bold uppercase tracking-widest">Siswa: {mtssCase?.studentName} | Case ID: #{caseId?.slice(-4)}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-12">
          {/* Section 1: Narrative */}
          <section className="space-y-6">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                   <MessageSquare size={20} />
                </div>
                <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 italic">01. Deskripsi Kejadian</h3>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest ml-1">Tanggal Kejadian</label>
                   <input
                     required
                     type="date"
                     className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 outline-none transition-all font-bold text-sm"
                     value={formData.date}
                     onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
                   />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest ml-1">Behavior Concern Narrative</label>
                   <textarea
                     required
                     rows={4}
                     placeholder="Apa yang terjadi? Deskripsikan secara objektif..."
                     className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 outline-none transition-all font-bold text-sm"
                     value={formData.description}
                     onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                   />
                </div>
             </div>
          </section>

          {/* Section 2: Interventions */}
          <section className="space-y-6">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                   <ClipboardCheck size={20} />
                </div>
                <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 italic">02. Intervensi yang Dilakukan</h3>
             </div>

             <div className="space-y-6">
                <div className="flex gap-4">
                   <input
                     type="text"
                     placeholder="Contoh: Memberikan time-out, diskusi personal, dsb."
                     className="flex-1 px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 outline-none transition-all font-bold text-sm"
                     value={formData.newIntervention}
                     onChange={e => setFormData(prev => ({ ...prev, newIntervention: e.target.value }))}
                     onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addIntervention())}
                   />
                   <button 
                     type="button"
                     onClick={addIntervention}
                     className="bg-gray-900 text-white px-8 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all"
                   >
                     Add
                   </button>
                   <button 
                     type="button"
                     onClick={handleAiDraft}
                     disabled={isAiLoading}
                     className="bg-blue-600 text-white px-6 rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-all disabled:opacity-50"
                   >
                     {isAiLoading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                   </button>
                </div>
                
                <div className="flex flex-wrap gap-2">
                   {formData.interventionsTried.map((it, i) => (
                     <div key={i} className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl text-[10px] font-black uppercase border border-emerald-100">
                        {it}
                        <button type="button" onClick={() => removeIntervention(i)} className="hover:text-rose-500 transition-colors">×</button>
                     </div>
                   ))}
                   {formData.interventionsTried.length === 0 && <p className="text-[10px] font-bold text-gray-400 uppercase italic">Belum ada intervensi tercatat.</p>}
                </div>

                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest ml-1">Progres Setelah Intervensi (Opsional)</label>
                   <textarea
                     rows={2}
                     placeholder="Bagaimana respons siswa?"
                     className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 outline-none transition-all font-bold text-sm"
                     value={formData.progressNotes}
                     onChange={e => setFormData(prev => ({ ...prev, progressNotes: e.target.value }))}
                   />
                </div>
             </div>
          </section>

          {/* Section 3: Next Steps */}
          <section className="space-y-6">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                   <TrendingUp size={20} />
                </div>
                <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 italic">03. Rencana Tindak Lanjut</h3>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-2">
                   <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest ml-1">Langkah Selanjutnya</label>
                   <input
                     required
                     type="text"
                     placeholder="Apa yang akan dilakukan berikutnya?"
                     className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 outline-none transition-all font-bold text-sm"
                     value={formData.nextSteps}
                     onChange={e => setFormData(prev => ({ ...prev, nextSteps: e.target.value }))}
                   />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest ml-1">Target Selesai</label>
                   <input
                     required
                     type="date"
                     className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 outline-none transition-all font-bold text-sm"
                     value={formData.nextStepDueDate}
                     onChange={e => setFormData(prev => ({ ...prev, nextStepDueDate: e.target.value }))}
                   />
                </div>
             </div>
          </section>

          <footer className="pt-10 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gray-900 text-white flex items-center justify-center text-xs font-black uppercase">
                   {profile?.displayName?.slice(0, 2) || 'ME'}
                </div>
                <div>
                   <p className="text-[10px] font-black uppercase text-gray-400">Recorded By</p>
                   <p className="text-sm font-black italic tracking-tight text-gray-900">{profile?.displayName}</p>
                </div>
             </div>
             
             <button
               type="submit"
               disabled={submitting}
               className="w-full md:w-auto bg-[#002366] text-white px-12 py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:scale-105 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
             >
                {submitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                Simpan & Update Kasus
             </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
