import type { ChatSource, Profile } from '../domain/types';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type Answers = Record<string, JsonValue>;
export type ApiProfile = { id: string; display_name: string | null; timezone: string };
export type Onboarding = { answers: Answers; completed_at: string | null };
export type Conversation = { id: string; title: string; created_at: string };
export type SavedMessage = { id: string; role: 'user' | 'assistant'; content: string; created_at: string };
export type ApiRequest = (path: string, options?: RequestInit) => Promise<Response>;

/** Use the device's named timezone, never a guessed UTC offset. */
export function deviceTimezone(): string | undefined {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
}

/** Decode API errors without retrying writes whose outcome may be unknown. */
async function checked(response: Response): Promise<Response> {
  if (response.ok) return response;
  const body = await response.json().catch(() => null);
  throw new Error(typeof body?.detail === 'string' ? body.detail : `Request failed (${response.status}).`);
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

/** HTTP shapes only. Auth is supplied by the mobile adapter; this module never calls planning. */
export function createBackend(request: ApiRequest) {
  async function json<T>(path: string, options?: RequestInit): Promise<T> {
    return (await checked(await request(path, options))).json();
  }
  return {
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
    getConversation: (id: string) => json<Conversation>(`/chat/conversations/${encodeURIComponent(id)}`),
    renameConversation: (id: string, title: string) => json<Conversation>(`/chat/conversations/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify({ title: title.trim() }),
    }),
    deleteConversation: async (id: string) => {
      await checked(await request(`/chat/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }));
    },
    getConversations: (before?: string) => json<Conversation[]>(`/chat/conversations${before ? `?before=${encodeURIComponent(before)}` : ''}`),
    getMessages: (conversationId: string, before?: SavedMessage) => {
      const query = new URLSearchParams({ limit: '20', conversation_id: conversationId });
      if (before) { query.set('before_created_at', before.created_at); query.set('before_id', before.id); }
      return json<SavedMessage[]>(`/chat/messages?${query}`);
    },
    streamChat: async (text: string, onText: (delta: string) => void,
      onSources: (sources: ChatSource[]) => void, signal: AbortSignal | undefined, conversationId: string,
      onSaved?: (message: SavedMessage) => void) => {
      const response = await checked(await request('/chat', {
        method: 'POST', body: JSON.stringify({ text, conversation_id: conversationId }), signal,
        headers: { Accept: 'application/x-ndjson', 'X-Chat-Saved-Events': '1' },
      }));
      if (!response.body) throw new Error('Chat stream is unavailable.');
      return readChatStream(response.body, onText, onSources, onSaved);
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

/** Return only after the server confirms persistence; EOF alone is not success. */
export async function readChatStream(body: ReadableStream<Uint8Array>,
  onText: (delta: string) => void, onSources: (sources: ChatSource[]) => void,
  onSaved?: (message: SavedMessage) => void): Promise<string> {
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
      case 'sources':
        if (!Array.isArray(event.sources)) break;
        onSources(event.sources); return;
      case 'saved': {
        const row = savedRecord(event.message, 'user');
        onSaved?.(row); return;
      }
      case 'done':
        if (typeof event.message_id !== 'string') break;
        if (event.message) {
          const row = savedRecord(event.message, 'assistant');
          if (row.id !== event.message_id) throw new Error('Invalid saved reply.');
          onSaved?.(row);
        }
        messageId = event.message_id; return;
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
