import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session as AuthSession, type SupabaseClient } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { fetch as expoFetch } from 'expo/fetch';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AppState, Platform } from 'react-native';

import type { ApiWorkout, ChatSource, Exercise, Profile, Session } from '@/domain/types';

const apiBaseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export const liveApiConfigured = Boolean(apiBaseUrl && supabaseUrl && supabaseKey);

// Expo Router renders web routes in Node before hydrating them in the browser.
// AsyncStorage's web adapter requires `window`, so Supabase must not be created
// during that server-rendering pass.
const canInitializeClient = Platform.OS !== 'web' || typeof window !== 'undefined';

export const supabase: SupabaseClient | null = liveApiConfigured && canInitializeClient
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : null;

if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase?.auth.startAutoRefresh();
    else supabase?.auth.stopAutoRefresh();
  });
}

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  void WebBrowser.maybeCompleteAuthSession();
}

type ApiOptions = RequestInit & { accessToken?: string };

function endpoint(path: string) {
  return `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

async function apiFetch(path: string, { accessToken, headers, ...options }: ApiOptions = {}) {
  if (!apiBaseUrl) throw new Error('The production API is not configured.');
  const requestHeaders = new Headers(headers);
  requestHeaders.set('Accept', 'application/json');
  if (accessToken) requestHeaders.set('Authorization', `Bearer ${accessToken}`);
  if (options.body && !requestHeaders.has('Content-Type')) requestHeaders.set('Content-Type', 'application/json');
  return expoFetch(endpoint(path), { ...options, headers: requestHeaders });
}

async function apiJson<T>(path: string, options: ApiOptions, fallback: string): Promise<T> {
  const response = await apiFetch(path, options);
  if (!response.ok) {
    let detail = fallback;
    try {
      const body = (await response.json()) as { detail?: string };
      if (typeof body.detail === 'string') detail = body.detail;
    } catch {
      // Keep the stable user-facing fallback.
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export async function getAuthSession(): Promise<AuthSession | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Supabase is not configured in this build.');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

async function sessionFromOAuthUrl(url: string) {
  if (!supabase) throw new Error('Supabase is not configured in this build.');
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  const accessToken = typeof params.access_token === 'string' ? params.access_token : null;
  const refreshToken = typeof params.refresh_token === 'string' ? params.refresh_token : null;
  if (!accessToken || !refreshToken) throw new Error('Google did not return a valid session.');

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  return data.session;
}

export async function signInWithGoogle() {
  if (!supabase) throw new Error('Supabase is not configured in this build.');
  const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.origin
    : makeRedirectUri({ scheme: 'arcel' });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: Platform.OS !== 'web',
    },
  });
  if (error) throw error;

  // Supabase performs the redirect itself in the browser. The normal session
  // hydration path resumes after the page returns from Google.
  if (Platform.OS === 'web') return null;
  if (!data.url) throw new Error('Google sign-in could not be started.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') throw new Error('Google sign-in was canceled.');
  return sessionFromOAuthUrl(result.url);
}

export async function signUp(email: string, password: string) {
  if (!supabase) throw new Error('Supabase is not configured in this build.');
  const emailRedirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.origin
    : Linking.createURL('/');
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo } });
  if (error) throw error;
  if (data.session) {
    await apiJson('/profile/', { method: 'POST', accessToken: data.session.access_token }, 'Profile creation failed.');
  }
  return data.session;
}

export async function requestPasswordReset(email: string) {
  if (!supabase) throw new Error('Supabase is not configured in this build.');
  const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
    ? `${window.location.origin}/reset-password`
    : Linking.createURL('/reset-password');
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  if (!supabase) throw new Error('Supabase is not configured in this build.');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

type ApiProfile = {
  display_name: string | null;
  primary_goal: string | null;
  experience_level: string | null;
  training_days_per_week: number | null;
  session_duration_minutes: number | null;
  equipment_access: string | null;
  onboarding_completed_at: string | null;
};

const equipmentLabels: Record<string, string> = {
  full_gym: 'Full gym',
  home_gym: 'Home gym',
  minimal_equipment: 'A couple of dumbbells',
  bodyweight_only: 'Nothing but me',
};

const goalLabels: Record<string, string> = {
  balanced_hybrid: 'Strong and fit',
  strength: 'Mostly strength',
  endurance: 'Mostly cardio',
  conditioning: 'Conditioning',
  event_preparation: 'Event preparation',
  general_fitness: 'General fitness',
};

function labelOrFallback(value: string | null, labels: Record<string, string>, fallback: string) {
  if (!value) return fallback;
  return labels[value] ?? fallback;
}

function valueOrFallback<T>(value: T | null, fallback: T) {
  return value ?? fallback;
}

function experienceLevel(value: string | null): Profile['experienceLevel'] {
  if (value === 'new' || value === 'experienced') return value;
  return 'intermediate';
}

export async function loadProfile(accessToken: string, current: Profile): Promise<Profile> {
  const profile = await apiJson<ApiProfile>('/profile/', { accessToken, cache: 'no-store' }, 'Could not load your profile.');
  return {
    ...current,
    displayName: valueOrFallback(profile.display_name, current.displayName),
    goal: labelOrFallback(profile.primary_goal, goalLabels, current.goal),
    experienceLevel: experienceLevel(profile.experience_level),
    daysPerWeek: valueOrFallback(profile.training_days_per_week, current.daysPerWeek),
    sessionMinutes: valueOrFallback(profile.session_duration_minutes, current.sessionMinutes),
    equipment: labelOrFallback(profile.equipment_access, equipmentLabels, current.equipment),
    onboardingComplete: Boolean(profile.onboarding_completed_at),
  };
}

function goalValue(goal: string) {
  const normalized = goal.toLowerCase();
  if (normalized.includes('strength')) return 'strength';
  if (normalized.includes('endurance') || normalized.includes('cardio')) return 'endurance';
  if (normalized.includes('conditioning')) return 'conditioning';
  return 'balanced_hybrid';
}

function equipmentValue(equipment: string) {
  const normalized = equipment.toLowerCase();
  if (normalized === 'full gym') return 'full_gym';
  if (normalized === 'home gym') return 'home_gym';
  if (normalized.includes('dumbbell')) return 'minimal_equipment';
  return 'bodyweight_only';
}

export async function saveProfile(accessToken: string, profile: Profile) {
  return apiJson<ApiProfile>(
    '/profile/',
    {
      method: 'PATCH',
      accessToken,
      body: JSON.stringify({
        display_name: profile.displayName || 'Athlete',
        primary_goal: goalValue(profile.goal),
        experience_level: profile.experienceLevel,
        training_days_per_week: profile.daysPerWeek,
        session_duration_minutes: profile.sessionMinutes,
        equipment_access: equipmentValue(profile.equipment),
      }),
    },
    'Could not save your profile.',
  );
}

export async function completeOnboarding(accessToken: string) {
  return apiJson<ApiProfile>(
    '/profile/onboarding/complete',
    { method: 'POST', accessToken },
    'Could not finish onboarding.',
  );
}

function numberFrom(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function positiveSetCount(value: number | null | undefined) {
  return value && value > 0 ? value : 1;
}

function exerciseKind(metadataKind: unknown, hasDuration: boolean): Exercise['kind'] {
  if (metadataKind === 'time' || hasDuration) return 'time';
  return metadataKind === 'bodyweight' ? 'bodyweight' : 'load';
}

function exerciseRole(value: unknown): Exercise['role'] {
  if (value === 'primary' || value === 'accessory') return value;
  return 'secondary';
}

function durationInSeconds(targetSeconds: unknown, durationMinutes: number | null) {
  const explicitTarget = numberFrom(targetSeconds);
  if (explicitTarget !== null) return explicitTarget;
  return durationMinutes === null ? null : durationMinutes * 60;
}

function previousPerformance(weight: number | null, reps: number | null) {
  if (weight === null && reps === null) return null;
  return { weight, reps };
}

function mapApiExercise(input: ApiWorkout['exercises'][number]): Exercise {
  const metadata = input.metadata ?? {};
  const count = positiveSetCount(input.sets);
  const reps = numberFrom(input.reps);
  const weight = numberFrom(metadata.weight);
  const durationMinutes = numberFrom(input.duration);
  return {
    id: input.id,
    name: input.name,
    kind: exerciseKind(metadata.kind, Boolean(input.duration)),
    role: exerciseRole(metadata.role),
    targetSets: count,
    targetReps: reps,
    targetSeconds: durationInSeconds(metadata.target_seconds, durationMinutes),
    lastTime: previousPerformance(weight, reps),
    restSeconds: valueOrFallback(numberFrom(metadata.rest_seconds), valueOrFallback(numberFrom(input.rest), 75)),
    why: input.notes ?? 'Part of this session because it supports the week’s main goal.',
    sets: Array.from({ length: count }, (_, index) => ({
      id: `${input.id}-set-${index + 1}`,
      weight,
      reps,
      done: Boolean(input.completed_at),
    })),
  };
}

function workoutState(exercises: Exercise[]) {
  let hasStrength = false;
  let hasEndurance = false;
  let allDone = exercises.length > 0;

  for (const exercise of exercises) {
    if (exercise.kind === 'time') hasEndurance = true;
    else hasStrength = true;
    if (allDone && !exercise.sets.every((set) => set.done)) allDone = false;
  }

  return { hasStrength, hasEndurance, allDone };
}

function workoutModality(hasStrength: boolean, hasEndurance: boolean): Session['modality'] {
  if (hasStrength && hasEndurance) return 'mixed';
  return hasEndurance ? 'endurance' : 'strength';
}

function workoutMinutes(notes: string | null, exerciseCount: number) {
  return valueOrFallback(numberFrom(notes?.match(/(\d+)\s*min/i)?.[1]), Math.max(20, exerciseCount * 10));
}

export function mapApiWorkout(input: ApiWorkout): Session {
  const mappedExercises = input.exercises.map(mapApiExercise);
  const state = workoutState(mappedExercises);
  return {
    id: input.id,
    date: input.scheduled_date,
    title: input.title || 'Workout',
    modality: workoutModality(state.hasStrength, state.hasEndurance),
    minutes: workoutMinutes(input.notes, mappedExercises.length),
    status: state.allDone ? 'done' : 'planned',
    exercises: mappedExercises,
    intent: input.goal ?? undefined,
    note: input.notes ?? undefined,
  } as Session;
}

export async function loadWorkouts(accessToken: string, startDate: string, endDate: string) {
  const query = new URLSearchParams({ start_date: startDate, end_date: endDate });
  const workouts = await apiJson<ApiWorkout[]>(`/workouts/?${query}`, { accessToken, cache: 'no-store' }, 'Could not load workouts.');
  return workouts.map(mapApiWorkout);
}

export async function updateExerciseCompletion(
  accessToken: string,
  workoutId: string,
  exerciseId: string,
  completed: boolean,
) {
  return apiJson(
    `/workouts/${workoutId}/exercises/${exerciseId}/completion`,
    { method: 'PATCH', accessToken, body: JSON.stringify({ completed }) },
    'Could not update exercise completion.',
  );
}

export async function generateAndSavePlan(accessToken: string, profile: Profile) {
  const generated = await apiJson<{ plan: unknown }>(
    '/plan/generate',
    {
      method: 'POST',
      accessToken,
      body: JSON.stringify({
        goal: profile.goal,
        additional_context: `${profile.cardio}; preferred days: ${profile.trainingDays.join(', ')}`,
      }),
    },
    'Could not generate your week.',
  );
  await apiJson(
    '/plan/',
    { method: 'POST', accessToken, body: JSON.stringify({ plan: generated.plan }) },
    'Could not save your week.',
  );
}

type StreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'sources'; sources: ChatSource[] }
  | { type: 'done' }
  | { type: 'error'; message?: string };

type StreamCallbacks = {
  onText: (delta: string) => void;
  onSources: (sources: ChatSource[]) => void;
};

function dispatchStreamEvent(line: string, callbacks: StreamCallbacks) {
  const trimmed = line.trim();
  if (!trimmed) return;
  const event = JSON.parse(trimmed) as StreamEvent;
  if (event.type === 'text') callbacks.onText(event.delta);
  if (event.type === 'sources') callbacks.onSources(event.sources);
  if (event.type === 'error') throw new Error(event.message ?? 'Chat failed.');
}

function drainStreamBuffer(buffer: string, callbacks: StreamCallbacks) {
  let lineStart = 0;
  let lineEnd = buffer.indexOf('\n');
  while (lineEnd >= 0) {
    dispatchStreamEvent(buffer.slice(lineStart, lineEnd), callbacks);
    lineStart = lineEnd + 1;
    lineEnd = buffer.indexOf('\n', lineStart);
  }
  return lineStart > 0 ? buffer.slice(lineStart) : buffer;
}

export async function streamChat(
  accessToken: string,
  question: string,
  onText: (delta: string) => void,
  onSources: (sources: ChatSource[]) => void,
) {
  const response = await apiFetch('/chat/', {
    method: 'POST',
    accessToken,
    body: JSON.stringify({ text: question }),
  });
  if (!response.ok) throw new Error('Chat request failed.');
  if (!response.body) throw new Error('Chat stream is unavailable.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const callbacks = { onText, onSources };
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = drainStreamBuffer(buffer, callbacks);
  }
  dispatchStreamEvent(buffer, callbacks);
}
