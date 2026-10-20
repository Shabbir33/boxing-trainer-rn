import { memo, useRef, type RefObject } from 'react';
import { StyleSheet, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useCameraPermission } from 'react-native-vision-camera';
import { Camera, type Face } from 'react-native-vision-camera-face-detector';

import type { FaceSample } from './headModel';

/**
 * Flip if a device reports the preview un-mirrored: leaning to your right
 * must move the face toward the right edge of the preview.
 */
const FLIP_X = false;

function largest(faces: Face[]) {
  let best: Face | null = null;
  for (const f of faces) if (!best || f.bounds.width > best.bounds.width) best = f;
  return best;
}

/**
 * Front-camera preview that reports the player's face position.
 * Memoised with stable props on purpose: the face detector output is rebuilt
 * whenever its host re-renders, which would restart the camera pipeline.
 */
export const HeadTrackerCamera = memo(function HeadTrackerCamera({
  onSample,
  onError,
  style,
}: {
  onSample: RefObject<(sample: FaceSample | null) => void>;
  onError: RefObject<(error: Error) => void>;
  style?: StyleProp<ViewStyle>;
}) {
  const size = useRef({ width: 1 });

  const handleFaces = (faces: Face[]) => {
    const face = largest(faces);
    if (!face) {
      onSample.current?.(null);
      return;
    }
    const w = size.current.width;
    const cx = (face.bounds.x + face.bounds.width / 2) / w;
    onSample.current?.({ cx: FLIP_X ? 1 - cx : cx, width: face.bounds.width / w });
  };

  return (
    <Camera
      style={[StyleSheet.absoluteFill, style]}
      onLayout={(e: LayoutChangeEvent) => {
        size.current.width = Math.max(1, e.nativeEvent.layout.width);
      }}
      device="front"
      isActive
      resizeMode="cover"
      autoMode
      performanceMode="fast"
      minFaceSize={0.15}
      onFacesDetected={handleFaces}
      onError={(e: Error) => onError.current?.(e)}
    />
  );
});

export function useHeadTrackingPermission() {
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  return { hasPermission, canRequestPermission, requestPermission };
}
