import * as React from 'react';
import { Sparkles, Heart, Compass } from 'lucide-react';

interface ReflectionSectionProps {
  aboutMe: string;
  strengths: string;
  areasForGrowth: string;
  disabled: boolean;
  onChange: (field: string, value: string) => void;
  reviews?: {
    aboutMe?: { status: string; comment?: string };
    strengths?: { status: string; comment?: string };
    growthAreas?: { status: string; comment?: string };
  };
}

export default function ReflectionSection({
  aboutMe,
  strengths,
  areasForGrowth,
  disabled,
  onChange,
  reviews,
}: ReflectionSectionProps) {
  // Simple helper to auto-adjust height on load and change
  const adjustHeight = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const isFieldDisabled = (fieldName: 'aboutMe' | 'strengths' | 'growthAreas') => {
    if (disabled) return true;
    if (!reviews) return false;
    const rev = reviews[fieldName];
    if (!rev) return false;
    return rev.status !== 'REVISION_REQUIRED';
  };

  const renderFeedback = (fieldName: 'aboutMe' | 'strengths' | 'growthAreas') => {
    const rev = reviews?.[fieldName];
    if (!rev || !rev.comment) return null;
    
    return (
      <div className={`p-4 rounded-xl text-xs mt-3 font-medium border ${
        rev.status === 'APPROVED' 
          ? 'bg-emerald-50 text-emerald-800 border-emerald-100' 
          : rev.status === 'REVISION_REQUIRED' 
            ? 'bg-rose-50 text-rose-800 border-rose-100 animate-pulse' 
            : 'bg-gray-50 text-gray-700 border-gray-100'
      }`}>
        <p className="font-bold flex items-center gap-1 text-[10px] uppercase tracking-wider">
          {rev.status === 'APPROVED' ? '✓ Disetujui Guru' : rev.status === 'REVISION_REQUIRED' ? '⚠ Perlu Revisi' : 'Reviewer'}
        </p>
        <p className="mt-1.5 leading-relaxed">{rev.comment}</p>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Introduction Card */}
      <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <Compass size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">About Me</h2>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Introduce Yourself</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
            About Me
          </label>
          <p className="text-xs text-gray-400 font-medium">
            Share a short introduction about yourself, your interests, or what matters to you this semester.
          </p>
          <textarea
            disabled={isFieldDisabled('aboutMe')}
            value={aboutMe}
            onChange={(e) => {
              onChange('aboutMe', e.target.value);
              adjustHeight(e);
            }}
            placeholder="Type here..."
            className="w-full min-h-[120px] p-5 bg-gray-50 hover:bg-gray-100/50 focus:bg-white rounded-2xl border border-transparent focus:border-indigo-500 outline-none transition-all duration-200 text-sm font-medium text-gray-700 leading-relaxed placeholder:text-gray-300 resize-none disabled:opacity-75 disabled:hover:bg-gray-50"
          />
          {renderFeedback('aboutMe')}
        </div>
      </div>

      {/* Strengths & Growth Areas */}
      <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm space-y-8">
        <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
            <Sparkles size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">Personal Reflection</h2>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Acknowledge Strengths & Growth Areas</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* My Strengths */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
              <Heart size={14} className="text-rose-500 fill-rose-500" /> My Strengths
            </label>
            <textarea
              disabled={isFieldDisabled('strengths')}
              value={strengths}
              onChange={(e) => {
                onChange('strengths', e.target.value);
                adjustHeight(e);
              }}
              placeholder="What are you good at? What went well in the past? e.g., persistent, good at drawing, helping friends..."
              className="w-full min-h-[160px] p-5 bg-gray-50 hover:bg-gray-100/50 focus:bg-white rounded-2xl border border-transparent focus:border-amber-500 outline-none transition-all duration-200 text-sm font-medium text-gray-700 leading-relaxed placeholder:text-gray-300 resize-none disabled:opacity-75 disabled:hover:bg-gray-50"
            />
            {renderFeedback('strengths')}
          </div>

          {/* My Areas for Growth */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
              <Compass size={14} className="text-amber-500" /> My Areas for Growth
            </label>
            <textarea
              disabled={isFieldDisabled('growthAreas')}
              value={areasForGrowth}
              onChange={(e) => {
                onChange('areasForGrowth', e.target.value);
                adjustHeight(e);
              }}
              placeholder="What can you improve? What challenges are you aiming to overcome this semester?"
              className="w-full min-h-[160px] p-5 bg-gray-50 hover:bg-gray-100/50 focus:bg-white rounded-2xl border border-transparent focus:border-amber-500 outline-none transition-all duration-200 text-sm font-medium text-gray-700 leading-relaxed placeholder:text-gray-300 resize-none disabled:opacity-75 disabled:hover:bg-gray-50"
            />
            {renderFeedback('growthAreas')}
          </div>
        </div>
      </div>
    </div>
  );
}
