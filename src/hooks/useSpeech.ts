import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { speech } from '../speech/engine';

/** Subscribes a component to the speech engine's speaking state. */
export function useSpeechState(): boolean {
  const [speaking, setSpeaking] = useState(() => speech.speaking);

  useEffect(() => {
    const update = () => setSpeaking(speech.speaking);
    const unsubscribe = speech.subscribe(update);
    update();
    return unsubscribe;
  }, []);

  return speaking;
}

export interface SpeakController {
  speak: (text: string, opts?: Parameters<typeof speech.speak>[1]) => void;
  cancel: () => void;
  toggle: (text: string, opts?: Parameters<typeof speech.speak>[1]) => void;
}

/** Returns a STABLE speak controller bound to the given voice/speed/pitch/volume.
 * Identity never changes, so it is safe in effect deps and cleanup functions. */
export function useSpeech(opts: {
  voiceURI: string;
  speed: number;
  pitch: number;
  volume: number;
}): SpeakController {
  // Latest settings via ref: the callbacks keep one identity for their whole life.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const speak = useCallback(
    (text: string, extra?: Parameters<typeof speech.speak>[1]) => {
      const o = optsRef.current;
      speech.speak(text, {
        voiceURI: o.voiceURI,
        rate: o.speed,
        pitch: o.pitch,
        volume: o.volume,
        ...extra,
      });
    },
    [],
  );

  const cancel = useCallback(() => speech.cancel(), []);

  const toggle = useCallback(
    (text: string, extra?: Parameters<typeof speech.speak>[1]) => {
      if (speech.speaking) speech.cancel();
      else speak(text, extra);
    },
    [speak],
  );

  return useMemo(() => ({ speak, cancel, toggle }), [speak, cancel, toggle]);
}
