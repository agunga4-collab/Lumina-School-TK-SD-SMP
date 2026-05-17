import * as React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  ChevronLeft, Save, Star, Target, Users, Sparkles, 
  Loader2, ClipboardCheck, TrendingUp, ShieldCheck,
  AlertCircle, MessageSquare
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { GoogleGenAI, Type } from '@google/genai';

export default function InterventionPlan() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isAiLoading, setIsAiLoading] = React.useState(false);
  const [showAiLabel, setShowAiLabel] = React.useState(false);
  const [formData, setFormData] = React.useState({
    targetBehavior: '',
    replacementBehavior: '',
    preventionStrategy: '',
    roleTeacher: '',
    roleBK: '',
    roleParent: '',
    successIndicator: '',
    reviewSchedule: '',
  });

  const handleAiDraft = async () => {
    setIsAiLoading(true);
    setShowAiLabel(false);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Buat draf Behavior Intervention Plan (BIP) Case ID ${id}. Konteks: SMP Lazuardi (Positive Discipline). Siswa menginterupsi kelas saat frustrasi. Format JSON field: targetBehavior, replacementBehavior, preventionStrategy, roleTeacher, roleBK, roleParent, successIndicator, reviewSchedule.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              targetBehavior: { type: Type.STRING },
              replacementBehavior: { type: Type.STRING },
              preventionStrategy: { type: Type.STRING },
              roleTeacher: { type: Type.STRING },
              roleBK: { type: Type.STRING },
              roleParent: { type: Type.STRING },
              successIndicator: { type: Type.STRING },
              reviewSchedule: { type: Type.STRING }
            },
            required: ["targetBehavior", "replacementBehavior", "preventionStrategy", "roleTeacher", "roleBK", "roleParent", "successIndicator", "reviewSchedule"]
          }
        }
      });
      
      const resData = JSON.parse(response.text || '{}');
      setFormData(prev => ({ ...prev, ...resData }));
      setShowAiLabel(true);
    } catch (error) {
      console.error("AI Error:", error);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Intervention Plan (BIP) telah disimpan!');
    navigate(`/mtss/case/${id}`);
  };

  return (
    <div className="max-w-5xl mx-auto pb-20 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-400 hover:text-gray-900 transition-colors"
        >
          <ChevronLeft size={18} />
          Batal & Kembali
        </button>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
           <span>Intervention Plan</span>
           <span>/</span>
           <span className="text-blue-600">BIP Setup</span>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden">
        <div className="bg-[#002366] px-12 py-16 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-16 opacity-10">
             <Target size={160} />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-10">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                 <ShieldCheck className="text-blue-300" size={24} />
                 <span className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-200">Tier 2/3 Strategic Support</span>
              </div>
              <h1 className="text-5xl font-black italic tracking-tighter uppercase leading-none">Intervention Plan</h1>
              <p className="text-blue-100/70 text-sm font-bold uppercase tracking-widest max-w-xl">
                 Rancangan langkah intervensi terfokus untuk pemulihan dan perbaikan perilaku siswa SMP Lazuardi.
              </p>
            </div>
            
            <button 
              type="button"
              onClick={handleAiDraft}
              disabled={isAiLoading}
              className="flex items-center gap-3 bg-white text-[#002366] px-8 py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-widest transition-all hover:scale-105 active:scale-95 disabled:opacity-50 shadow-2xl"
            >
              {isAiLoading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
              Draft with Lumina AI
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-12 space-y-16">
          {/* Section: Fokus Perubahan */}
          <section className="space-y-8">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Star size={20} />
               </div>
               <h3 className="text-sm font-black uppercase tracking-[0.2em] text-gray-400 italic">01. Fokus Perubahan</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest ml-1">Target Perilaku (Reduksi)</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Perilaku spesifik yang ingin diperbaiki..."
                  className="w-full px-8 py-6 rounded-[2rem] bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-sm leading-relaxed"
                  value={formData.targetBehavior}
                  onChange={e => setFormData(prev => ({ ...prev, targetBehavior: e.target.value }))}
                />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest ml-1">Perilaku Pengganti (Positif)</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Respons alternatif yang diharapkan..."
                  className="w-full px-8 py-6 rounded-[2rem] bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-sm leading-relaxed"
                  value={formData.replacementBehavior}
                  onChange={e => setFormData(prev => ({ ...prev, replacementBehavior: e.target.value }))}
                />
              </div>
            </div>
          </section>

          {/* Section: Strategi Pencegahan */}
          <section className="space-y-8">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <TrendingUp size={20} />
               </div>
               <h3 className="text-sm font-black uppercase tracking-[0.2em] text-gray-400 italic">02. Strategi Antecedent</h3>
            </div>
            
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase text-gray-500 tracking-widest ml-1">Langkah Pencegahan & Pendukung</label>
              <textarea
                required
                rows={3}
                placeholder="Modifikasi lingkungan, instruksi, atau bantuan visual..."
                className="w-full px-8 py-6 rounded-[2rem] bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-sm leading-relaxed"
                value={formData.preventionStrategy}
                onChange={e => setFormData(prev => ({ ...prev, preventionStrategy: e.target.value }))}
              />
            </div>
          </section>

          {/* Section: Roles */}
          <section className="space-y-8">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Users size={20} />
               </div>
               <h3 className="text-sm font-black uppercase tracking-[0.2em] text-gray-400 italic">03. Pembagian Peran</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-3 p-6 bg-gray-50 rounded-[2rem]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Guru Matapel</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Support di kelas..."
                  className="w-full bg-white px-4 py-4 rounded-xl border border-transparent focus:border-blue-200 outline-none transition-all text-[11px] font-bold text-gray-700"
                  value={formData.roleTeacher}
                  onChange={e => setFormData(prev => ({ ...prev, roleTeacher: e.target.value }))}
                />
              </div>
              <div className="space-y-3 p-6 bg-blue-50/50 rounded-[2rem]">
                <label className="text-[9px] font-black text-blue-400 uppercase tracking-widest">BK / Mentor</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Bimbingan & Coaching..."
                  className="w-full bg-white px-4 py-4 rounded-xl border border-transparent focus:border-blue-200 outline-none transition-all text-[11px] font-bold text-gray-700"
                  value={formData.roleBK}
                  onChange={e => setFormData(prev => ({ ...prev, roleBK: e.target.value }))}
                />
              </div>
              <div className="space-y-3 p-6 bg-gray-50 rounded-[2rem]">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Orang Tua</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Dukungan di rumah..."
                  className="w-full bg-white px-4 py-4 rounded-xl border border-transparent focus:border-blue-200 outline-none transition-all text-[11px] font-bold text-gray-700"
                  value={formData.roleParent}
                  onChange={e => setFormData(prev => ({ ...prev, roleParent: e.target.value }))}
                />
              </div>
            </div>
          </section>

          {/* Monitoring */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Indikator Keberhasilan</h4>
              <input
                required
                type="text"
                placeholder="E.g. Berhasil tenang dalam 3 menit..."
                className="w-full px-8 py-5 rounded-[2rem] bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 outline-none transition-all font-bold text-sm"
                value={formData.successIndicator}
                onChange={e => setFormData(prev => ({ ...prev, successIndicator: e.target.value }))}
              />
            </div>
            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Jadwal Review</h4>
              <input
                required
                type="text"
                placeholder="E.g. Setiap Jumat siang"
                className="w-full px-8 py-5 rounded-[2rem] bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 outline-none transition-all font-bold text-sm"
                value={formData.reviewSchedule}
                onChange={e => setFormData(prev => ({ ...prev, reviewSchedule: e.target.value }))}
              />
            </div>
          </div>

          <div className="bg-gray-900 rounded-[2.5rem] p-10 text-white flex flex-col md:flex-row justify-between items-center gap-8 shadow-2xl">
            <div className="flex gap-4">
               <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-blue-300">
                  <ClipboardCheck size={28} />
               </div>
               <div>
                  <h4 className="text-xl font-black italic tracking-tighter uppercase">Finalize Plan</h4>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Pastikan semua pihak terkait telah menyetujui draf ini.</p>
               </div>
            </div>
            
            <div className="flex items-center gap-6">
               {showAiLabel && (
                  <p className="text-[10px] text-blue-300 italic font-black uppercase tracking-widest">Revised by AI</p>
               )}
               <button
                  type="submit"
                  className="bg-white text-gray-900 px-12 py-5 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] hover:bg-blue-600 hover:text-white transition-all shadow-xl active:scale-95"
               >
                  Save Intervention Plan
               </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
