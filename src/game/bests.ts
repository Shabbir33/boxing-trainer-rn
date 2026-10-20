import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type { DifficultyId } from './difficulty';

/** Best score per difficulty, kept on the device. */
type Bests = Partial<Record<DifficultyId, number>>;

const STORAGE_KEY = 'boxing-trainer.bests';
const FILE_NAME = 'bests.json';

function read(): Bests {
  try {
    if (Platform.OS === 'web') return JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? '{}');
    const file = new File(Paths.document, FILE_NAME);
    return file.exists ? JSON.parse(file.textSync()) : {};
  } catch {
    return {};
  }
}

function write(bests: Bests) {
  const json = JSON.stringify(bests);
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(STORAGE_KEY, json);
      return;
    }
    const file = new File(Paths.document, FILE_NAME);
    if (!file.exists) file.create();
    file.write(json).catch(() => {});
  } catch {
    // Losing a best score isn't worth interrupting the game over.
  }
}

/** Records a finished round's score; reports whether it beat the previous best. */
export function recordScore(difficulty: DifficultyId, score: number) {
  const bests = read();
  const previous = bests[difficulty] ?? 0;
  const isNewBest = score > previous;
  if (isNewBest) write({ ...bests, [difficulty]: score });
  return { best: Math.max(previous, score), isNewBest };
}
