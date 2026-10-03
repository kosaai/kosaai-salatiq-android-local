/**
 * Event boundary for a future one-shot Sahw audio alert.
 * Keep audio triggering here so frame updates never replay a sound on render.
 */
export interface SahwAudioService {
  playOnce(eventId: string): Promise<void>;
}

export const sahwAudio: SahwAudioService = {
  async playOnce(_eventId) {
    // Audio is intentionally not configured during the Expo Go UI phase.
  },
};
