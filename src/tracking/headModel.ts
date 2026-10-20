/** One face measurement from the camera, in preview-view coordinates. */
export interface FaceSample {
  /** Horizontal centre of the face, 0 (left edge of the preview) .. 1 (right edge). */
  cx: number;
  /** Face width as a fraction of the preview width. */
  width: number;
}

/**
 * How many face-widths of sideways travel count as a full lean (headX = ±1).
 * The engine's slip threshold is 0.55, so a dodge needs roughly half a face width
 * (~7–8 cm at arm's length). Measuring in face widths keeps it distance-independent.
 */
const FULL_LEAN_FACE_WIDTHS = 0.9;
/** Below this lean the head counts as "at centre" and may slowly re-centre. */
const RECENTER_ZONE = 0.25;
/** Fraction of the remaining offset absorbed per sample while re-centring. */
const RECENTER_RATE = 0.02;

/**
 * Turns raw face positions into a lean value for the engine: -1 (left) .. 1 (right).
 * Learns the player's neutral position during calibration, then drifts slowly
 * toward wherever they settle so they don't have to sit perfectly still.
 */
export class HeadModel {
  private center: number | null = null;
  private calSum = 0;
  private calCount = 0;

  get calibrated() {
    return this.center !== null;
  }

  reset() {
    this.center = null;
    this.calSum = 0;
    this.calCount = 0;
  }

  /** Feed one sample while the player is holding still (e.g. during the countdown). */
  calibrate(sample: FaceSample) {
    this.calSum += sample.cx;
    this.calCount++;
    this.center = this.calSum / this.calCount;
  }

  /**
   * Converts a sample to a lean value. `allowRecenter` should only be true
   * between punches, so a held slip is never mistaken for a new neutral.
   */
  lean(sample: FaceSample, allowRecenter: boolean): number {
    if (this.center === null) this.center = sample.cx;
    const span = Math.max(0.05, sample.width) * FULL_LEAN_FACE_WIDTHS;
    const raw = (sample.cx - this.center) / span;
    if (allowRecenter && Math.abs(raw) < RECENTER_ZONE) {
      this.center += (sample.cx - this.center) * RECENTER_RATE;
    }
    return Math.max(-1, Math.min(1, raw));
  }
}
