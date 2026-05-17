import * as React from 'react';
import { 
  User, Mail, Shield, BadgeCheck, Camera, 
  Save, Loader2, Key, PenTool, Hash
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { cn } from '../../lib/utils';

export default function ProfilePage() {
  const { profile } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  
  // States for editable fields
  const [niy, setNiy] = React.useState(profile?.niy || '');
  const [signatureUrl, setSignatureUrl] = React.useState(profile?.signatureUrl || '');

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    
    setLoading(true);
    setSuccess(false);
    
    try {
      const userRef = doc(db, 'users', profile.uid);
      await updateDoc(userRef, {
        niy: niy || null,
        signatureUrl: signatureUrl || null,
        updatedAt: Date.now()
      });
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!profile) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header Profile */}
      <div className="relative group">
        <div className="h-48 rounded-[2.5rem] bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 shadow-xl overflow-hidden relative">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
        </div>
        
        <div className="px-8 -mt-20 relative flex flex-col md:flex-row items-end gap-6">
          <div className="relative">
            <div className="w-40 h-40 rounded-[2.5rem] bg-white p-2 shadow-2xl border-4 border-white overflow-hidden group/avatar">
              {profile.photoURL ? (
                <img 
                  src={profile.photoURL} 
                  alt={profile.displayName} 
                  className="w-full h-full object-cover rounded-[2rem]"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full bg-blue-100 flex items-center justify-center text-4xl font-black text-blue-600 rounded-[2rem]">
                  {profile.displayName[0]}
                </div>
              )}
              <button className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-all rounded-[2rem]">
                <Camera className="text-white" size={32} />
              </button>
            </div>
            <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white p-2 rounded-2xl border-4 border-white shadow-lg">
               <BadgeCheck size={20} />
            </div>
          </div>
          
          <div className="pb-4 flex-1 text-center md:text-left">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{profile.displayName}</h1>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mt-2">
               <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-full border border-blue-100">
                  <Shield size={12} /> {profile.role.replace('_', ' ')}
               </span>
               <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-50 text-gray-500 text-[10px] font-black uppercase tracking-widest rounded-full border border-gray-100">
                  <Mail size={12} /> {profile.email}
               </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Stats & Meta */}
        <div className="space-y-6">
           <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Account Information</h3>
              <div className="space-y-4">
                 <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-50 rounded-xl text-blue-600"><Key size={16} /></div>
                    <div>
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Role ID</p>
                       <p className="text-sm font-bold text-gray-900">{profile.role}</p>
                    </div>
                 </div>
                 <div className="flex items-start gap-3">
                    <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600"><BadgeCheck size={16} /></div>
                    <div>
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</p>
                       <p className="text-sm font-bold text-gray-900">{profile.status}</p>
                    </div>
                 </div>
                 <div className="flex items-start gap-3">
                    <div className="p-2 bg-purple-50 rounded-xl text-purple-600"><Hash size={16} /></div>
                    <div>
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">User UID</p>
                       <p className="text-[10px] font-mono font-medium text-gray-500 break-all">{profile.uid}</p>
                    </div>
                 </div>
              </div>
           </div>

           <div className="bg-blue-600 p-8 rounded-[2.5rem] shadow-xl shadow-blue-100 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10"><Shield size={80} /></div>
              <h4 className="text-xs font-black uppercase tracking-widest mb-2">Security Notice</h4>
              <p className="text-xs font-medium text-blue-100 leading-relaxed">
                 Protect your digital identity. Your LXD signatures and academic records are legally binding within the Lazuardi GCS ecosystem.
              </p>
           </div>
        </div>

        {/* Right Column: Edit Profile */}
        <div className="lg:col-span-2 space-y-8">
           <form onSubmit={handleUpdateProfile} className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-8">
              <div className="flex items-center gap-3">
                 <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
                 <h2 className="text-xl font-black text-gray-900 tracking-tight">Academic Identity</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="space-y-3">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                       <Hash size={14} className="text-blue-500" /> Nomor Induk Yayasan (NIY)
                    </label>
                    <input 
                      type="text"
                      value={niy}
                      onChange={(e) => setNiy(e.target.value)}
                      placeholder="e.g. 192837465"
                      className="w-full px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100 text-sm font-bold focus:ring-4 focus:ring-blue-50 focus:border-blue-200 transition-all outline-none"
                    />
                    <p className="text-[10px] text-gray-400 font-medium px-2 italic">Digunakan untuk validasi dokumen resmi dan tanda tangan LXD.</p>
                 </div>

                 <div className="space-y-3">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                       <PenTool size={14} className="text-blue-500" /> Digital Signature URL
                    </label>
                    <input 
                      type="text"
                      value={signatureUrl}
                      onChange={(e) => setSignatureUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100 text-sm font-bold focus:ring-4 focus:ring-blue-50 focus:border-blue-200 transition-all outline-none"
                    />
                    <p className="text-[10px] text-gray-400 font-medium px-2 italic">URL gambar tanda tangan (PNG transparent direkomendasikan).</p>
                 </div>
              </div>

              {signatureUrl && (
                <div className="p-6 bg-gray-50 rounded-3xl border border-dashed border-gray-200 text-center space-y-4">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Signature Preview</p>
                   <div className="h-32 flex items-center justify-center bg-white rounded-2xl p-4 shadow-inner">
                      <img src={signatureUrl} alt="Signature Preview" className="max-h-full object-contain" />
                   </div>
                </div>
              )}

              <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-4 border-t border-gray-100">
                 <div className={cn(
                    "flex items-center gap-3 transition-all duration-500",
                    success ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4 pointer-events-none"
                 )}>
                    <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                       <BadgeCheck size={18} />
                    </div>
                    <p className="text-sm font-bold text-emerald-600">Profile updated successfully!</p>
                 </div>

                 <button 
                   type="submit"
                   disabled={loading}
                   className="w-full md:w-fit flex items-center gap-3 px-10 py-4 bg-[#002366] text-white rounded-[1.5rem] font-black uppercase tracking-[0.2em] text-[11px] shadow-2xl shadow-blue-100 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                 >
                   {loading ? (
                     <Loader2 className="animate-spin" size={18} />
                   ) : (
                     <Save size={18} />
                   )}
                   Save Changes
                 </button>
              </div>
           </form>

           <div className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-8 grayscale">
              <div className="flex items-center gap-3">
                 <div className="w-1.5 h-8 bg-gray-300 rounded-full" />
                 <h2 className="text-xl font-black text-gray-400 tracking-tight">Security Settings</h2>
              </div>
              <div className="p-6 bg-gray-50 rounded-3xl flex items-center justify-between opacity-50 cursor-not-allowed">
                 <div className="flex items-center gap-4">
                    <div className="p-3 bg-white rounded-2xl shadow-sm"><User size={24} className="text-gray-400" /></div>
                    <div>
                       <h4 className="text-sm font-bold text-gray-700">Account Password</h4>
                       <p className="text-xs font-medium text-gray-500">Auth managed by Google Workspace SSO</p>
                    </div>
                 </div>
                 <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-3 py-1 bg-white rounded-lg border border-gray-100">Fixed</span>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
