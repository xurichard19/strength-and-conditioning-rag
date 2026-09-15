import type { Session as AuthSession } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, useColorScheme } from 'react-native';

import { palettes, type ColorScheme, type Palette, type ThemeMode } from '@/design/tokens';
import { currentBlock, defaultProfile, initialWeek, initialProposal, progressMetrics } from '@/data/mock';
import type { ChatMessage, Effort, Profile, Proposal, ProgressMetric, Session } from '@/domain/types';
import { errorMessage } from '@/lib/errors';
import {
  backendFor, deviceTimezone, getAuthSession, profileFromApi, sessionFromAuthUrl,
  requestPasswordReset as apiRequestPasswordReset, signIn as apiSignIn,
  signInWithGoogle as apiSignInWithGoogle, signOut as apiSignOut, signUp as apiSignUp,
  supabase, updatePassword as apiUpdatePassword, type Answers, type SavedMessage,
} from '@/services/api';

import type { Conversation } from '@/services/backend';

type AuthActionResult = { ok: true; message?: string } | { ok: false; message: string };

type AppContextValue = {
  conversations: Conversation[];
  conversationsLoading: boolean;
  conversationsError: string | null;
  hasOlderConversations: boolean;
  refreshConversations: (older?: boolean) => Promise<void>;
  openConversation: (id?: string) => void;
  hydrated: boolean;
  accountReady: boolean;
  passwordRecovery: boolean;
  accountError: string | null;
  onboardingAnswers: Answers;
  chatError: string | null;
  chatLoading: boolean;
  hasOlderMessages: boolean;
  refreshChat: (older?: boolean) => Promise<void>;
  profile: Profile;
  sessions: Session[];
  proposal: Proposal | null;
  block: typeof currentBlock;
  metrics: ProgressMetric[];
  authSession: AuthSession | null;
  previewMode: boolean;
  colors: Palette;
  colorScheme: ColorScheme;
  notice: string | null;
  chatMessages: ChatMessage[];
  chatBusy: boolean;
  finishOnboarding: (profile: Profile, answers: Answers) => Promise<boolean>;
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


const emptyProfile: Profile = { ...defaultProfile, displayName: '', onboardingComplete: false };
const asMessage = (row: SavedMessage): ChatMessage => ({ id: row.id, role: row.role, text: row.content });

export function AppProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [hydrated, setHydrated] = useState(false);
  const [accountReady, setAccountReady] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [onboardingAnswers, setOnboardingAnswers] = useState<Answers>({});
  // Training previews are memory-only and never sent to the API.
  const [sessions, setSessions] = useState<Session[]>(initialWeek);
  const [proposal, setProposal] = useState<Proposal | null>(initialProposal);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [hasOlderConversations, setHasOlderConversations] = useState(false);
  const conversation = useRef<string | null>(null);
  const chatEpoch = useRef(0);
  const conversationCursor = useRef<string | undefined>(undefined);
  const listRequest = useRef(0);
  const owner = useRef<string | null>(null);
  const epoch = useRef(0);
  const stream = useRef<AbortController | null>(null);
  const historyBusy = useRef(false);
  const oldest = useRef<SavedMessage | undefined>(undefined);
  const accountRequest = useRef(0);
  const colorScheme: ColorScheme = profile.theme === 'system'
    ? systemScheme === 'dark' ? 'dark' : 'light' : profile.theme;
  const colors = palettes[colorScheme];

  // Identity changes clear memory immediately; old async responses may never repopulate it.
  const acceptSession = useCallback((session: AuthSession | null) => {
    const userId = session?.user.id ?? null;
    if (owner.current !== userId) {
      owner.current = userId;
      conversation.current = null;
      chatEpoch.current += 1;
      listRequest.current += 1;
      conversationCursor.current = undefined;
      setConversations([]);
      setConversationsLoading(false);
      setConversationsError(null);
      setHasOlderConversations(false);
      epoch.current += 1;
      accountRequest.current += 1;
      stream.current?.abort();
      stream.current = null;
      historyBusy.current = false;
      oldest.current = undefined;
      setProfile(emptyProfile);
      setOnboardingAnswers({});
      setSessions(initialWeek);
      setProposal(initialProposal);
      setChatMessages([]);
      setChatBusy(false);
      setChatLoading(false);
      setChatError(null);
      setHasOlderMessages(false);
      setAccountError(null);
      setNotice(null);
      setPasswordRecovery(false);
      setAccountReady(!userId);
    }
    setAuthSession(session);
  }, []);

  useEffect(() => {
    let active = true;
    let observedAuth = false;
    const subscription = supabase?.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      observedAuth = true;
      acceptSession(session);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setHydrated(true);
    });
    void getAuthSession().then(session => {
      if (active && !observedAuth) acceptSession(session);
    }).catch(error => { if (active) setNotice(errorMessage(error, 'Could not restore session.')); })
      .finally(() => { if (active) setHydrated(true); });
    const handleLink = async (url: string | null) => {
      if (!url || Platform.OS === 'web' || !/[#?](?:.*&)?access_token=/.test(url)) return;
      try {
        const session = await sessionFromAuthUrl(url);
        if (!active) return;
        acceptSession(session);
        if (/[#&?]type=recovery(?:&|$)/.test(url)) setPasswordRecovery(true);
      } catch (error) { if (active) setNotice(errorMessage(error, 'Invalid sign-in link.')); }
    };
    void Linking.getInitialURL().then(handleLink).catch(() => undefined);
    const links = Linking.addEventListener('url', ({ url }) => { void handleLink(url); });
    return () => { active = false; subscription?.data.subscription.unsubscribe(); links.remove(); stream.current?.abort(); };
  }, [acceptSession]);

  const refreshLiveData = useCallback(async () => {
    const userId = owner.current;
    if (!userId) return;
    const generation = epoch.current;
    const requestId = ++accountRequest.current;
    setAccountError(null);
    try {
      const api = backendFor(userId);
      const [identity, onboarding] = await Promise.all([api.getProfile(), api.getOnboarding()]);
      if (epoch.current !== generation || accountRequest.current !== requestId) return;
      const timezone = deviceTimezone();
      if (timezone && timezone !== identity.timezone) await api.saveTimezone(timezone);
      if (epoch.current !== generation || accountRequest.current !== requestId) return;
      setProfile(current => profileFromApi(identity, onboarding, { ...emptyProfile, theme: current.theme }));
      setOnboardingAnswers(onboarding?.answers ?? {});
      setAccountReady(true);
      setNotice(null);
    } catch (error) {
      if (epoch.current === generation && accountRequest.current === requestId) {
        setAccountError(errorMessage(error, 'Could not load your account.'));
        setNotice(errorMessage(error, 'Could not load your account.'));
      }
    }
  }, []);
  useEffect(() => { if (authSession?.user.id) void refreshLiveData(); }, [authSession?.user.id, refreshLiveData]);

  const refreshChat = useCallback(async (older = false) => {
    const userId = owner.current;
    if (!userId || !conversation.current || stream.current || historyBusy.current) return;
    const generation = epoch.current;
    const selection = chatEpoch.current;
    const selectedId = conversation.current;
    historyBusy.current = true;
    setChatLoading(true);
    setChatError(null);
    try {
      const rows = await backendFor(userId).getMessages(selectedId, older ? oldest.current : undefined);
      if (epoch.current !== generation || chatEpoch.current !== selection) return;
      oldest.current = rows[0] ?? oldest.current;
      setHasOlderMessages(rows.length === 20);
      setChatMessages(current => older
        ? [...rows.map(asMessage).filter(row => !current.some(item => item.id === row.id)), ...current]
        : rows.map(row => ({ ...asMessage(row), sources: current.find(item => item.id === row.id)?.sources })));
    } catch (error) {
      if (epoch.current === generation && chatEpoch.current === selection) setChatError(errorMessage(error, 'Could not load chat history.'));
    } finally {
      if (epoch.current === generation && chatEpoch.current === selection) { historyBusy.current = false; setChatLoading(false); }
    }
  }, []);
  useEffect(() => {
    if (!authSession?.user.id) return;
    void refreshChat();
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') void refreshChat();
    });
    return () => listener.remove();
  }, [authSession?.user.id, refreshChat]);

  // Switching threads invalidates only chat work, never account loading.
  const openConversation = useCallback((id?: string) => {
    chatEpoch.current += 1;
    stream.current?.abort();
    stream.current = null;
    conversation.current = id ?? null;
    historyBusy.current = false;
    oldest.current = undefined;
    setChatMessages([]);
    setChatBusy(false);
    setChatLoading(false);
    setChatError(null);
    setHasOlderMessages(false);
    if (id) void refreshChat();
  }, [refreshChat]);

  const refreshConversations = useCallback(async (older = false) => {
    const userId = owner.current;
    if (!userId) return;
    const generation = epoch.current;
    const request = ++listRequest.current;
    setConversationsLoading(true);
    setConversationsError(null);
    try {
      const rows = await backendFor(userId).getConversations(older ? conversationCursor.current : undefined);
      if (epoch.current !== generation || listRequest.current !== request) return;
      conversationCursor.current = rows.at(-1)?.id;
      setHasOlderConversations(rows.length === 50);
      setConversations(current => older
        ? [...current, ...rows.filter(row => !current.some(item => item.id === row.id))] : rows);
    } catch (error) {
      if (epoch.current === generation && listRequest.current === request) setConversationsError(errorMessage(error, 'Could not load conversations.'));
    } finally {
      if (epoch.current === generation && listRequest.current === request) setConversationsLoading(false);
    }
  }, []);

  const finishOnboarding = async (nextProfile: Profile, answers: Answers): Promise<boolean> => {
    const userId = owner.current;
    if (!userId) { setNotice('Please sign in first.'); return false; }
    const generation = epoch.current;
    try {
      const api = backendFor(userId);
      const identity = await api.getProfile();
      await api.saveProfile(nextProfile.displayName, deviceTimezone() ?? identity.timezone);
      await api.saveAnswers(answers);
      const saved = await api.completeOnboarding();
      if (epoch.current !== generation) return false;
      setProfile({ ...nextProfile, onboardingComplete: Boolean(saved.completed_at) });
      setOnboardingAnswers(saved.answers);
      setNotice(null);
      return true;
    } catch (error) {
      if (epoch.current === generation) setNotice(errorMessage(error, 'Could not save onboarding. Please try again.'));
      return false;
    }
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
    setSessions((current) => current.map((session) => {
      if (session.id !== sessionId) return session;
      return {
        ...session,
        exercises: session.exercises.map((item) => {
          if (item.id !== exerciseId) return item;
          const sets = item.sets.map((set) => set.id === setId ? { ...set, ...update } : set);
          return { ...item, sets };
        }),
      };
    }));

    if (update.done) void Haptics.selectionAsync();
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


  async function authAction(operation: () => Promise<AuthSession | null>, confirmation?: string): Promise<AuthActionResult> {
    try {
      const session = await operation();
      // Browser OAuth completes through the auth subscription after redirect.
      if (session) acceptSession(session);
      return { ok: true, message: session ? undefined : confirmation };
    } catch (error) { return { ok: false, message: errorMessage(error, 'Authentication failed.') }; }
  }
  const signIn = (email: string, password: string) => authAction(() => apiSignIn(email, password));
  const signUp = (email: string, password: string) => authAction(() => apiSignUp(email, password),
    'Check your email to confirm the account, then sign in.');
  const signInWithGoogle = () => authAction(apiSignInWithGoogle);
  const requestPasswordReset = async (email: string): Promise<AuthActionResult> => {
    try { await apiRequestPasswordReset(email); return { ok: true, message: 'If this email has an account, a reset link will arrive shortly.' }; }
    catch (error) { return { ok: false, message: errorMessage(error, 'Could not send reset instructions.') }; }
  };
  const signOut = async () => {
    try { await apiSignOut(); acceptSession(null); setPasswordRecovery(false); }
    catch (error) { setNotice(errorMessage(error, 'Could not sign out. Please retry.')); }
  };
  const updatePassword = async (password: string): Promise<AuthActionResult> => {
    try { await apiUpdatePassword(password); await apiSignOut(); acceptSession(null); setPasswordRecovery(false); return { ok: true }; }
    catch (error) { return { ok: false, message: errorMessage(error, 'Could not update password.') }; }
  };

  const sendChat = async (rawQuestion: string, _context?: string) => {
    const question = rawQuestion.trim();
    const userId = owner.current;
    if (!question || !userId || stream.current || historyBusy.current) return;
    const generation = epoch.current;
    const selection = chatEpoch.current;
    conversation.current ??= randomUUID();
    const selectedId = conversation.current;
    const controller = new AbortController();
    stream.current = controller;
    setChatBusy(true);
    setChatError(null);
    const id = `pending-${Date.now()}`;
    setChatMessages(current => [...current, { id: `${id}-user`, role: 'user', text: question },
      { id, role: 'assistant', text: '', pending: true }]);
    const update = (changes: Partial<ChatMessage>) => {
      if (epoch.current === generation && chatEpoch.current === selection) setChatMessages(current => current.map(row => row.id === id ? { ...row, ...changes } : row));
    };
    try {
      const savedId = await backendFor(userId).streamChat(question, delta => {
        if (epoch.current === generation && chatEpoch.current === selection) setChatMessages(current => current.map(row => row.id === id ? { ...row, text: row.text + delta } : row));
      }, sources => update({ sources }), controller.signal, selectedId);
      update({ id: savedId, pending: false });
    } catch (error) {
      update({ pending: false, basis: 'Reply not confirmed saved.' });
      if (epoch.current === generation && chatEpoch.current === selection) setChatError(errorMessage(error, 'Chat failed. Refresh history before sending again.'));
    } finally {
      if (epoch.current === generation && chatEpoch.current === selection) { stream.current = null; setChatBusy(false); }
    }
  };

  const value: AppContextValue = {
    hydrated, accountReady, accountError, passwordRecovery, profile, onboardingAnswers,
    sessions, proposal, block: currentBlock, metrics: progressMetrics, authSession,
    previewMode: true, colors, colorScheme, notice, chatMessages, chatBusy, chatError,
    chatLoading, hasOlderMessages, refreshChat, finishOnboarding,
    conversations, conversationsLoading, conversationsError, hasOlderConversations, refreshConversations, openConversation,
    setThemeMode, updateProfile, acceptProposal, declineProposal, shortenToday,
    updateSet, addSet, removeSet, skipExercise, setEffort, finishSession,
    signIn, signInWithGoogle, signUp, requestPasswordReset, updatePassword,
    signOut, refreshLiveData, sendChat,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider.');
  return value;
}
