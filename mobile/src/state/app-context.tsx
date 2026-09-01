import type { Session as AuthSession } from '@supabase/supabase-js';
import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { palettes, type ColorScheme, type Palette, type ThemeMode } from '@/design/tokens';
import {
  currentBlock,
  defaultProfile,
  initialProposal,
  initialWeek,
  mockChatAnswers,
  progressMetrics,
} from '@/data/mock';
import type { ChatMessage, Effort, Profile, Proposal, Session } from '@/domain/types';
import { rangeAroundToday } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import {
  completeOnboarding as completeRemoteOnboarding,
  generateAndSavePlan,
  getAuthSession,
  liveApiConfigured,
  loadProfile,
  loadWorkouts,
  requestPasswordReset as apiRequestPasswordReset,
  saveProfile,
  signIn as apiSignIn,
  signInWithGoogle as apiSignInWithGoogle,
  signOut as apiSignOut,
  signUp as apiSignUp,
  streamChat,
  supabase,
  updateExerciseCompletion,
  updatePassword as apiUpdatePassword,
} from '@/services/api';
import { loadSnapshot, saveSnapshot, type Snapshot } from '@/state/storage';

type AuthActionResult = { ok: true; message?: string } | { ok: false; message: string };

type AppContextValue = {
  hydrated: boolean;
  accountReady: boolean;
  passwordRecovery: boolean;
  profile: Profile;
  sessions: Session[];
  proposal: Proposal | null;
  block: typeof currentBlock;
  metrics: typeof progressMetrics;
  authSession: AuthSession | null;
  previewMode: boolean;
  colors: Palette;
  colorScheme: ColorScheme;
  notice: string | null;
  chatMessages: ChatMessage[];
  chatBusy: boolean;
  finishOnboarding: (profile: Profile) => Promise<void>;
  resetOnboarding: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  updateProfile: (update: Partial<Profile>) => void;
  acceptProposal: () => void;
  declineProposal: () => void;
  shortenToday: () => void;
  updateSet: (sessionId: string, exerciseId: string, setId: string, update: { weight?: number | null; reps?: number | null; done?: boolean }) => void;
  addSet: (sessionId: string, exerciseId: string) => void;
  removeSet: (sessionId: string, exerciseId: string) => void;
  skipExercise: (sessionId: string, exerciseId: string) => void;
  setEffort: (sessionId: string, exerciseId: string, effort: Effort) => void;
  finishSession: (sessionId: string, note?: string) => void;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signInWithGoogle: () => Promise<AuthActionResult>;
  signUp: (email: string, password: string) => Promise<AuthActionResult>;
  requestPasswordReset: (email: string) => Promise<AuthActionResult>;
  updatePassword: (password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
  refreshLiveData: () => Promise<void>;
  sendChat: (question: string, context?: string) => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

const welcomeMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'I know your plan and your log — nothing else unless you tell me. Ask about today, the shape of this week, or what to change when plans move.',
  basis: 'Your current Arcel preview.',
};

export function AppProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [hydrated, setHydrated] = useState(false);
  const [accountReady, setAccountReady] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [sessions, setSessions] = useState<Session[]>(initialWeek);
  const [proposal, setProposal] = useState<Proposal | null>(initialProposal);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [chatBusy, setChatBusy] = useState(false);

  const colorScheme: ColorScheme = profile.theme === 'system'
    ? systemScheme === 'dark' ? 'dark' : 'light'
    : profile.theme;
  const colors = palettes[colorScheme];

  useEffect(() => {
    let mounted = true;
    const hydrate = async () => {
      try {
        const session = await getAuthSession();
        const local = await loadSnapshot(session);
        if (!mounted) return;
        setProfile(local.profile);
        setSessions(local.sessions);
        setProposal(local.proposal);
        setAuthSession(session);
        if (session && liveApiConfigured) {
          const range = rangeAroundToday();
          const [remoteProfile, remoteSessions] = await Promise.all([
            loadProfile(session.access_token, local.profile),
            loadWorkouts(session.access_token, range.start, range.end),
          ]);
          if (!mounted) return;
          setProfile((current) => ({ ...current, ...remoteProfile, theme: current.theme }));
          if (remoteSessions.length) setSessions(remoteSessions);
        }
      } catch (error) {
        setNotice(errorMessage(error, 'Could not restore local data.'));
      } finally {
        if (mounted) {
          setAccountReady(true);
          setHydrated(true);
        }
      }
    };
    void hydrate();

    const authSubscription = supabase?.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setAuthSession(session);
      if (!session) setAccountReady(true);
    });
    return () => {
      mounted = false;
      authSubscription?.data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const snapshot: Snapshot = { profile, sessions, proposal };
    void saveSnapshot(authSession, snapshot);
  }, [authSession, hydrated, profile, proposal, sessions]);

  const refreshLiveData = useCallback(async () => {
    if (!authSession || !liveApiConfigured) return;
    try {
      const range = rangeAroundToday();
      const [remoteProfile, remoteSessions] = await Promise.all([
        loadProfile(authSession.access_token, profile),
        loadWorkouts(authSession.access_token, range.start, range.end),
      ]);
      setProfile((current) => ({ ...current, ...remoteProfile, theme: current.theme }));
      if (remoteSessions.length) setSessions(remoteSessions);
      setNotice(null);
    } catch (error) {
      setNotice(`${errorMessage(error, 'Live data is unavailable.')} Showing the local preview.`);
    }
  }, [authSession, profile]);

  useEffect(() => {
    if (!authSession || !hydrated || accountReady) return;
    let active = true;
    const resolveAccount = async () => {
      try {
        const local = await loadSnapshot(authSession);
        const range = rangeAroundToday();
        const [remoteProfile, remoteSessions] = await Promise.all([
          loadProfile(authSession.access_token, local.profile),
          loadWorkouts(authSession.access_token, range.start, range.end),
        ]);
        if (!active) return;
        setProfile(remoteProfile);
        setSessions(remoteSessions.length ? remoteSessions : initialWeek);
        setProposal(initialProposal);
        setNotice(null);
      } catch (error) {
        if (active) setNotice(errorMessage(error, 'Could not load your account.'));
      } finally {
        if (active) setAccountReady(true);
      }
    };
    void resolveAccount();
    return () => { active = false; };
  }, [accountReady, authSession, hydrated]);

  const finishOnboarding = async (nextProfile: Profile) => {
    const completeProfile = { ...nextProfile, onboardingComplete: true };
    setProfile(completeProfile);
    setNotice(null);
    if (!authSession || !liveApiConfigured) return;

    try {
      await saveProfile(authSession.access_token, completeProfile);
      await completeRemoteOnboarding(authSession.access_token);
      await generateAndSavePlan(authSession.access_token, completeProfile);
      await refreshLiveData();
    } catch (error) {
      setNotice(`${errorMessage(error, 'Could not finish the live setup.')} Your local week is ready.`);
    }
  };

  const resetOnboarding = () => {
    setProfile((current) => ({ ...current, onboardingComplete: false }));
  };

  const setThemeMode = (mode: ThemeMode) => setProfile((current) => ({ ...current, theme: mode }));
  const updateProfile = (update: Partial<Profile>) => setProfile((current) => ({ ...current, ...update }));

  const acceptProposal = () => {
    setSessions((current) => current.map((session) => {
      if (session.status !== 'planned' || session.modality === 'rest') return session;
      const isIntervals = session.title.toLowerCase().includes('interval');
      const target = isIntervals ? 4 : 2;
      return {
        ...session,
        repairedNote: 'Eased after a disrupted week',
        receipt: {
          summary: 'Volume eased; weights protected',
          kept: session.exercises.filter((item) => item.role !== 'accessory').map((item) => ({ name: item.name, why: 'Keeps the main thread of the session.' })),
          cut: session.exercises.filter((item) => item.role === 'accessory').map((item) => ({ name: item.name, why: 'Accessory work goes first when the week needs room.' })),
        },
        exercises: session.exercises
          .filter((item) => item.role !== 'accessory')
          .map((item) => ({ ...item, targetSets: Math.min(item.targetSets, target), sets: item.sets.slice(0, target) })),
      };
    }));
    setProposal(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const declineProposal = () => setProposal(null);

  const shortenToday = () => {
    setSessions((current) => current.map((session) => {
      const isToday = session.id === 's-today' || session.date === new Date().toISOString().slice(0, 10);
      if (!isToday) return session;
      const exercises = session.exercises
        .filter((item) => item.role !== 'accessory')
        .map((item) => ({
          ...item,
          sets: item.kind === 'time' ? item.sets : item.sets.slice(0, Math.max(1, item.sets.length - 1)),
          targetSeconds: item.kind === 'time' && item.targetSeconds ? Math.min(item.targetSeconds, 600) : item.targetSeconds,
        }));
      return {
        ...session,
        minutes: 25,
        truncated: true,
        repairedNote: 'Shortened to fit 25 minutes',
        exercises,
      };
    }));
    setNotice('Today now fits 25 minutes. The main lift stays at the same weight.');
  };

  const updateSet = (
    sessionId: string,
    exerciseId: string,
    setId: string,
    update: { weight?: number | null; reps?: number | null; done?: boolean },
  ) => {
    let completedExercise = false;
    setSessions((current) => current.map((session) => {
      if (session.id !== sessionId) return session;
      return {
        ...session,
        exercises: session.exercises.map((item) => {
          if (item.id !== exerciseId) return item;
          const sets = item.sets.map((set) => set.id === setId ? { ...set, ...update } : set);
          completedExercise = sets.length > 0 && sets.every((set) => set.done);
          return { ...item, sets };
        }),
      };
    }));

    if (update.done) void Haptics.selectionAsync();
    if (authSession && completedExercise && !sessionId.startsWith('s-')) {
      void updateExerciseCompletion(authSession.access_token, sessionId, exerciseId, true).catch(() => {
        setNotice('Set saved locally. Exercise sync will be retried when the backend supports the full record.');
      });
    }
  };

  const addSet = (sessionId: string, exerciseId: string) => setSessions((current) => current.map((session) => session.id !== sessionId ? session : {
    ...session,
    truncated: true,
    exercises: session.exercises.map((item) => item.id !== exerciseId ? item : {
      ...item,
      sets: [...item.sets, {
        id: `${item.id}-set-${Date.now()}`,
        weight: item.sets.at(-1)?.weight ?? item.lastTime?.weight ?? null,
        reps: item.sets.at(-1)?.reps ?? item.targetReps,
        done: false,
      }],
    }),
  }));

  const removeSet = (sessionId: string, exerciseId: string) => setSessions((current) => current.map((session) => session.id !== sessionId ? session : {
    ...session,
    truncated: true,
    exercises: session.exercises.map((item) => item.id !== exerciseId || item.sets.length <= 1 ? item : { ...item, sets: item.sets.slice(0, -1) }),
  }));

  const skipExercise = (sessionId: string, exerciseId: string) => setSessions((current) => current.map((session) => session.id !== sessionId ? session : {
    ...session,
    truncated: true,
    exercises: session.exercises.map((item) => item.id === exerciseId ? { ...item, skipped: true } : item),
  }));

  const setEffort = (sessionId: string, exerciseId: string, effort: Effort) => setSessions((current) => current.map((session) => session.id !== sessionId ? session : {
    ...session,
    exercises: session.exercises.map((item) => item.id === exerciseId ? { ...item, effort } : item),
  }));

  const finishSession = (sessionId: string, note?: string) => {
    setSessions((current) => current.map((session) => session.id === sessionId ? {
      ...session,
      status: 'done',
      completedAt: Date.now(),
      note: note || session.note,
    } : session));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const signIn = async (email: string, password: string): Promise<AuthActionResult> => {
    try {
      setAccountReady(false);
      const session = await apiSignIn(email, password);
      setAuthSession(session);
      return { ok: true };
    } catch (error) {
      setAccountReady(true);
      return { ok: false, message: errorMessage(error, 'Could not sign in.') };
    }
  };

  const signInWithGoogle = async (): Promise<AuthActionResult> => {
    try {
      setAccountReady(false);
      const session = await apiSignInWithGoogle();
      if (session) setAuthSession(session);
      if (!session && Platform.OS !== 'web') setAccountReady(true);
      return { ok: true };
    } catch (error) {
      setAccountReady(true);
      return { ok: false, message: errorMessage(error, 'Could not sign in with Google.') };
    }
  };

  const signUp = async (email: string, password: string): Promise<AuthActionResult> => {
    try {
      setAccountReady(false);
      const session = await apiSignUp(email, password);
      setAuthSession(session);
      if (!session) setAccountReady(true);
      return { ok: true, message: session ? undefined : 'Check your email to confirm the account, then sign in.' };
    } catch (error) {
      setAccountReady(true);
      return { ok: false, message: errorMessage(error, 'Could not create the account.') };
    }
  };

  const requestPasswordReset = async (email: string): Promise<AuthActionResult> => {
    try {
      await apiRequestPasswordReset(email);
      return { ok: true, message: 'If this email has an account, a reset link will arrive shortly.' };
    } catch (error) {
      return { ok: false, message: errorMessage(error, 'Could not send reset instructions.') };
    }
  };

  const updatePassword = async (password: string): Promise<AuthActionResult> => {
    try {
      await apiUpdatePassword(password);
      await apiSignOut();
      setAuthSession(null);
      setPasswordRecovery(false);
      setProfile(defaultProfile);
      setSessions(initialWeek);
      setProposal(initialProposal);
      setAccountReady(true);
      return { ok: true, message: 'Password updated. Sign in with your new password.' };
    } catch (error) {
      return { ok: false, message: errorMessage(error, 'Could not update your password.') };
    }
  };

  const signOut = async () => {
    await apiSignOut();
    setAuthSession(null);
    setPasswordRecovery(false);
    setProfile(defaultProfile);
    setSessions(initialWeek);
    setProposal(initialProposal);
    setAccountReady(true);
    setNotice(null);
  };

  const updateAssistant = (assistantId: string, update: Partial<ChatMessage>) => {
    setChatMessages((current) => current.map((message) => message.id === assistantId ? { ...message, ...update } : message));
  };

  const streamLiveAnswer = async (assistantId: string, question: string, context?: string) => {
    if (!authSession) return;
    let sources: ChatMessage['sources'] = [];
    const prompt = context ? `[Current app context: ${context}]\n\n${question}` : question;
    await streamChat(
      authSession.access_token,
      prompt,
      (delta) => setChatMessages((current) => current.map((message) => message.id === assistantId ? { ...message, text: message.text + delta } : message)),
      (nextSources) => { sources = nextSources; },
    );
    updateAssistant(assistantId, { pending: false, sources });
  };

  const showPreviewAnswer = async (assistantId: string, question: string, context?: string) => {
    await new Promise((resolve) => setTimeout(resolve, 450));
    const answer = mockChatAnswers[question.toLowerCase()] ?? {
      text: 'I can help with that once it is tied to your live training record. For this preview, I would keep today conservative, preserve the main work, and avoid making up missed training with extra intensity.',
      basis: context ? `Preview guidance using the ${context} screen context.` : 'Preview guidance; no live account is connected.',
    };
    updateAssistant(assistantId, { text: answer.text, basis: answer.basis, pending: false });
  };

  const sendChat = async (rawQuestion: string, context?: string) => {
    const question = rawQuestion.trim();
    if (!question || chatBusy) return;
    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', text: question };
    const assistantId = `assistant-${Date.now()}`;
    setChatMessages((current) => [...current, userMessage, { id: assistantId, role: 'assistant', text: '', pending: true }]);
    setChatBusy(true);

    try {
      if (authSession && liveApiConfigured) await streamLiveAnswer(assistantId, question, context);
      else await showPreviewAnswer(assistantId, question, context);
    } catch (error) {
      updateAssistant(assistantId, { text: errorMessage(error, 'Something went wrong while generating a response.'), pending: false });
    } finally {
      setChatBusy(false);
    }
  };

  const value: AppContextValue = {
    hydrated,
    accountReady,
    passwordRecovery,
    profile,
    sessions,
    proposal,
    block: currentBlock,
    metrics: progressMetrics,
    authSession,
    previewMode: !authSession || !liveApiConfigured,
    colors,
    colorScheme,
    notice,
    chatMessages,
    chatBusy,
    finishOnboarding,
    resetOnboarding,
    setThemeMode,
    updateProfile,
    acceptProposal,
    declineProposal,
    shortenToday,
    updateSet,
    addSet,
    removeSet,
    skipExercise,
    setEffort,
    finishSession,
    signIn,
    signInWithGoogle,
    signUp,
    requestPasswordReset,
    updatePassword,
    signOut,
    refreshLiveData,
    sendChat,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider.');
  return value;
}
