import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session as AuthSession, type SupabaseClient } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import { fetch as expoFetch } from 'expo/fetch';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AppState, Platform } from 'react-native';

import { createBackend, deviceTimezone } from './backend';
export type { Answers, SavedMessage } from './backend';
export { deviceTimezone, profileFromApi, surveyAnswers } from './backend';

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

export async function sessionFromAuthUrl(url: string) {
  if (!supabase) throw new Error('Supabase is not configured in this build.');
  const parsed = new URL(url);
  const params = Object.fromEntries(new URLSearchParams(parsed.hash.slice(1) || parsed.search.slice(1)));
  if (params.error_description || params.error) throw new Error(params.error_description || params.error);

  const accessToken = typeof params.access_token === 'string' ? params.access_token : null;
  const refreshToken = typeof params.refresh_token === 'string' ? params.refresh_token : null;
  if (!accessToken || !refreshToken) throw new Error('The sign-in link did not contain a valid session.');

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
  return sessionFromAuthUrl(result.url);
}

export async function signUp(email: string, password: string) {
  if (!supabase) throw new Error('Supabase is not configured in this build.');
  const emailRedirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.origin
    : Linking.createURL('/');
  const { data, error } = await supabase.auth.signUp({ email, password,
    options: { emailRedirectTo, data: { timezone: deviceTimezone() } } });
  if (error) throw error;
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


/** Refresh tokens before requests and refuse writes if the active account changed. */
export function backendFor(userId: string) {
  return createBackend(async (path, options = {}) => {
    if (!apiBaseUrl) throw new Error('The API is not configured.');
    const session = await getAuthSession();
    if (!session || session.user.id !== userId) throw new Error('Please sign in again.');
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${session.access_token}`);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (options.body) headers.set('Content-Type', 'application/json');
    return expoFetch(`${apiBaseUrl}${path}`, { ...options, headers });
  });
}
