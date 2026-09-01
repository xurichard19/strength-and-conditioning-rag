import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session as AuthSession } from '@supabase/supabase-js';

import { defaultProfile, initialProposal, initialWeek } from '@/data/mock';
import type { Profile, Proposal, Session } from '@/domain/types';

const STORAGE_KEY = 'arcel.mobile.mvp.v1';

export type Snapshot = {
  profile: Profile;
  sessions: Session[];
  proposal: Proposal | null;
};

function keyFor(session: AuthSession | null) {
  return session ? `${STORAGE_KEY}.${session.user.id}` : STORAGE_KEY;
}

function storedProfile(parsed?: Partial<Snapshot>) {
  return parsed?.profile ? { ...defaultProfile, ...parsed.profile } : defaultProfile;
}

function storedSessions(parsed?: Partial<Snapshot>) {
  return parsed?.sessions?.length ? parsed.sessions : initialWeek;
}

function storedProposal(parsed?: Partial<Snapshot>) {
  return parsed && 'proposal' in parsed ? parsed.proposal ?? null : initialProposal;
}

function normalizeSnapshot(parsed?: Partial<Snapshot>): Snapshot {
  return {
    profile: storedProfile(parsed),
    sessions: storedSessions(parsed),
    proposal: storedProposal(parsed),
  };
}

export async function loadSnapshot(session: AuthSession | null) {
  const stored = await AsyncStorage.getItem(keyFor(session));
  return normalizeSnapshot(stored ? JSON.parse(stored) as Partial<Snapshot> : undefined);
}

export function saveSnapshot(session: AuthSession | null, snapshot: Snapshot) {
  return AsyncStorage.setItem(keyFor(session), JSON.stringify(snapshot));
}
