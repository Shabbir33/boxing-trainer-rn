import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

const SOURCES = {
  punch: require('../../assets/sfx/punch.wav'),
  whoosh: require('../../assets/sfx/whoosh.wav'),
  bell: require('../../assets/sfx/bell.wav'),
  chime: require('../../assets/sfx/chime.wav'),
  ko: require('../../assets/sfx/ko.wav'),
};

export type Sfx = keyof typeof SOURCES;

let players: Record<Sfx, AudioPlayer> | null = null;

/** Creates one player per sound up front so playback has no load delay. */
export function initFeedback() {
  if (players) return;
  setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  players = Object.fromEntries(
    Object.entries(SOURCES).map(([name, src]) => [name, createAudioPlayer(src)]),
  ) as Record<Sfx, AudioPlayer>;
}

export function playSfx(name: Sfx) {
  const player = players?.[name];
  if (!player) return;
  player.seekTo(0).catch(() => {});
  player.play();
}

export function buzz(kind: 'hit' | 'dodge' | 'ko' | 'tick') {
  const run = () => {
    switch (kind) {
      case 'hit':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      case 'dodge':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      case 'ko':
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      case 'tick':
        return Haptics.selectionAsync();
    }
  };
  // Haptics are unavailable on web and some Android devices; never let that break play.
  run().catch(() => {});
}
