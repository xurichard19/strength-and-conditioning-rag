import type { Block, Exercise, Profile, ProgressMetric, Proposal, Session } from '@/domain/types';

const iso = (offsetDays: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

const makeSets = (exerciseId: string, count: number, weight: number | null, reps: number | null) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${exerciseId}-set-${index + 1}`,
    weight,
    reps,
    done: false,
  }));

const exercise = (
  id: string,
  name: string,
  kind: Exercise['kind'],
  role: Exercise['role'],
  sets: number,
  reps: number | null,
  seconds: number | null,
  last: Exercise['lastTime'],
  restSeconds: number,
  why: string,
  form?: string,
): Exercise => ({
  id,
  name,
  kind,
  role,
  targetSets: sets,
  targetReps: reps,
  targetSeconds: seconds,
  lastTime: last,
  restSeconds,
  why,
  form,
  sets: makeSets(id, sets, last?.weight ?? null, last?.reps ?? reps),
});

export const currentBlock: Block = {
  name: 'Strength',
  week: 3,
  of: 8,
  builds: 'lifting builds',
  holds: 'cardio holds steady',
  next: 'Speed',
};

export const todaySession: Session = {
  id: 's-today',
  date: iso(0),
  title: 'Full body + easy run',
  modality: 'mixed',
  minutes: 40,
  status: 'planned',
  intent: 'One hard lift, a balanced push and pull, and an easy aerobic base — both threads in one visit.',
  protects: 'intensity',
  exercises: [
    exercise(
      'e1',
      'Goblet squat',
      'load',
      'primary',
      3,
      8,
      null,
      { weight: 20, reps: 8 },
      90,
      'Your main leg movement. Everything else today is lighter, so this is the one worth pushing.',
      'Hold one dumbbell against your chest. Sit between your feet, keep your heels flat, then stand tall.',
    ),
    exercise(
      'e2',
      'Dumbbell bench press',
      'load',
      'secondary',
      3,
      8,
      null,
      { weight: 22.5, reps: 8 },
      90,
      'Upper-body push, paired with rows so your shoulders stay balanced.',
      'Press the dumbbells from chest height, then lower slowly until you feel a comfortable stretch.',
    ),
    exercise(
      'e3',
      'One-arm row',
      'load',
      'secondary',
      3,
      10,
      null,
      { weight: 24, reps: 10 },
      75,
      'Upper-body pull. It balances the bench press.',
      'Keep your back flat and pull the dumbbell toward your hip, not your shoulder.',
    ),
    exercise(
      'e4',
      'Easy run',
      'time',
      'secondary',
      1,
      null,
      900,
      null,
      0,
      'Easy pace — you should be able to hold a conversation. It builds the base that makes everything else easier.',
      'If you cannot speak a full sentence, slow down. Slowing down is the point, not a compromise.',
    ),
  ],
};

export const initialWeek: Session[] = [
  {
    id: 's-missed',
    date: iso(-2),
    title: 'Missed — work trip',
    modality: 'rest',
    minutes: 0,
    status: 'skipped',
    exercises: [],
  },
  { id: 's-rest-1', date: iso(-1), title: 'Rest', modality: 'rest', minutes: 0, status: 'planned', exercises: [] },
  todaySession,
  { id: 's-rest-2', date: iso(1), title: 'Rest', modality: 'rest', minutes: 0, status: 'planned', exercises: [] },
  {
    id: 's-intervals',
    date: iso(2),
    title: 'Intervals',
    modality: 'endurance',
    minutes: 30,
    status: 'planned',
    intent: "The week's one hard cardio session — most of your fitness gain for the fewest minutes.",
    protects: 'intensity',
    exercises: [
      exercise('e5', 'Intervals', 'time', 'primary', 6, null, 60, null, 90, 'Six hard minutes broken into one-minute pieces.'),
    ],
  },
  { id: 's-rest-3', date: iso(3), title: 'Rest', modality: 'rest', minutes: 0, status: 'planned', exercises: [] },
  {
    id: 's-lower',
    date: iso(4),
    title: 'Lower body',
    modality: 'strength',
    minutes: 45,
    status: 'planned',
    intent: 'Your heaviest lifting of the week.',
    protects: 'intensity',
    exercises: [
      exercise('e6', 'Back squat', 'load', 'primary', 4, 6, null, { weight: 60, reps: 6 }, 120, 'Your heaviest lift of the week.'),
      exercise('e7', 'Romanian deadlift', 'load', 'secondary', 3, 8, null, { weight: 50, reps: 8 }, 90, 'Backs of the legs — the half squats miss.'),
      exercise('e8', 'Split squat', 'load', 'accessory', 3, 10, null, { weight: 16, reps: 10 }, 75, 'One leg at a time, so the stronger side stops covering.'),
    ],
  },
];

export const initialProposal: Proposal = {
  id: 'ease-week',
  context: 'Last week got away from you — one session missed.',
  suggestion: "I’d ease this week off a touch so it’s easy to get going again. Nothing to catch up on either way.",
  rows: [
    { accent: 'strength', label: 'Lifts', delta: '3 → 2 sets' },
    { accent: 'intervals', label: 'Intervals', delta: '6 → 4 rounds' },
  ],
  protectedNote: 'Weights stay the same',
};

export const defaultProfile: Profile = {
  displayName: '',
  goal: 'Strong and fit',
  experienceLevel: 'intermediate',
  trainingDays: ['Mon', 'Tue', 'Thu', 'Sat'],
  daysPerWeek: 4,
  sessionMinutes: 45,
  equipment: 'Full gym',
  cardio: 'Running',
  theme: 'system',
  onboardingComplete: false,
};

export const consistency = [
  { week: 'Jun 2', strength: 2, cardio: 1 },
  { week: 'Jun 9', strength: 0, cardio: 0 },
  { week: 'Jun 16', strength: 1, cardio: 1 },
  { week: 'Jun 23', strength: 2, cardio: 1 },
  { week: 'Jun 30', strength: 3, cardio: 2 },
  { week: 'Jul 7', strength: 1, cardio: 2 },
  { week: 'Jul 14', strength: 2, cardio: 1 },
  { week: 'Jul 21', strength: 1, cardio: 0 },
  { week: 'Jul 28', strength: 2, cardio: 1 },
  { week: 'Aug 4', strength: 2, cardio: 2 },
  { week: 'Aug 11', strength: 0, cardio: 0 },
  { week: 'Now', strength: 2, cardio: 2 },
];

export const progressMetrics: ProgressMetric[] = [
  { id: 'squat', label: 'Squat', unit: 'kg', lane: 'strength', series: [47.5, 50, 50, 52.5, 55, 55, 57.5, 60] },
  { id: 'run', label: 'Longest run', unit: 'min', lane: 'endurance', series: [18, 22, 24, 28, 30, 35, 38, 42] },
];

export const milestones = [
  { text: 'First time squatting 60 kg', when: '12 Aug' },
  { text: 'Longest run yet — 42 minutes', when: '3 Aug' },
  { text: 'First session back after a week off', when: '21 Jul' },
];

export const rememberedNotes = [
  { text: "Travel weeks are a write-off — don’t try to make them up, just restart lighter.", when: 'captured in June' },
  { text: 'Left knee complains if split squats go above 20 kg.', when: 'captured in May' },
];

export const quickQuestions = [
  'How should I place intervals around heavy lower-body lifting?',
  'What is a sensible weekly strength volume for endurance athletes?',
  'How can I improve recovery between concurrent training sessions?',
];

export const mockChatAnswers: Record<string, { text: string; basis: string }> = {
  'why is today lighter?': {
    text: '**Today is lighter because last week was disrupted.**\n\n- The weights stay the same\n- A little volume comes out\n- Missed work does not become training debt\n\nThe goal is to make restarting straightforward.',
    basis: 'Your current week, the missed work-trip session, and the proposed ease-week change.',
  },
  'what do i cut if i’m short?': {
    text: 'Keep the goblet squat at its planned weight, do two sets of bench and rows, then shorten the easy run. Nothing gets faster or heavier to make up the time.',
    basis: 'Today’s exercise roles and the 25-minute triage order.',
  },
  'does the cardio cost me strength?': {
    text: 'Not automatically. The easy run is deliberately conversational and your harder intervals are spaced away from lower-body lifting. That keeps the two demands from competing more than they need to.',
    basis: 'This week’s spacing and the intensity assigned to each session.',
  },
};
