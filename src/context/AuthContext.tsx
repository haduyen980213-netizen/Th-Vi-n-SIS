import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { apiRequest, setStoredSessionToken } from '../lib/api';
import { auth, googleAuthProvider } from '../lib/firebase';
import type { AuthUser, UserProfile, WalletSummary } from '../types/sis';

interface AuthContextValue {
  user: AuthUser | null;
  profile: UserProfile | null;
  wallet: WalletSummary | null;
  loading: boolean;
  refreshMe: () => Promise<AuthUser | null>;
  loginWithCredentials: (identifier: string, password: string) => Promise<void>;
  registerAccount: (payload: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
  }) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const data = await apiRequest<{
        user: AuthUser;
        profile: UserProfile | null;
        wallet: WalletSummary;
      }>('/auth/me');
      setUser(data.user);
      setProfile(data.profile);
      setWallet(data.wallet);
      return data.user;
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403) {
        setStoredSessionToken(null);
      }
      setUser(null);
      setProfile(null);
      setWallet(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const token = await fbUser.getIdToken();
          await apiRequest('/auth/firebase-sync', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch {
          // Ignore sync failure; refreshMe handles fallback
        }
      }
      await refreshMe();
    });
    return () => unsubscribe();
  }, [refreshMe]);

  const loginWithCredentials = async (identifier: string, password: string) => {
    const res = await apiRequest<{ sessionToken?: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    if (res.sessionToken) {
      setStoredSessionToken(res.sessionToken);
    }
    const loaded = await refreshMe();
    if (!loaded && res.user) {
      setUser(res.user);
    }
  };

  const registerAccount = async (payload: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
  }) => {
    const res = await apiRequest<{ sessionToken?: string; user: AuthUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.sessionToken) {
      setStoredSessionToken(res.sessionToken);
    }
    const loaded = await refreshMe();
    if (!loaded && res.user) {
      setUser(res.user);
    }
  };

  const loginWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    const idToken = await cred.user.getIdToken();
    await apiRequest('/auth/firebase-sync', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    await refreshMe();
  };

  const logout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    }
    setStoredSessionToken(null);
    if (auth.currentUser) {
      await signOut(auth).catch(() => {});
    }
    setUser(null);
    setProfile(null);
    setWallet(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        wallet,
        loading,
        refreshMe,
        loginWithCredentials,
        registerAccount,
        loginWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
