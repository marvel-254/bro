import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { type User } from '../types';
import { useAuth as useClerkAuth, useUser, useClerk, useSignIn, useSignUp } from '@clerk/clerk-expo';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  verifyEmail: (_code: string) => Promise<void>;
  setUser: (user: User | null) => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { data: clerkUser, isLoaded: userIsLoaded } = useUser();
  const { signOut: clerkSignOut } = useClerk();
  const { signIn: clerkSignIn, isLoaded: signInIsLoaded } = useSignIn();
  const { signUp: clerkSignUp, isLoaded: signUpIsLoaded } = useSignUp();

  const [user, setUserState] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userIsLoaded && clerkUser) {
      const broUser: User = {
        id: clerkUser.id,
        username: clerkUser.username ?? clerkUser.emailAddresses[0]?.emailAddress?.split('@')[0] ?? 'user',
        displayName: clerkUser.firstName ?? clerkUser.lastName ?? clerkUser.username ?? clerkUser.emailAddresses[0]?.emailAddress?.split('@')[0] ?? 'user',
        avatar: clerkUser.imageUrl,
        isVerified: clerkUser.emailAddresses.find((addr: { verification?: { status?: string } }) => addr.verification && addr.verification.status === 'verified') !== undefined,
        createdAt: clerkUser.createdAt,
        status: isSignedIn ? 'online' : 'offline',
      };
      setUserState(broUser);
      setIsAuthenticated(true);
    } else {
      setUserState(null);
      setIsAuthenticated(false);
    }
  }, [userIsLoaded, clerkUser, isSignedIn]);

  useEffect(() => {
    setIsLoading(!isLoaded);
  }, [isLoaded]);

  const signInFunc = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      if (!signInIsLoaded || !clerkSignIn) {
        throw new Error('Authentication not ready');
      }
      await clerkSignIn.prepare({ identifier: email, password });
      await clerkSignIn.attempt({ identifier: email, password });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      console.error('Sign in failed:', err);
      setError(message);
      throw new Error(message);
    }
  }, [clerkSignIn, signInIsLoaded]);

  const signUpFunc = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      if (!signUpIsLoaded || !clerkSignUp) {
        throw new Error('Authentication not ready');
      }
      await clerkSignUp.prepare({ emailAddress: email, password });
      await clerkSignUp.create({ emailAddress: email, password });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed';
      console.error('Sign up failed:', err);
      setError(message);
      throw new Error(message);
    }
  }, [clerkSignUp, signUpIsLoaded]);

  const signOutFunc = useCallback(async () => {
    try {
      await clerkSignOut();
    } catch (err) {
      console.error('Sign out failed:', err);
      throw new Error('Sign out failed');
    }
  }, [clerkSignOut]);

  const verifyEmailFunc = useCallback(async (_code: string) => {
    throw new Error('Email verification not implemented — use Clerk dashboard or API');
  }, []);

  const setUserFunc = useCallback((user: User | null) => {
    setUserState(user);
    setIsAuthenticated(!!user);
  }, []);

  const clearErrorFunc = useCallback(() => {
    setError(null);
  }, []);

  if (isLoading) {
    return (
      <AuthContext.Provider
        value={{
          user: null,
          isLoading: true,
          isAuthenticated: false,
          error: null,
          signIn: async () => { throw new Error('Loading...'); },
          signUp: async () => { throw new Error('Loading...'); },
          signOut: async () => { throw new Error('Loading...'); },
          verifyEmail: async () => { throw new Error('Loading...'); },
          setUser: setUserFunc,
          clearError: clearErrorFunc,
        }}
      >
        {children}
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: false,
        isAuthenticated,
        error,
        signIn: signInFunc,
        signUp: signUpFunc,
        signOut: signOutFunc,
        verifyEmail: verifyEmailFunc,
        setUser: setUserFunc,
        clearError: clearErrorFunc,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}