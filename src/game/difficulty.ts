export type DifficultyId = 'easy' | 'normal' | 'hard' | 'pro';

export interface Difficulty {
  id: DifficultyId;
  label: string;
  punches: number;
  /** Random pause before each punch, ms. */
  idleMs: [min: number, max: number];
  /** Telegraph: glove pulls back before it fires. */
  windupMs: number;
  /** Travel time from the wind-up to impact. */
  strikeMs: number;
  /** Chance a punch is preceded by one or more fakes. */
  feintChance: number;
  /** Each punch is this much faster than the last... */
  speedUp: number;
  /** ...but never faster than this fraction of the base timing. */
  minSpeed: number;
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  easy: {
    id: 'easy',
    label: 'Easy',
    punches: 8,
    idleMs: [1100, 1800],
    windupMs: 480,
    strikeMs: 420,
    feintChance: 0.1,
    speedUp: 0.97,
    minSpeed: 0.8,
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    punches: 10,
    idleMs: [800, 1500],
    windupMs: 360,
    strikeMs: 330,
    feintChance: 0.25,
    speedUp: 0.96,
    minSpeed: 0.72,
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    punches: 12,
    idleMs: [550, 1200],
    windupMs: 260,
    strikeMs: 260,
    feintChance: 0.4,
    speedUp: 0.95,
    minSpeed: 0.68,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    punches: 15,
    idleMs: [400, 900],
    windupMs: 190,
    strikeMs: 210,
    feintChance: 0.55,
    speedUp: 0.94,
    minSpeed: 0.65,
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ['easy', 'normal', 'hard', 'pro'];
