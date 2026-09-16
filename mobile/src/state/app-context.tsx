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

import { createChatCache } from './chat-cache';
import { createCalendarCache, type CalendarCache } from './calendar-cache';
import type { Conversation } from '@/services/backend';

type ChatRun = { controller: AbortController; rows: ChatMessage[]; title: string; error: string | null; confirmed: boolean };

type AuthActionResult = { ok: true; message?: string } | { ok: false; message: string };

type AppContextValue = {
  conversations: Conversation[];
  conversationsLoading: boolean;
  conversationsError: string | null;
  hasOlderConversations: boolean;
  refreshConversations: (older?: boolean) => Promise<void>;
  openConversation: (id?: string, title?: string) => void;
  chatTitle: string;
  activeConversationId: string | null;
  renameConversation: (title: string) => Promise<void>;
  deleteConversation: () => Promise<void>;
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
  refreshPreview: () => Promise<void>;
  calendarCache: CalendarCache;
  invalidateCalendar: (userId: string, start?: string, end?: string) => void;
  sendChat: (question: string, context?: string) => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);


const emptyProfile: Profile = { ...defaultProfile, displayName: '', onboardingComplete: false };
const asMessage = (row: SavedMessage): ChatMessage => ({ id: row.id, role: row.role, text: row.content });

/** Overlay the active turn on saved history, replacing matching ids without reordering. */
function displayedMessages(window: { rows: SavedMessage[] } | undefined, run: ChatRun | undefined) {
  return [...new Map([...(window?.rows.map(asMessage) ?? []), ...(run?.rows ?? [])].map(row => [row.id, row])).values()];
}

function firstMessageTitle(question: string) {
  const characters = Array.from(question.replace(/\s+/g, ' '));
  return characters.length > 120 ? characters.slice(0, 119).join('') + '…' : characters.join('');
}

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
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState('Ask Arcel');
  const chatEpoch = useRef(0);
  const listRequest = useRef(0);
  const owner = useRef<string | null>(null);
  const epoch = useRef(0);
  const [cache] = useState(() => createChatCache());
  const [calendarCache] = useState(() => createCalendarCache());
  const runs = useRef(new Map<string, ChatRun>());
  const historyBusy = useRef(false);
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
      setActiveConversationId(null);
      setChatTitle('Ask Arcel');
      chatEpoch.current += 1;
      listRequest.current += 1;
      cache.clear();
      calendarCache.clear();
      setConversations([]);
      setConversationsLoading(false);
      setConversationsError(null);
      setHasOlderConversations(false);
      epoch.current += 1;
      accountRequest.current += 1;
      runs.current.forEach(run => run.controller.abort());
      runs.current.clear();
      historyBusy.current = false;
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
  }, [cache, calendarCache]);

  useEffect(() => {
    const activeRuns = runs.current;
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
    return () => { active = false; subscription?.data.subscription.unsubscribe(); links.remove(); activeRuns.forEach(run => run.controller.abort()); activeRuns.clear(); cache.clear(); calendarCache.clear(); };
  }, [acceptSession, cache, calendarCache]);

  // Delayed writes from a previous account must not invalidate the current account's cache.
  const invalidateCalendar = useCallback((userId: string, start?: string, end?: string) => {
    if (owner.current === userId) calendarCache.invalidate(start, end);
  }, [calendarCache]);

  // Replace account data after a fresh read; leave chat caches and local previews intact.
  const refreshLiveData = useCallback(async () => {
    const userId = owner.current;
    if (!userId) return;
    const generation = epoch.current;
    const requestId = ++accountRequest.current;
    const current = () => epoch.current === generation && accountRequest.current === requestId;
    setAccountError(null);
    try {
      const api = backendFor(userId);
      const [identity, onboarding] = await Promise.all([api.getProfile(), api.getOnboarding()]);
      if (!current()) return;
      const timezone = deviceTimezone();
      if (timezone && timezone !== identity.timezone) await api.saveTimezone(timezone);
      if (!current()) return;
      setProfile(current => profileFromApi(identity, onboarding, { ...emptyProfile, theme: current.theme }));
      setOnboardingAnswers(onboarding?.answers ?? {});
      setAccountReady(true);
      setNotice(null);
    } catch (error) {
      if (current()) {
        const message = errorMessage(error, 'Could not load your account.');
        setAccountError(message);
        setNotice(message);
      }
    }
  }, []);
  useEffect(() => { if (authSession?.user.id) void refreshLiveData(); }, [authSession?.user.id, refreshLiveData]);

  const refreshPreview = async () => {
    setNotice('This page uses preview training data; there is nothing to sync yet.');
  };

  // Rendering selection and running requests are independent.
  const publishChat = useCallback(() => {
    const id = conversation.current;
    const run = id ? runs.current.get(id) : undefined;
    const metadata = id ? cache.peekConversation(id) : undefined;
    const window = id ? cache.peekMessages(id) : undefined;
    const rows = displayedMessages(window, run);
    setChatMessages(current => {
      const sources = new Map(current.map(row => [row.id, row.sources]));
      return rows.map(row => ({ ...row, sources: row.sources ?? sources.get(row.id) }));
    });
    setChatTitle(previous => metadata?.title ?? run?.title ?? (id ? previous : 'Ask Arcel'));
    setActiveConversationId(previous => metadata || run?.confirmed ? id : run || !id ? null : previous);
    setHasOlderMessages(window?.more ?? false);
    setChatBusy(Boolean(run));
    setChatError(run?.error ?? null);
  }, [cache]);

  const publishList = useCallback(() => {
    const snapshot = cache.peekList();
    setConversations(snapshot?.rows ?? []);
    setHasOlderConversations(snapshot?.more ?? false);
    const metadata = conversation.current ? cache.peekConversation(conversation.current) : undefined;
    if (metadata) { setChatTitle(metadata.title); setActiveConversationId(metadata.id); }
  }, [cache]);

  const refreshChat = useCallback(async (older = false) => {
    const userId = owner.current;
    const id = conversation.current;
    if (!userId || !id || runs.current.has(id) || historyBusy.current) return;
    const generation = epoch.current;
    const selection = chatEpoch.current;
    const current = () => epoch.current === generation && chatEpoch.current === selection;
    historyBusy.current = true;
    setChatLoading(!cache.peekMessages(id));
    setChatError(null);
    try {
      const api = backendFor(userId);
      const [window] = await Promise.all([
        cache.loadMessages(api, id, older),
        cache.loadConversation(api, id).catch(() => undefined),
      ]);
      if (!current()) return;
      publishChat();
      // Oversized pages may be displayed without retaining them in the cache.
      if (window && !cache.peekMessages(id)) {
        setChatMessages(window.rows.map(asMessage)); setHasOlderMessages(window.more);
      }
    } catch (error) {
      if (current()) setChatError(errorMessage(error, 'Could not load chat history.'));
    } finally {
      if (current()) { historyBusy.current = false; setChatLoading(false); }
    }
  }, [cache, publishChat]);
  useEffect(() => {
    if (!authSession?.user.id) return;
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') void refreshChat();
    });
    return () => listener.remove();
  }, [authSession?.user.id, refreshChat]);

  const openConversation = useCallback((id?: string, title?: string) => {
    chatEpoch.current += 1;
    conversation.current = id ?? null;
    historyBusy.current = false;
    setChatLoading(false);
    publishChat();
    if (id && !cache.peekConversation(id) && !runs.current.has(id)) {
      setChatTitle(title ?? 'Ask Arcel');
      setActiveConversationId(id);
    }
    if (id) void refreshChat();
  }, [cache, publishChat, refreshChat]);

  const renameConversation = async (title: string) => {
    const userId = owner.current;
    const id = conversation.current;
    if (!userId || !id || runs.current.has(id)) throw new Error('Wait for the reply to finish.');
    const generation = epoch.current;
    const saved = await backendFor(userId).renameConversation(id, title);
    if (epoch.current !== generation) return;
    cache.putConversation(saved);
    listRequest.current += 1;
    setConversationsLoading(false);
    publishList();
  };

  const deleteConversation = async () => {
    const userId = owner.current;
    const id = conversation.current;
    if (!userId || !id || runs.current.has(id)) throw new Error('Wait for the reply to finish.');
    const generation = epoch.current;
    await backendFor(userId).deleteConversation(id);
    if (epoch.current !== generation) return;
    cache.removeConversation(id);
    listRequest.current += 1;
    setConversationsLoading(false);
    publishList();
    if (conversation.current === id) openConversation();
  };

  const refreshConversations = useCallback(async (older = false) => {
    const userId = owner.current;
    if (!userId) return;
    const generation = epoch.current;
    const request = ++listRequest.current;
    const current = () => epoch.current === generation && listRequest.current === request;
    publishList();
    setConversationsLoading(true);
    setConversationsError(null);
    try {
      await cache.loadList(backendFor(userId), older);
      if (!current()) return;
      publishList();
    } catch (error) {
      if (current()) setConversationsError(errorMessage(error, 'Could not load conversations.'));
    } finally {
      if (current()) setConversationsLoading(false);
    }
  }, [cache, publishList]);

  const finishOnboarding = async (nextProfile: Profile, answers: Answers): Promise<boolean> => {
    const userId = owner.current;
    if (!userId) { setNotice('Please sign in first.'); return false; }
    const generation = epoch.current;
    accountRequest.current += 1; // Earlier account reads must not overwrite this save.
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

  /** Reconcile a finished stream without replaying its write or touching another account/selection. */
  const reconcileChat = async (id: string, run: ChatRun, client: ReturnType<typeof backendFor>,
    current: () => boolean, savedReply: boolean) => {
    if (!current()) return;
    const metadata = await cache.loadConversation(client, id).catch(() => undefined);
    if (!current()) return;
    if (metadata) { cache.putConversation(metadata); run.confirmed = true; publishList(); }
    // Older servers and ambiguous failures need one read; confirmed saved rows need none.
    if (!cache.peekMessages(id)?.rows.some(row => row.id === run.rows[1].id) || !savedReply) {
      const window = await cache.loadMessages(client, id, false, true).catch(() => undefined);
      if (!current()) return;
      // A confirmed reply in history makes that page authoritative; don't show its
      // human turn twice just because an older server didn't send the human's id.
      const reply = run.rows[1];
      if (savedReply && window?.rows.some(row => row.id === reply.id)) run.rows = [reply];
    }
    if (!current()) return;
    if (conversation.current === id) { publishChat(); setChatBusy(false); }
    runs.current.delete(id);
  };

  const sendChat = async (rawQuestion: string, _context?: string) => {
    const question = rawQuestion.trim();
    const userId = owner.current;
    if (!question || !userId || historyBusy.current || (conversation.current && runs.current.has(conversation.current))) return;
    // Bound concurrent work independently from how many chats the user opens.
    if (runs.current.size >= 3) { setChatError('Wait for one of your other replies to finish.'); return; }
    const generation = epoch.current;
    const isNew = !conversation.current;
    conversation.current ??= randomUUID();
    const id = conversation.current;
    const client = backendFor(userId);
    const title = isNew ? firstMessageTitle(question) : chatTitle;
    const pendingId = randomUUID();
    const run: ChatRun = { controller: new AbortController(), title, error: null, confirmed: false,
      rows: [{ id: pendingId + '-user', role: 'user', text: question },
        { id: pendingId, role: 'assistant', text: '', pending: true }] };
    runs.current.set(id, run);
    cache.beginTurn(id, isNew);
    const current = () => epoch.current === generation && runs.current.get(id) === run;
    const publish = () => { if (current() && conversation.current === id) publishChat(); };
    const savedMessage = (row: SavedMessage) => {
      if (!current()) return;
      run.confirmed = true;
      const index = row.role === 'user' ? 0 : 1;
      run.rows[index] = { ...run.rows[index], ...asMessage(row), pending: false };
      cache.putMessages(id, [row]);
      publish();
    };
    publish();
    let savedReply = false;
    try {
      const savedId = await client.streamChat(question, delta => {
        if (!current()) return;
        run.rows[1] = { ...run.rows[1], text: run.rows[1].text + delta, progress: undefined };
        publish();
      }, sources => {
        if (!current()) return;
        run.rows[1] = { ...run.rows[1], sources };
        publish();
      }, run.controller.signal, id, savedMessage, stage => {
        if (!current() || run.rows[1].text) return;
        run.rows[1] = { ...run.rows[1], progress: stage };
        publish();
      });
      if (!current()) return;
      savedReply = true;
      run.confirmed = true;
      run.rows[1] = { ...run.rows[1], id: savedId, pending: false };
    } catch (error) {
      if (!current()) return;
      run.error = errorMessage(error, 'Chat failed. Reopen the conversation to load saved messages.');
      cache.invalidateMessages(id);
      run.rows[1] = { ...run.rows[1], pending: false, basis: 'Reply not confirmed saved.' };
    } finally {
      run.rows[1] = { ...run.rows[1], progress: undefined };
      publish();
      await reconcileChat(id, run, client, current, savedReply);
    }
  };

  const value: AppContextValue = {
    hydrated, accountReady, accountError, passwordRecovery, profile, onboardingAnswers,
    sessions, proposal, block: currentBlock, metrics: progressMetrics, authSession,
    previewMode: true, colors, colorScheme, notice, chatMessages, chatBusy, chatError,
    chatLoading, hasOlderMessages, refreshChat, finishOnboarding,
    conversations, conversationsLoading, conversationsError, hasOlderConversations, refreshConversations, openConversation,
    chatTitle, activeConversationId, renameConversation, deleteConversation,
    setThemeMode, updateProfile, acceptProposal, declineProposal, shortenToday,
    updateSet, addSet, removeSet, skipExercise, setEffort, finishSession,
    signIn, signInWithGoogle, signUp, requestPasswordReset, updatePassword,
    signOut, refreshLiveData, refreshPreview, calendarCache, invalidateCalendar, sendChat,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider.');
  return value;
}
