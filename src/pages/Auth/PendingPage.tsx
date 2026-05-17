import * as React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { ShieldAlert, LogOut } from 'lucide-react';
import { motion } from 'motion/react';
import { LuminaLogo } from '../../components/LuminaLogo';

export default function PendingPage() {
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const [isCheckingManual, setIsCheckingManual] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

  // Debug logging as requested
  React.useEffect(() => {
    if (user) {
      console.log("[PendingPage] Auth Info:", {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified
      });
      console.log("[PendingPage] Current Profile Snapshot:", profile);
    }
  }, [user, profile]);

  const handleCheckStatus = async () => {
    setLocalError(null);
    setIsCheckingManual(true);
    try {
      console.log("[PendingPage] Initiating manual status check...");
      await refreshProfile();
      console.log("[PendingPage] Status check completed.");
    } catch (err: any) {
      console.error("[PendingPage] Error checking status:", err);
      
      let errorMsg = "Gagal mengecek status. Silakan coba lagi.";
      
      // Check for PERMISSION_DENIED
      if (err.message) {
        if (err.message.includes("PERMISSION_DENIED") || err.message.includes("insufficient permissions")) {
          errorMsg = "Error: PERMISSION_DENIED. Client tidak diizinkan membaca data undangan. Periksa Firestore Rules.";
        } else {
          try {
            // Attempt to parse FirestoreErrorInfo JSON if present
            const errorInfo = JSON.parse(err.message);
            if (errorInfo.error?.includes("PERMISSION_DENIED")) {
              errorMsg = "Error: PERMISSION_DENIED (Detailed). Periksa akses roleInvites.";
            }
          } catch (e) {
            // Not JSON or other error, keep previous msg
          }
        }
      }
      
      setLocalError(errorMsg);
    } finally {
      setIsCheckingManual(false);
    }
  };

  // If loading (initial or manual), show centered spinner
  if (loading || isCheckingManual) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#002366] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-bold text-gray-500 animate-pulse capitalize tracking-widest">Memperbarui Status...</p>
        </div>
      </div>
    );
  }

  // Guard: If not logged in at all, go to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Guard: If status becomes active, automatically redirect to dashboard
  if (profile?.status === 'active') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-40">
        <div className="absolute top-[10%] left-[10%] w-[30%] h-[30%] bg-blue-100 rounded-full blur-[100px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-10 border border-blue-100 text-center space-y-8 relative z-10"
      >
        <LuminaLogo size="xl" className="mx-auto" />
        
        <div className="space-y-3">
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">Menunggu Verifikasi</h2>
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
             <p className="text-sm font-bold text-gray-700">{profile?.displayName}</p>
             <p className="text-xs text-gray-400 font-medium">{profile?.email}</p>
          </div>
          <p className="text-sm text-gray-500 leading-relaxed">
            Akun Anda belum terdaftar dalam daftar undangan resmi LUMINA. 
            Silakan hubungi <b>admin sekolah</b> untuk mendapatkan akses.
          </p>
          {localError && (
            <p className="text-xs text-red-500 font-bold bg-red-50 py-2 rounded-lg border border-red-100">
              {localError}
            </p>
          )}
        </div>

        <div className="pt-4 space-y-4">
           <button 
             onClick={handleCheckStatus}
             className="w-full py-4 bg-[#002366] text-white rounded-2xl font-bold hover:opacity-90 transition-all shadow-lg shadow-blue-100 flex items-center justify-center gap-2"
           >
             Cek Ulang Status
           </button>
           
           <button 
             onClick={signOut}
             className="w-full flex items-center justify-center gap-2 py-2 text-sm font-bold text-gray-400 hover:text-red-500 transition-colors"
           >
             <LogOut size={16} />
             Ganti Akun Google
           </button>
        </div>
      </motion.div>
    </div>
  );
}
