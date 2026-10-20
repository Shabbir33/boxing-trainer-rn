import type { Difficulty } from './difficulty';

/** -1 = punch lands on the left half of the screen, 1 = right half. */
export type Side = -1 | 1;

/**
 * `contact` only happens with camera input: the glove has landed but the verdict
 * waits briefly for camera frames that were captured before impact to arrive.
 */
export type Phase = 'countdown' | 'idle' | 'windup' | 'strike' | 'contact' | 'recover' | 'over';

export interface Feint {
  side: Side;
  /** Offset from the start of the idle phase. */
  atMs: number;
}

export interface PunchPlan {
  side: Side;
  idleMs: number;
  windupMs: number;
  strikeMs: number;
  feints: Feint[];
}

export interface RoundStats {
  thrown: number;
  dodged: number;
  hits: number;
  closeCalls: number;
  bestCombo: number;
  score: number;
  avgReactionMs: number | null;
}

export type GameEvent =
  | { type: 'countdown'; value: number } // 3, 2, 1, then 0 = "FIGHT!"
  /** The next punch is known; lets the UI prepare its effects before impact. */
  | { type: 'ready'; side: Side; ko: boolean }
  | { type: 'feint'; side: Side }
  | { type: 'windup'; side: Side }
  | {
      type: 'dodge';
      side: Side;
      close: boolean;
      combo: number;
      points: number;
      reactionMs: number | null;
    }
  | { type: 'hit'; side: Side; wrongWay: boolean; livesLeft: number }
  | { type: 'over'; ko: boolean; stats: RoundStats };

export const LIVES = 3;
export const FEINT_MS = 260;

const COUNTDOWN_STEP_MS = 700;
const FIGHT_MS = 600;
export const RECOVER_MS = 650;
const KO_RECOVER_MS = 1400;
/** How long a tap holds the head off-centre before it drifts back. */
const TAP_HOLD_MS = 520;
/** Keep leaning briefly after impact so the glove visibly sails past. */
const IMPACT_HOLD_MS = 180;
/** Head must be at least this far toward the safe side at impact. */
export const SAFE_THRESHOLD = 0.55;
/** A dodge input this close to impact counts as a close call. */
const CLOSE_CALL_MS = 160;
/** Head easing time constant; keeps tap dodges snappy but not instant. */
const HEAD_TAU_MS = 45;
/**
 * Camera samples reach JS roughly this long after the frame was captured
 * (sensor + ML Kit + bridge). The verdict waits this long for a late slip to show up.
 */
export const HEAD_LATENCY_MS = 170;
/** A safe camera sample this soon before impact still counts (rides out detector jitter). */
const HEAD_FLICKER_MS = 90;
const MAX_SAME_SIDE = 3;

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function planRound(d: Difficulty): PunchPlan[] {
  const plans: PunchPlan[] = [];
  let run = 0;
  let last: Side | null = null;
  for (let i = 0; i < d.punches; i++) {
    let side: Side = Math.random() < 0.5 ? -1 : 1;
    if (side === last && run >= MAX_SAME_SIDE) side = (-side) as Side;
    run = side === last ? run + 1 : 1;
    last = side;

    const speed = Math.max(d.minSpeed, Math.pow(d.speedUp, i));
    // The first punch gets a longer lead-in so the player can settle.
    const idleMs = rand(d.idleMs[0], d.idleMs[1]) * speed + (i === 0 ? 500 : 0);

    const feints: Feint[] = [];
    const roll = Math.random();
    const feintCount = roll < d.feintChance / 2 ? 2 : roll < d.feintChance ? 1 : 0;
    const feintRoom = idleMs - FEINT_MS - 220;
    for (let f = 0; f < feintCount && feintRoom > 150; f++) {
      feints.push({ side: Math.random() < 0.5 ? -1 : 1, atMs: rand(120, feintRoom) });
    }
    feints.sort((a, b) => a.atMs - b.atMs);

    plans.push({
      side,
      idleMs,
      windupMs: d.windupMs * speed,
      strikeMs: d.strikeMs * speed,
      feints,
    });
  }
  return plans;
}

/**
 * Frame-driven state machine for one round. Rendering reads its public fields;
 * input arrives through `dodge` (tap) or `setHeadTarget` (camera tracking).
 */
export class GameEngine {
  readonly plans: PunchPlan[];
  phase: Phase = 'countdown';
  phaseStart: number;
  index = 0;
  lives = LIVES;
  combo = 0;
  score = 0;
  /** Smoothed head offset, -1 (left) .. 1 (right). Drives the camera. */
  headX = 0;
  /** Whether the last punch landed; read by the glove recoil animation. */
  lastResult: 'hit' | 'dodge' | null = null;
  activeFeint: { side: Side; start: number } | null = null;

  private headTarget = 0;
  private tapHoldUntil = -Infinity;
  private input: 'tap' | 'head' = 'tap';
  /** Last time a camera sample was on the safe side of the incoming punch. */
  private safeSampleAt = -Infinity;
  /** When the last punch's verdict came in (drives the hit camera kick). */
  resolvedAt = -Infinity;
  /**
   * The last punch was judged after a `contact` wait. Its glove kept travelling
   * through the wait, so its recovery continues from impact instead of restarting.
   */
  viaContact = false;
  private lastInput: { at: number; dir: Side } | null = null;
  private countdownValue = 4; // so the first tick announces "3"
  private feintCursor = 0;
  private lastTick: number | null = null;
  private stats = { dodged: 0, hits: 0, closeCalls: 0, bestCombo: 0 };
  private reactions: number[] = [];

  constructor(difficulty: Difficulty, now: number) {
    this.plans = planRound(difficulty);
    this.phaseStart = now;
  }

  get current(): PunchPlan | undefined {
    return this.plans[this.index];
  }

  get total() {
    return this.plans.length;
  }

  phaseDuration(): number {
    const p = this.current;
    switch (this.phase) {
      case 'idle':
        return p?.idleMs ?? 0;
      case 'windup':
        return p?.windupMs ?? 0;
      case 'strike':
        return p?.strikeMs ?? 0;
      case 'recover':
        return this.lives === 0 ? KO_RECOVER_MS : RECOVER_MS;
      default:
        return 0;
    }
  }

  phaseProgress(now: number): number {
    const d = this.phaseDuration();
    return d > 0 ? Math.min(1, (now - this.phaseStart) / d) : 0;
  }

  /** Tap input: lean the head toward `dir` for a moment. */
  dodge(dir: Side, now: number) {
    if (this.phase === 'over' || this.phase === 'countdown') return;
    this.input = 'tap';
    this.headTarget = dir;
    this.tapHoldUntil = now + TAP_HOLD_MS;
    // Once a punch is coming, a slip holds through its impact; idle guesses still expire.
    const plan = this.current;
    if (plan && (this.phase === 'windup' || this.phase === 'strike')) {
      const impactAt =
        this.phaseStart + (this.phase === 'windup' ? plan.windupMs : 0) + plan.strikeMs;
      this.tapHoldUntil = Math.max(this.tapHoldUntil, impactAt + IMPACT_HOLD_MS);
    }
    this.lastInput = { at: now, dir };
  }

  /** Continuous input (face tracking): the latest measured lean, -1..1. */
  setHeadTarget(x: number, now: number) {
    const clamped = Math.max(-1, Math.min(1, x));
    const dir: Side = clamped < 0 ? -1 : 1;
    if (Math.abs(clamped) >= SAFE_THRESHOLD && Math.abs(this.headTarget) < SAFE_THRESHOLD) {
      this.lastInput = { at: now, dir };
    }
    this.input = 'head';
    this.headTarget = clamped;
    this.tapHoldUntil = Infinity;
    const plan = this.current;
    const incoming =
      this.phase === 'windup' || this.phase === 'strike' || this.phase === 'contact';
    if (plan && incoming && clamped * plan.side <= -SAFE_THRESHOLD) this.safeSampleAt = now;
  }

  /**
   * Judged on the measured lean, not the eased camera position: the easing is only
   * for looks, and it would lag a slip that the player can already see on the meter.
   */
  private isSafe(side: Side, impactAt: number) {
    if (this.headTarget * side <= -SAFE_THRESHOLD) return true;
    return this.input === 'head' && this.safeSampleAt >= impactAt - HEAD_FLICKER_MS;
  }

  tick(now: number): GameEvent[] {
    const events: GameEvent[] = [];
    const dt = this.lastTick === null ? 16 : Math.min(100, now - this.lastTick);
    this.lastTick = now;

    if (now > this.tapHoldUntil) this.headTarget = 0;
    this.headX += (this.headTarget - this.headX) * (1 - Math.exp(-dt / HEAD_TAU_MS));

    // Phases can be very short at high difficulty, so advance through as many as are due.
    for (let guard = 0; guard < 6; guard++) {
      if (!this.step(now, events)) break;
    }
    return events;
  }

  /** Advances at most one phase. Returns true if the phase changed. */
  private step(now: number, events: GameEvent[]): boolean {
    const elapsed = now - this.phaseStart;
    const plan = this.current;

    switch (this.phase) {
      case 'countdown': {
        const value = 3 - Math.floor(elapsed / COUNTDOWN_STEP_MS);
        if (value < this.countdownValue && value >= 0) {
          this.countdownValue = value;
          events.push({ type: 'countdown', value });
        }
        if (elapsed >= COUNTDOWN_STEP_MS * 3 + FIGHT_MS) {
          this.enter('idle', this.phaseStart + COUNTDOWN_STEP_MS * 3 + FIGHT_MS);
          this.announceNext(events);
          return true;
        }
        return false;
      }
      case 'idle': {
        if (!plan) return false;
        const feint = plan.feints[this.feintCursor];
        if (feint && elapsed >= feint.atMs) {
          this.activeFeint = { side: feint.side, start: this.phaseStart + feint.atMs };
          this.feintCursor++;
          events.push({ type: 'feint', side: feint.side });
        }
        if (this.activeFeint && now - this.activeFeint.start > FEINT_MS) this.activeFeint = null;
        if (elapsed >= plan.idleMs) {
          this.activeFeint = null;
          this.safeSampleAt = -Infinity;
          this.enter('windup', this.phaseStart + plan.idleMs);
          events.push({ type: 'windup', side: plan.side });
          return true;
        }
        return false;
      }
      case 'windup': {
        if (!plan || elapsed < plan.windupMs) return false;
        this.enter('strike', this.phaseStart + plan.windupMs);
        return true;
      }
      case 'strike': {
        if (!plan || elapsed < plan.strikeMs) return false;
        const impactAt = this.phaseStart + plan.strikeMs;
        if (this.input === 'head' && !this.isSafe(plan.side, impactAt)) {
          // Frames showing a last-moment slip are still in flight; wait for them.
          this.enter('contact', impactAt);
          return true;
        }
        this.viaContact = false;
        events.push(this.resolve(plan, impactAt, true, now));
        this.enter('recover', impactAt);
        return true;
      }
      case 'contact': {
        if (!plan) return false;
        const impactAt = this.phaseStart;
        const safe = this.isSafe(plan.side, impactAt);
        if (!safe && elapsed < HEAD_LATENCY_MS) return false;
        this.viaContact = true;
        events.push(this.resolve(plan, impactAt, safe, Math.min(now, impactAt + HEAD_LATENCY_MS)));
        // The glove never stopped, so the recovery is timed from impact.
        this.enter('recover', impactAt);
        return true;
      }
      case 'recover': {
        if (elapsed < this.phaseDuration()) return false;
        const end = this.phaseStart + this.phaseDuration();
        if (this.lives === 0 || this.index >= this.plans.length - 1) {
          this.index = Math.min(this.index + 1, this.plans.length);
          this.enter('over', end);
          events.push({ type: 'over', ko: this.lives === 0, stats: this.getStats() });
          return true;
        }
        this.index++;
        this.feintCursor = 0;
        this.lastResult = null;
        this.enter('idle', end);
        this.announceNext(events);
        return true;
      }
      default:
        return false;
    }
  }

  private resolve(plan: PunchPlan, impactAt: number, safe: boolean, now: number): GameEvent {
    this.resolvedAt = now;
    const windupStart = impactAt - plan.strikeMs - plan.windupMs;
    const lean = this.headTarget * plan.side; // negative = away from the punch
    if (safe) {
      const input = this.lastInput;
      const close = input !== null && impactAt - input.at <= CLOSE_CALL_MS;
      const reactionMs =
        input && input.dir !== plan.side && input.at >= windupStart ? input.at - windupStart : null;
      if (reactionMs !== null) this.reactions.push(reactionMs);

      this.combo++;
      const multiplier = Math.min(3, 1 + 0.25 * (this.combo - 1));
      const points = Math.round((100 + (close ? 50 : 0)) * multiplier);
      this.score += points;
      this.stats.dodged++;
      if (close) this.stats.closeCalls++;
      this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo);
      this.lastResult = 'dodge';
      return { type: 'dodge', side: plan.side, close, combo: this.combo, points, reactionMs };
    }

    this.combo = 0;
    this.lives = Math.max(0, this.lives - 1);
    this.stats.hits++;
    this.lastResult = 'hit';
    return {
      type: 'hit',
      side: plan.side,
      wrongWay: lean >= SAFE_THRESHOLD,
      livesLeft: this.lives,
    };
  }

  private announceNext(events: GameEvent[]) {
    const plan = this.current;
    if (plan) events.push({ type: 'ready', side: plan.side, ko: this.lives === 1 });
  }

  private enter(phase: Phase, at: number) {
    this.phase = phase;
    this.phaseStart = at;
  }

  getStats(): RoundStats {
    const r = this.reactions;
    return {
      thrown: this.stats.dodged + this.stats.hits,
      dodged: this.stats.dodged,
      hits: this.stats.hits,
      closeCalls: this.stats.closeCalls,
      bestCombo: this.stats.bestCombo,
      score: this.score,
      avgReactionMs: r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length) : null,
    };
  }
}
