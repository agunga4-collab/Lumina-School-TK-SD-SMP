import * as React from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, Info, Send, User, Calendar, 
  MapPin, Clock, FileText, AlertCircle, Sparkles,
  Layers, MessageSquare, Briefcase, Loader2, X
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { createMTSSCase, addMTSSConcern } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import type { MTSSTier, MTSSStatus } from '../../types';

import StudentSearch from '../../components/StudentSearch';

export default function CreateCase() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formData, setFormData] = React.useState({
    studentName: '',
    studentId: '',
    classId: '',
    academicYear: '2025/2026',
    tier: 'Tier 1' as MTSSTier,
    status: 'OPEN' as MTSSStatus,
    date: new Date().toISOString().split('T')[0],
    time: '',
    location: '',
    description: '',
    interventionsTried: '',
    nextSteps: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // 1. Create the MTSS Case
      const caseId = await createMTSSCase({
        studentId: formData.studentId || 'S' + Math.floor(Math.random() * 1000),
        studentName: formData.studentName,
        classId: formData.classId,
        academicYear: formData.academicYear,
        tier: formData.tier,
        status: formData.status,
        picId: profile?.uid || 'unknown',
        picName: profile?.displayName || 'Unknown Teacher',
        totalConcerns: 1,
        lastConcernSummary: formData.description,
        lastConcernDate: Date.now(),
      });

      if (caseId) {
        // 2. Add the initial concern
        await addMTSSConcern(caseId, {
          date: formData.date,
          description: formData.description,
          reporterId: profile?.uid || 'unknown',
          reporterName: profile?.displayName || 'Unknown Teacher',
          interventionsTried: formData.interventionsTried.split(',').map(i => i.trim()),
          nextSteps: formData.nextSteps,
          isDone: false,
        });

        navigate('/mtss/cases');
      }
    } catch (error) {
      console.error("Error creating case:", error);
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
            <h1 className="text-4xl font-black italic tracking-tighter uppercase mb-2">Lapor Kasus Perilaku</h1>
            <p className="text-blue-100/70 text-xs font-bold uppercase tracking-widest">SMP Lazuardi GCS • Dokumentasi Tier 1/2/3</p>
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
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Cari & Pilih Siswa</label>
                <StudentSearch 
                  placeholder="Ketik nama lengkap atau panggilan..."
                  onSelect={(student) => {
                    setFormData(prev => ({ 
                      ...prev, 
                      studentName: student.name,
                      studentId: student.id,
                      classId: student.className || prev.classId
                    }));
                  }}
                />
                {formData.studentName && (
                  <div className="mt-2 px-4 py-2 bg-blue-50 rounded-xl flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-700">Terpilih: {formData.studentName}</span>
                    <button 
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, studentName: '', studentId: '' }))}
                      className="text-blue-400 hover:text-blue-600"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Kelas</label>
                <div className="relative">
                  <select
                    required
                    className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-sm appearance-none cursor-pointer"
                    value={formData.classId}
                    onChange={e => setFormData(prev => ({ ...prev, classId: e.target.value }))}
                  >
                    <option value="">Pilih Kelas</option>
                    <option value="7-A">7-A</option>
                    <option value="7-B">7-B</option>
                    <option value="7-C">7-C</option>
                    <option value="8-A">8-A</option>
                    <option value="8-B">8-B</option>
                    <option value="9-A">9-A</option>
                    <option value="9-B">9-B</option>
                  </select>
                  <ChevronLeft className="absolute right-4 top-1/2 -translate-y-1/2 rotate-[-90deg] text-gray-400 pointer-events-none" size={18} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Tier Awal</label>
                <div className="flex p-1 bg-gray-100 rounded-2xl gap-1">
                   {['Tier 1', 'Tier 2', 'Tier 3'].map(t => (
                     <button
                       key={t}
                       type="button"
                       onClick={() => setFormData(prev => ({ ...prev, tier: t as MTSSTier }))}
                       className={cn(
                         "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                         formData.tier === t ? "bg-white text-blue-600 shadow-sm scale-105" : "text-gray-400 hover:text-gray-600"
                       )}
                     >
                       {t}
                     </button>
                   ))}
                </div>
              </div>
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
          </div>

          {/* Section: Kejadian */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
               <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <AlertCircle size={18} />
               </div>
               <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Detail Kejadian</h3>
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
                    placeholder="E.g. Kantin"
                    className="w-full pl-12 pr-4 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-sm"
                    value={formData.location}
                    onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Deskripsi Objektif</label>
              <textarea
                required
                rows={4}
                placeholder="Jelaskan apa yang diobservasi secara detail dan objektif..."
                className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-sm leading-relaxed"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>

          {/* Section: Intervensi */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
               <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Briefcase size={18} />
               </div>
               <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Tindakan Langsung</h3>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Intervensi yang sudah dilakukan</label>
              <textarea
                placeholder="E.g. Teguran lisan, bicara personal, pisahkan tempat duduk... (pisahkan dengan koma)"
                className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-sm leading-relaxed"
                value={formData.interventionsTried}
                onChange={e => setFormData(prev => ({ ...prev, interventionsTried: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-1">Rencana Langkah Selanjutnya</label>
              <input
                type="text"
                placeholder="E.g. Diskusi dengan wali kelas pada 24 April"
                className="w-full px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-50 outline-none transition-all font-bold text-sm"
                value={formData.nextSteps}
                onChange={e => setFormData(prev => ({ ...prev, nextSteps: e.target.value }))}
              />
            </div>
          </div>

          <div className="bg-blue-50 p-8 rounded-[2rem] flex gap-4 items-start border border-blue-100 shadow-inner">
            <Info className="text-blue-500 shrink-0 mt-1" size={24} />
            <div className="space-y-1">
               <h4 className="text-xs font-black text-blue-900 tracking-tight uppercase italic">Penting</h4>
               <p className="text-[11px] font-bold text-blue-700 leading-relaxed uppercase tracking-wide">
                  Laporan ini akan otomatis membuat entitas "Data 1" untuk siswa tersebut. Tim BK akan meninjau level keparahan (Tier) dalam 24 jam kerja.
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
