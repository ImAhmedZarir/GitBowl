import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { 
  type User, 
  onAuthStateChanged,
  signOut as fbSignOutCore
} from "firebase/auth";
import { 
  firebaseAuth, 
  googleProvider, 
  githubProvider, 
  signInWithPopup 
} from "@/lib/firebase";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  role?: string | null;
  is_suspended?: boolean | null;
  created_at: string;
};

type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  signInWithGoogle: async () => {},
  signInWithGithub: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Firebase Auth ইউজার ডেটা থেকে প্রোফাইল স্টেট সেট করা
  async function loadProfile(currentUser: User | null | undefined) {
    if (!currentUser) {
      setProfile(null);
      return;
    }

    setProfile({
      id: currentUser.uid,
      username: currentUser.email?.split("@")[0] || currentUser.displayName || "user",
      display_name: currentUser.displayName ?? null,
      bio: null,
      role: "user",
      is_suspended: false,
      created_at: currentUser.metadata.creationTime || new Date().toISOString(),
    });
  }

  useEffect(() => {
    // Firebase Auth স্টেট পরিবর্তনের লিসেনার
    const unsubscribe = onAuthStateChanged(firebaseAuth, (currentUser) => {
      setUser(currentUser);
      void loadProfile(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(firebaseAuth, googleProvider);
    } catch (error) {
      console.error("Google sign in error:", error);
      throw error;
    }
  };

  const signInWithGithub = async () => {
    try {
      await signInWithPopup(firebaseAuth, githubProvider);
    } catch (error) {
      console.error("GitHub sign in error:", error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await fbSignOutCore(firebaseAuth);
      setUser(null);
      setProfile(null);
    } catch (error) {
      console.error("Sign out error:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signInWithGoogle,
        signInWithGithub,
        signOut,
        refreshProfile: () => loadProfile(user),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
