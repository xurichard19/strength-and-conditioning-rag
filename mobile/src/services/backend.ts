import type { ChatMode, ChatSource, ChatStage, Profile } from '../domain/types';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type Answers = Record<string, JsonValue>;
export type ApiProfile = { id: string; display_name: string | null; timezone: string };
export type Onboarding = { answers: Answers; completed_at: string | null };
export type Conversation = { id: string; title: string; created_at: string };
export type SavedMessage = { id: string; role: 'user' | 'assistant'; content: string; created_at: string };
export type ApiRequest = (path: string, options?: RequestInit) => Promise<Response>;
export type BillingStatus = {
  enabled: boolean; has_access: boolean; entitlement: 'arcel_pro';
  phase: 'inactive' | 'trial' | 'paid' | 'grace'; product_id: string | null;
  expires_at: string | null; will_renew: boolean | null; verified_at: string | null;
};

export class BackendError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail); this.name = 'BackendError'; this.status = status; this.detail = detail;
  }
}
export type SportsWorkoutInput = {
  id: string; sport: string; scheduled_date: string; start_time: string; planned_duration_minutes: number;
  intensity: 'easy' | 'moderate' | 'hard' | 'variable'; notes: string | null;
};
export type SportsWorkout = Omit<SportsWorkoutInput, 'start_time' | 'planned_duration_minutes' | 'intensity'> & {
  user_id: string; status: 'planned' | 'completed' | 'cancelled';
  start_time: string | null; planned_duration_minutes: number | null; intensity: SportsWorkoutInput['intensity'] | null;
};
export type CalendarWorkout = {
  id: string; scheduled_date: string; name: string; notes: string | null;
  status: 'planned' | 'in_progress' | 'completed' | 'skipped'; superseded_at: string | null;
  exercises: {
    id: string; name: string; notes?: string | null; reps_per_side?: boolean;
    weight_unit?: 'kg' | 'lb' | null; distance_unit?: 'm' | 'km' | 'mi' | null;
    sets?: {
      planned_reps?: number | null; planned_weight?: number | null; planned_distance?: number | null;
      planned_duration_seconds?: number | null; planned_rpe?: number | null;
      planned_rest_seconds?: number | null; planned_notes?: string | null;
    }[];
  }[];
};
export type CalendarResponse = { workouts: CalendarWorkout[]; sports_workouts: SportsWorkout[]; revision: number | null };
export type PlanningJob = {
  id: string; kind: 'adjustment' | 'refresh'; status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  reason: string; effective_from: string | null; effective_through: string | null;
  scheduled_for: string | null; change_id: string | null; created_at: string; completed_at: string | null;
};
export type PlanningChange = {
  id: string; user_id: string; revision: number; kind: PlanningJob['kind']; status: 'applied' | 'undone' | 'discarded';
  reason: string; effective_from: string; effective_through: string;
  horizon_end_before: string | null; horizon_end_after: string; created_at: string;
};
export type PlanningHistory = { changes: PlanningChange[]; revision: number | null };
export type PlanningSchedule = {
  user_id: string; horizon_days: number; refresh_interval_days: number; horizon_end: string | null;
  next_refresh_at: string; revision: number; created_at: string; updated_at: string;
};
export type PlanningChangePreview = {
  change: PlanningChange; before: CalendarWorkout[]; after: CalendarWorkout[]; revision: number | null;
};

/** Use the device's named timezone, never a guessed UTC offset. */
export function deviceTimezone(): string | undefined {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
}

/** Decode API errors without retrying writes whose outcome may be unknown. */
async function checked(response: Response): Promise<Response> {
  if (response.ok) return response;
  const body = await response.json().catch(() => null);
  throw new BackendError(response.status, typeof body?.detail === 'string' ? body.detail : `Request failed (${response.status}).`);
}

/** Keep every survey answer together; identity and local display preferences stay separate. */
export function surveyAnswers(profile: Profile, extra: Answers): Answers {
  return { ...extra, goal: profile.goal, experienceLevel: profile.experienceLevel,
    trainingDays: profile.trainingDays, daysPerWeek: profile.daysPerWeek,
    sessionMinutes: profile.sessionMinutes, equipment: profile.equipment, cardio: profile.cardio };
}

export function profileFromApi(profile: ApiProfile, onboarding: Onboarding | null, defaults: Profile): Profile {
  const answers = onboarding?.answers ?? {};
  const result = { ...defaults, displayName: profile.display_name ?? '',
    onboardingComplete: Boolean(onboarding?.completed_at) };
  for (const key of ['goal', 'equipment', 'cardio'] as const) {
    if (typeof answers[key] === 'string') result[key] = answers[key];
  }
  for (const key of ['daysPerWeek', 'sessionMinutes'] as const) {
    if (typeof answers[key] === 'number' && Number.isFinite(answers[key])) result[key] = answers[key];
  }
  if (['new', 'intermediate', 'experienced'].includes(String(answers.experienceLevel))) {
    result.experienceLevel = answers.experienceLevel as Profile['experienceLevel'];
  }
  if (Array.isArray(answers.trainingDays) && answers.trainingDays.every(day => typeof day === 'string')) {
    result.trainingDays = answers.trainingDays as string[];
  }
  return result;
}

/** HTTP shapes only; auth is supplied by the mobile adapter. */
export function createBackend(request: ApiRequest, onSubscriptionRequired?: () => void) {
  async function check(response: Response): Promise<Response> {
    try { return await checked(response); }
    catch (error) {
      if (error instanceof BackendError && error.status === 403 && error.detail === 'subscription_required') onSubscriptionRequired?.();
      throw error;
    }
  }
  async function json<T>(path: string, options?: RequestInit, retryConflict = false): Promise<T> {
    if (options?.method && options.method !== 'GET') return (await check(await request(path, options))).json();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Bound the whole read, including auth and response decoding, even if a transport ignores abort.
    const deadline = new Promise<T>((_, reject) => {
      timer = setTimeout(() => { reject(new Error('Request timed out. Please try again.')); controller.abort(); }, 15_000);
    });
    try {
      return await Promise.race([deadline, (async () => {
        const config = { ...options, signal: controller.signal };
        let response = await request(path, config);
        if (retryConflict && response.status === 409 && !controller.signal.aborted) response = await request(path, config);
        return (await check(response)).json() as Promise<T>;
      })()]);
    } finally { clearTimeout(timer); }
  }
  return {
    getBillingStatus: () => json<BillingStatus>('/billing/status'),
    syncBilling: () => json<BillingStatus>('/billing/sync', { method: 'POST' }),
    getProfile: () => json<ApiProfile>('/profile'),
    getOnboarding: () => json<Onboarding | null>('/onboarding'),
    saveTimezone: (timezone: string) => json<ApiProfile>('/profile', {
      method: 'PATCH', body: JSON.stringify({ timezone }),
    }),
    saveProfile: (displayName: string, timezone: string) => json<ApiProfile>('/profile', {
      method: 'PATCH', body: JSON.stringify({ display_name: displayName.trim() || null, timezone }),
    }),
    saveAnswers: (answers: Answers) => json<Onboarding>('/onboarding', {
      method: 'PUT', body: JSON.stringify({ answers }),
    }),
    completeOnboarding: () => json<Onboarding>('/onboarding/complete', { method: 'POST' }),
    getPlanningJobs: () => json<PlanningJob[]>('/planning/jobs?limit=20'),
    getPlanningSchedule: () => json<PlanningSchedule | null>('/planning/schedule'),
    getPlanningHistory: (beforeRevision?: number) => {
      const query = new URLSearchParams({ limit: '20' });
      if (beforeRevision !== undefined) query.set('before_revision', String(beforeRevision));
      return json<PlanningHistory>(`/planning/changes?${query}`);
    },
    getPlanningChange: (id: string) => json<PlanningChangePreview>(`/planning/changes/${encodeURIComponent(id)}`),
    /** Inclusive local dates, at most 31 days. Retry one read-only revision conflict. */
    getCalendarRange: (startDate: string, endDate: string) => {
      const query = new URLSearchParams({ start_date: startDate, end_date: endDate });
      return json<CalendarResponse>(`/calendar?${query}`, undefined, true);
    },
    createSportsWorkout: (workout: SportsWorkoutInput) => json<SportsWorkout>('/sports-workouts', {
      method: 'POST', body: JSON.stringify(workout),
    }),
    deleteSportsWorkout: (id: string) => json<SportsWorkout>(`/sports-workouts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    getConversation: (id: string) => json<Conversation>(`/chat/conversations/${encodeURIComponent(id)}`),
    renameConversation: (id: string, title: string) => json<Conversation>(`/chat/conversations/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify({ title: title.trim() }),
    }),
    deleteConversation: async (id: string) => {
      await check(await request(`/chat/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }));
    },
    getConversations: (before?: string) => json<Conversation[]>(`/chat/conversations${before ? `?before=${encodeURIComponent(before)}` : ''}`),
    getMessages: (conversationId: string, before?: SavedMessage) => {
      const query = new URLSearchParams({ limit: '20', conversation_id: conversationId });
      if (before) { query.set('before_created_at', before.created_at); query.set('before_id', before.id); }
      return json<SavedMessage[]>(`/chat/messages?${query}`);
    },
    streamChat: async (text: string, onText: (delta: string) => void,
      onSources: (sources: ChatSource[]) => void, signal: AbortSignal | undefined, conversationId: string,
      onSaved?: (message: SavedMessage) => void, onStatus?: (stage: ChatStage) => void, mode: ChatMode = 'quick') => {
      const response = await check(await request('/chat', {
        method: 'POST', body: JSON.stringify({ text, conversation_id: conversationId, mode }), signal,
        headers: { Accept: 'application/x-ndjson', 'X-Chat-Saved-Events': '1', 'X-Chat-Status-Events': '1' },
      }));
      if (!response.body) throw new Error('Chat stream is unavailable.');
      return readChatStream(response.body, onText, onSources, onSaved, onStatus);
    },
  };
}

/** Check persistence receipts before their server-owned ids enter the message cache. */
function savedRecord(value: Partial<SavedMessage> | null | undefined, role: SavedMessage['role']): SavedMessage {
  if (!value || typeof value.id !== 'string' || !value.id || typeof value.created_at !== 'string'
    || !Number.isFinite(Date.parse(value.created_at)) || value.role !== role || typeof value.content !== 'string') {
    throw new Error('Invalid saved message.');
  }
  return value as SavedMessage;
}

/** Validate completion ids and optional saved rows together before updating the cache. */
function completionEvent(event: { message_id?: unknown; message?: Partial<SavedMessage> }) {
  if (typeof event.message_id !== 'string') throw new Error('Invalid chat stream event.');
  const message = event.message ? savedRecord(event.message, 'assistant') : undefined;
  if (message && message.id !== event.message_id) throw new Error('Invalid saved reply.');
  return { id: event.message_id, message };
}

/** Return only after the server confirms persistence; EOF alone is not success. */
export async function readChatStream(body: ReadableStream<Uint8Array>,
  onText: (delta: string) => void, onSources: (sources: ChatSource[]) => void,
  onSaved: (message: SavedMessage) => void = () => {}, onStatus: (stage: ChatStage) => void = () => {}): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let messageId: string | null = null;
  function dispatch(line: string) {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    switch (event?.type) {
      case 'error': throw new Error(event.message ?? 'Chat failed.');
      case 'text':
        if (typeof event.delta !== 'string') break;
        onText(event.delta); return;
      case 'status':
        if (event.stage !== 'fetching_user_context' && event.stage !== 'researching' && event.stage !== 'thinking') break;
        onStatus(event.stage); return;
      case 'sources':
        if (!Array.isArray(event.sources)) break;
        onSources(event.sources); return;
      case 'saved': onSaved(savedRecord(event.message, 'user')); return;
      case 'done': {
        const reply = completionEvent(event);
        if (reply.message) onSaved(reply.message);
        messageId = reply.id; return;
      }
    }
    throw new Error('Invalid chat stream event.');
  }
  try {
    while (!messageId) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) dispatch(line);
      if (done) { dispatch(buffer); break; }
    }
    if (!messageId) throw new Error('Connection ended before the reply was confirmed saved. Refresh history before sending again.');
    return messageId;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
