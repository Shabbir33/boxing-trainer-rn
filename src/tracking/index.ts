import type { ComponentType, RefObject } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { FaceSample } from './headModel';

export { HeadModel, type FaceSample } from './headModel';

export interface HeadTrackerProps {
  onSample: RefObject<(sample: FaceSample | null) => void>;
  onError: RefObject<(error: Error) => void>;
  style?: StyleProp<ViewStyle>;
}

export interface HeadTrackingPermission {
  hasPermission: boolean;
  canRequestPermission: boolean;
  requestPermission: () => Promise<boolean>;
}

type NativeModule = {
  HeadTrackerCamera: ComponentType<HeadTrackerProps>;
  useHeadTrackingPermission: () => HeadTrackingPermission;
};

// The camera stack is native-only and missing from Expo Go, so load it defensively;
// without it the game falls back to tap controls.
let native: NativeModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- must be a guarded runtime require
  native = require('./HeadTrackerCamera') as NativeModule;
} catch {
  native = null;
}

export const headTrackingAvailable = native !== null;
export const HeadTrackerCamera = native?.HeadTrackerCamera ?? null;

const noPermission: HeadTrackingPermission = {
  hasPermission: false,
  canRequestPermission: false,
  requestPermission: async () => false,
};

/** Availability is fixed at load time, so the hook order never changes between renders. */
export const useHeadTrackingPermission: () => HeadTrackingPermission =
  native?.useHeadTrackingPermission ?? (() => noPermission);
