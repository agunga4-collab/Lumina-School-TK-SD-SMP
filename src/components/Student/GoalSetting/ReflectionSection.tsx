import * as React from 'react';
import { Sparkles, Heart, Compass } from 'lucide-react';

interface ReflectionSectionProps {
  aboutMe: string;
  strengths: string;
  areasForGrowth: string;
  disabled: boolean;
  onChange: (field: string, value: string) => void;
}

export default function ReflectionSection({
  aboutMe,
  strengths,
  areasForGrowth,
  disabled,
  onChange,
}: ReflectionSectionProps) {
  // Simple helper to auto-adjust height on load and change
  const adjustHeight = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
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
            disabled={disabled}
            value={aboutMe}
            onChange={(e) => {
              onChange('aboutMe', e.target.value);
              adjustHeight(e);
            }}
            placeholder="Type here..."
            className="w-full min-h-[120px] p-5 bg-gray-50 hover:bg-gray-100/50 focus:bg-white rounded-2xl border border-transparent focus:border-indigo-500 outline-none transition-all duration-200 text-sm font-medium text-gray-700 leading-relaxed placeholder:text-gray-300 resize-none disabled:opacity-75 disabled:hover:bg-gray-50"
          />
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
              disabled={disabled}
              value={strengths}
              onChange={(e) => {
                onChange('strengths', e.target.value);
                adjustHeight(e);
              }}
              placeholder="What are you good at? What went well in the past? e.g., persistent, good at drawing, helping friends..."
              className="w-full min-h-[160px] p-5 bg-gray-50 hover:bg-gray-100/50 focus:bg-white rounded-2xl border border-transparent focus:border-amber-500 outline-none transition-all duration-200 text-sm font-medium text-gray-700 leading-relaxed placeholder:text-gray-300 resize-none disabled:opacity-75 disabled:hover:bg-gray-50"
            />
          </div>

          {/* My Areas for Growth */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
              <Compass size={14} className="text-amber-500" /> My Areas for Growth
            </label>
            <textarea
              disabled={disabled}
              value={areasForGrowth}
              onChange={(e) => {
                onChange('areasForGrowth', e.target.value);
                adjustHeight(e);
              }}
              placeholder="What can you improve? What challenges are you aiming to overcome this semester?"
              className="w-full min-h-[160px] p-5 bg-gray-50 hover:bg-gray-100/50 focus:bg-white rounded-2xl border border-transparent focus:border-amber-500 outline-none transition-all duration-200 text-sm font-medium text-gray-700 leading-relaxed placeholder:text-gray-300 resize-none disabled:opacity-75 disabled:hover:bg-gray-50"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
