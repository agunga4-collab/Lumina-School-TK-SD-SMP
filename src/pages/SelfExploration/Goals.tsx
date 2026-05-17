import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Target, Heart, Zap, Compass, Users, Lock, Eye, Save, Plus, X, Sparkles, Loader2, Edit3, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { VisibilityMode } from '../../types';

export default function Goals() {
  const [visibility, setVisibility] = React.useState<VisibilityMode>('MENTOR');
  const [isAiLoading, setIsAiLoading] = React.useState(false);
  const [aiSummary, setAiSummary] = React.useState<string | null>(null);
  const [isEditingSummary, setIsEditingSummary] = React.useState(false);
  
  // States for goals and interests
  const [strengths, setStrengths] = React.useState(['Desain Grafis', 'Matematika']);
  const [interests, setInterests] = React.useState(['Coding', 'Sepak Bola', 'Astronomi']);
  
  const [newS, setNewS] = React.useState('');
  const [newI, setNewI] = React.useState('');

  const handleAiSummary = async () => {
    setIsAiLoading(true);
    setAiSummary(null);
    
    // Simulating aggregation logic
    setTimeout(() => {
      setAiSummary("Siswa memiliki minat yang kuat di bidang teknologi (Coding) dan desain grafis, yang dipadukan dengan kemampuan logis yang baik (Matematika). Tujuan jangka pendeknya adalah membangun portofolio digital yang mencerminkan aspirasi masa depannya di industri kreatif.");
      setIsAiLoading(false);
    }, 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tujuan & Minatku</h1>
          <p className="text-gray-500">Mari petakan mimpi dan apa saja yang membuatmu bersemangat!</p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl">
          <VisibilityButton 
            active={visibility === 'SELF'} 
            onClick={() => setVisibility('SELF')}
            icon={<Lock size={16} />}
            label="Anak"
          />
          <VisibilityButton 
            active={visibility === 'MENTOR'} 
            onClick={() => setVisibility('MENTOR')}
            icon={<Users size={16} />}
            label="Mentor"
          />
          <VisibilityButton 
            active={visibility === 'PARENT'} 
            onClick={() => setVisibility('PARENT')}
            icon={<Eye size={16} />}
            label="Ortu"
          />
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Strengths & Interests */}
        <div className="space-y-8">
          <Card 
            title="Kekuatan Berbakti" 
            subtitle="Apa yang aku rasa jago atau kuat?"
            icon={<Zap className="text-yellow-500" />}
          >
            <div className="flex flex-wrap gap-2 mb-4">
              {strengths.map(s => (
                <Badge key={s} label={s} onRemove={() => setStrengths(strengths.filter(x => x !== s))} />
              ))}
            </div>
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Tambah kekuatan..." 
                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                value={newS}
                onChange={e => setNewS(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && (setStrengths([...strengths, newS]), setNewS(''))}
              />
              <button 
                onClick={() => (setStrengths([...strengths, newS]), setNewS(''))}
                className="p-2 bg-blue-600 text-white rounded-lg"
              >
                <Plus size={18} />
              </button>
            </div>
          </Card>

          <Card 
            title="Minat & Passion" 
            subtitle="Apa hal yang sangat membuatmu tertarik?"
            icon={<Heart className="text-red-500" />}
          >
            <div className="flex flex-wrap gap-2 mb-4">
              {interests.map(i => (
                <Badge key={i} label={i} onRemove={() => setInterests(interests.filter(x => x !== i))} />
              ))}
            </div>
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Tambah minat..." 
                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                value={newI}
                onChange={e => setNewI(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && (setInterests([...interests, newI]), setNewI(''))}
              />
              <button 
                onClick={() => (setInterests([...interests, newI]), setNewI(''))}
                className="p-2 bg-blue-600 text-white rounded-lg"
              >
                <Plus size={18} />
              </button>
            </div>
          </Card>
        </div>

        {/* Goals Section */}
        <div className="space-y-8">
          <Card 
            title="Tujuan Jangka Pendek" 
            subtitle="Target dalam 1-3 bulan ke depan"
            icon={<Compass className="text-blue-500" />}
          >
            <div className="space-y-4">
              <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                <p className="font-bold text-blue-900 border-b border-blue-100 pb-2 mb-2">Bisa membuat website portofolio sendiri</p>
                <div className="space-y-1">
                  <p className="text-xs text-blue-600 font-medium tracking-wide uppercase">Langkah Pertama:</p>
                  <ul className="text-sm text-blue-800 list-disc list-inside">
                    <li>Belajar HTML dasar melalui kursus online</li>
                    <li>Menyusun list karya desain yang sudah ada</li>
                  </ul>
                </div>
              </div>
              <button className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm font-medium hover:border-blue-300 hover:text-blue-500 transition-all flex items-center justify-center gap-2">
                <Plus size={16} />
                Tambah Tujuan
              </button>
            </div>
          </Card>

          <Card 
            title="Mimpi Masa Depan" 
            subtitle="Bayangan dirimu 5-10 tahun lagi"
            icon={<Target className="text-purple-500" />}
          >
            <textarea 
              rows={4}
              placeholder="Ceritakan mimpi besarmu di sini..."
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm leading-relaxed"
            />
          </Card>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-center items-center gap-6 pt-8">
        <button 
          onClick={handleAiSummary}
          disabled={isAiLoading}
          className="flex items-center gap-2 bg-white text-blue-600 border-2 border-blue-100 hover:bg-blue-50 font-bold px-8 py-3 rounded-2xl transition-all disabled:opacity-50"
        >
          {isAiLoading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
          Rangkum Tujuan Saya (AI)
        </button>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-12 py-3 rounded-2xl shadow-xl shadow-blue-100 transition-all active:scale-95">
          <Save size={20} />
          Simpan Semua Data
        </button>
      </div>

      <AnimatePresence>
        {aiSummary && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-blue-600 text-white p-8 rounded-3xl shadow-2xl relative overflow-hidden mt-8"
          >
            <div className="absolute top-0 right-0 p-6 opacity-10">
              <Sparkles size={64} />
            </div>
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-black uppercase tracking-widest text-blue-200 text-xs">Rangkuman Visi Lumina AI</h3>
              <button 
                onClick={() => setIsEditingSummary(!isEditingSummary)}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all"
              >
                {isEditingSummary ? <Check size={18} /> : <Edit3 size={18} />}
              </button>
            </div>
            
            {isEditingSummary ? (
              <textarea 
                className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white text-sm outline-none focus:bg-white/20 transition-all"
                rows={4}
                value={aiSummary}
                onChange={(e) => setAiSummary(e.target.value)}
              />
            ) : (
              <p className="text-lg font-medium leading-relaxed italic">
                "{aiSummary}"
              </p>
            )}
            
            <div className="mt-4 flex items-center justify-between">
              <span className="text-[10px] font-bold text-blue-200 uppercase tracking-widest">Dihasilkan oleh Lumina AI</span>
              <p className="text-[10px] text-blue-100 italic opacity-80">Rangkuman ini menggabungkan kekuatan, minat, dan target jangka panjangmu.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Card({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
          {icon}
        </div>
        <div>
          <h3 className="font-bold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

const Badge: React.FC<{ label: string; onRemove: () => void }> = ({ label, onRemove }) => {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold ring-1 ring-blue-100">
      {label}
      <button onClick={onRemove} className="hover:text-red-500 transition-colors">
        <X size={12} />
      </button>
    </div>
  );
};

function VisibilityButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
        active ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
