import { useCallback, useState } from 'react';
import * as Haptics from 'expo-haptics';

import { currentBlock, initialWeek, initialProposal, progressMetrics } from '@/data/mock';
import type { Effort, Proposal, Session } from '@/domain/types';

export function usePreviewTraining() {
  const [sessions, setSessions] = useState<Session[]>(initialWeek);
  const [proposal, setProposal] = useState<Proposal | null>(initialProposal);
  const reset = useCallback(() => {
    setSessions(initialWeek);
    setProposal(initialProposal);
  }, []);

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

  return {
    sessions, proposal, block: currentBlock, metrics: progressMetrics, previewMode: true,
    acceptProposal, declineProposal, updateSet, addSet, removeSet, skipExercise, setEffort, finishSession,
    reset,
  };
}
