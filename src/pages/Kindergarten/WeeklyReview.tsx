import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, Loader2, Save, Send, Heart, Star, 
  Smile, Meh, Frown, Angry, CheckCircle2, LayoutDashboard,
  Calendar, ChevronRight, MessageCircleHeart, Edit3, Check
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { KGEmotionStatus } from '../../types';

interface EmotionalSummary {
  status: KGEmotionStatus;
  count: number;
}

import { GoogleGenAI } from '@google/genai';

export default function WeeklyReview() {
  const [isAiLoading, setIsAiLoading] = React.useState(false);
  const [selNotes, setSelNotes] = React.useState('');
  const [generalComment, setGeneralComment] = React.useState('');
  const [isEditingSel, setIsEditingSel] = React.useState(false);
  const [isEditingGen, setIsEditingGen] = React.useState(false);
  const [showAiLabelSel, setShowAiLabelSel] = React.useState(false);
  const [showAiLabelGen, setShowAiLabelGen] = React.useState(false);

  const emotionalPattern: EmotionalSummary[] = [
    { status: 'HAPPY', count: 3 },
    { status: 'OK', count: 1 },
    { status: 'SAD', count: 1 },
    { status: 'ANGRY', count: 0 },
  ];

  const handleAiSel = async () => {
    setIsAiLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "Tulis ringkasan perkembangan sosial emosional (SEL) anak TK bernama Zianka untuk minggu ini. Data: 3 hari Happy, 1 hari OK, 1 hari Sad. Nada: Hangat, profesional, informatif. Max 3 kalimat.",
      });
      setSelNotes(response.text || '');
      setIsEditingSel(true); // Open for editing
      setShowAiLabelSel(true);
    } catch (error) {
      console.error("AI Error:", error);
      setSelNotes("Zianka menunjukkan kondisi emosi yang stabil dan ceria minggu ini. Sebagian besar waktu dihabiskan dengan ekspresi 'Happy' saat bermain bersama teman.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAiGeneral = async () => {
    setIsAiLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "Tulis ringkasan perkembangan umum dan sentra anak TK bernama Zianka. Area: Art, Library, English. Pencapaian: Kolase tekstur BSB, kosakata Sea Animals meningkat. Max 3 kalimat.",
      });
      setGeneralComment(response.text || '');
      setIsEditingGen(true); // Open for editing
      setShowAiLabelGen(true);
    } catch (error) {
      console.error("AI Error:", error);
      setGeneralComment("Minggu ini Zianka sangat aktif mengeksplorasi Sentra Art & Library. Ia berhasil membuat karya kolase tekstur yang sangat variatif.");
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-12">
      <header className="flex justify-between items-end">
        <div>
           <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-600 text-[10px] font-black uppercase tracking-widest leading-none">Journal Mingguan</span>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Review Perkembangan Zianka</h1>
           </div>
           <p className="text-gray-500 font-medium text-sm italic">Status Terakhir: {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date())}</p>
        </div>
        <div className="flex items-center gap-3">
           <div className="w-12 h-12 rounded-2xl bg-white border border-pink-100 flex items-center justify-center text-pink-600 shadow-sm font-bold">Z</div>
        </div>
      </header>

      {/* Emotional Pattern Summary */}
      <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-gray-100 space-y-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-5">
           <Heart size={120} />
        </div>
        
        {/* Section 1: Weekly SEL Notes */}
        <section className="space-y-6 relative z-10">
           <div className="flex justify-between items-center bg-pink-50 p-6 rounded-3xl">
              <div className="flex items-center gap-4">
                 <div className="p-2 bg-white rounded-xl text-pink-500 shadow-sm">
                    <MessageCircleHeart size={24} />
                 </div>
                 <div>
                    <h3 className="font-bold text-gray-900">Weekly SEL Notes</h3>
                    <p className="text-[10px] uppercase font-black text-pink-400 tracking-widest">Kondisi Sosial-Emosional</p>
                 </div>
              </div>
              <button 
                onClick={handleAiSel}
                disabled={isAiLoading}
                className="flex items-center gap-2 bg-white text-pink-600 font-bold px-5 py-2 rounded-xl shadow-sm border border-pink-100 hover:bg-pink-50 transition-all disabled:opacity-50"
              >
                {isAiLoading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                <span className="text-xs">Bantu Tulis (AI)</span>
              </button>
           </div>

           <div className="flex gap-4">
              {emotionalPattern.map((p) => (
                <div key={p.status} className="flex-1 bg-gray-50 rounded-2xl p-4 border border-gray-100 flex flex-col items-center gap-2">
                   {getEmotionIcon(p.status)}
                   <span className="text-xl font-black text-gray-900">{p.count}</span>
                   <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{p.status}</span>
                </div>
              ))}
           </div>

           <div className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100 space-y-4">
              <div className="flex justify-between items-center">
                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Narasi Sosial-Emosional</p>
                 <button className="text-pink-400 hover:text-pink-600 transition-colors" onClick={() => setIsEditingSel(!isEditingSel)}>
                    {isEditingSel ? <Check size={16} /> : <Edit3 size={16} />}
                 </button>
              </div>
              {isEditingSel ? (
                <textarea 
                  className="w-full bg-white border border-pink-100 rounded-xl p-4 text-sm leading-relaxed text-gray-700 outline-none focus:ring-2 focus:ring-pink-300"
                  rows={4}
                  value={selNotes}
                  onChange={(e) => setSelNotes(e.target.value)}
                  placeholder="Ceritakan pola emosi anak minggu ini..."
                />
              ) : (
                <p className="text-sm text-gray-600 leading-relaxed italic">
                  {selNotes ? `"${selNotes}"` : "Klik tombol AI atau tulis catatan manual di sini untuk merangkum perkembangan emosi Ananda."}
                </p>
              )}
              {showAiLabelSel && (
                <p className="text-[10px] font-bold text-blue-500 italic mt-2">Dihasilkan oleh Lumina AI – mohon review sebelum disimpan</p>
              )}
           </div>
        </section>

        {/* Section 2: Weekly General Comment */}
        <section className="space-y-6 relative z-10 pt-10 border-t border-gray-50">
           <div className="flex justify-between items-center bg-blue-50 p-6 rounded-3xl">
              <div className="flex items-center gap-4">
                 <div className="p-2 bg-white rounded-xl text-blue-500 shadow-sm">
                    <Star size={24} />
                 </div>
                 <div>
                    <h3 className="font-bold text-gray-900">Weekly General Comment</h3>
                    <p className="text-[10px] uppercase font-black text-blue-400 tracking-widest">Perkembangan Umum & Sentra</p>
                 </div>
              </div>
              <button 
                onClick={handleAiGeneral}
                disabled={isAiLoading}
                className="flex items-center gap-2 bg-white text-blue-600 font-bold px-5 py-2 rounded-xl shadow-sm border border-blue-100 hover:bg-blue-50 transition-all disabled:opacity-50"
              >
                {isAiLoading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                <span className="text-xs">Bantu Tulis (AI)</span>
              </button>
           </div>

           <div className="bg-gray-50/50 rounded-2xl p-6 border border-gray-100 space-y-4">
              <div className="flex justify-between items-center">
                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Narasi Perkembangan Umum</p>
                 <button className="text-blue-400 hover:text-blue-600 transition-colors" onClick={() => setIsEditingGen(!isEditingGen)}>
                    {isEditingGen ? <Check size={16} /> : <Edit3 size={16} />}
                 </button>
              </div>
              {isEditingGen ? (
                <textarea 
                  className="w-full bg-white border border-blue-100 rounded-xl p-4 text-sm leading-relaxed text-gray-700 outline-none focus:ring-2 focus:ring-blue-300"
                  rows={4}
                  value={generalComment}
                  onChange={(e) => setGeneralComment(e.target.value)}
                  placeholder="Rangkum aktivitas dan pencapaian anak minggu ini..."
                />
              ) : (
                <p className="text-sm text-gray-600 leading-relaxed italic">
                  {generalComment ? `"${generalComment}"` : "Klik tombol AI atau tulis catatan manual di sini untuk merangkum aktivitas Sentra Ananda."}
                </p>
              )}
              {showAiLabelGen && (
                <p className="text-[10px] font-bold text-blue-500 italic mt-2">Dihasilkan oleh Lumina AI – mohon review sebelum disimpan</p>
              )}
           </div>

           <div className="flex justify-end gap-3 pt-6">
              <button className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white font-bold px-12 py-4 rounded-3xl shadow-xl shadow-pink-100 transition-all active:scale-95">
                 <Save size={20} />
                 Selesaikan Review Mingguan
              </button>
           </div>
        </section>
      </div>
    </div>
  );
}

function getEmotionIcon(status: KGEmotionStatus) {
  switch(status) {
    case 'HAPPY': return <Smile size={24} className="text-yellow-400" />;
    case 'OK': return <Meh size={24} className="text-emerald-400" />;
    case 'SAD': return <Frown size={24} className="text-blue-400" />;
    case 'ANGRY': return <Angry size={24} className="text-red-400" />;
  }
}
