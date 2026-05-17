import * as React from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  User 
} from 'firebase/auth';
import { auth, googleProvider, getUserProfile, createUserOnboarding } from '../lib/firebase';
import { User as AppUser } from '../types';

interface AuthContextType {
  user: User | null;
  profile: AppUser | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<AppUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refreshProfile = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const p = await createUserOnboarding(user);
      setProfile(p);
    } catch (err: any) {
      console.error("Manual refresh error:", err);
      // Don't set global error here to not break the UI, 
      // the PendingPage will handle its local error
      throw err;
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        setLoading(true);
        setUser(user);
        if (user) {
          // Both checking existance and checking status are now handled
          // inside a single robust function to avoid race conditions.
          const p = await createUserOnboarding(user);
          setProfile(p);
        } else {
          setProfile(null);
        }
      } catch (err: any) {
        console.error("Auth initialization error:", err);
        setError(err.message || "Gagal memuat profil pengguna. Pastikan Firestore aktif dan rules diizinkan.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login Error:", error);
      setError(error.message);
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, error, signInWithGoogle, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
