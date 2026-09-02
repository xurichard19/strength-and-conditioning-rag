import type { ThemeMode } from '@/design/tokens';

export type Modality = 'strength' | 'endurance' | 'mixed' | 'rest';
export type Effort = 'everything' | 'one-more' | 'two-three' | 'lots-left';
export type ExerciseRole = 'primary' | 'secondary' | 'accessory';

export type SetLog = {
  id: string;
  weight: number | null;
  reps: number | null;
  done: boolean;
};

export type Exercise = {
  id: string;
  name: string;
  kind: 'load' | 'bodyweight' | 'time';
  role: ExerciseRole;
  targetSets: number;
  targetReps: number | null;
  targetSeconds: number | null;
  lastTime: { weight: number | null; reps: number | null } | null;
  restSeconds: number;
  why: string;
  form?: string;
  sets: SetLog[];
  effort?: Effort;
  loggedSeconds?: number;
  skipped?: boolean;
};

export type RepairReceipt = {
  summary: string;
  kept: { name: string; why: string }[];
  cut: { name: string; why: string }[];
};

export type Session = {
  id: string;
  date: string;
  title: string;
  modality: Modality;
  minutes: number;
  exercises: Exercise[];
  status: 'planned' | 'done' | 'moved' | 'skipped';
  intent?: string;
  protects?: 'intensity' | 'frequency' | 'duration';
  repairedNote?: string;
  receipt?: RepairReceipt;
  completedAt?: number;
  note?: string;
  truncated?: boolean;
};

export type Proposal = {
  id: string;
  context: string;
  suggestion: string;
  rows: { accent: 'strength' | 'endurance' | 'intervals' | 'shield'; label: string; delta: string }[];
  protectedNote: string;
};

export type Profile = {
  displayName: string;
  goal: string;
  experienceLevel: 'new' | 'intermediate' | 'experienced';
  trainingDays: string[];
  daysPerWeek: number;
  sessionMinutes: number;
  equipment: string;
  cardio: string;
  theme: ThemeMode;
  onboardingComplete: boolean;
};

export type Block = {
  name: string;
  week: number;
  of: number;
  builds: string;
  holds: string;
  next: string;
};

export type ProgressMetric = {
  id: string;
  label: string;
  unit: string;
  lane: 'strength' | 'endurance';
  series: number[];
};

export type ChatSource = {
  title?: string;
  doi?: string;
  url?: string;
  source_type?: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  basis?: string;
  sources?: ChatSource[];
  pending?: boolean;
};

export type ApiWorkoutExercise = {
  id: string;
  workout_id: string;
  order_index: number;
  name: string;
  sets: number | null;
  reps: string | null;
  duration: string | null;
  rest: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  completed_at: string | null;
};

export type ApiWorkout = {
  id: string;
  scheduled_date: string;
  title: string | null;
  goal: string | null;
  notes: string | null;
  exercises: ApiWorkoutExercise[];
};
