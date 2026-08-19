import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function useFlashToast(durationMs = 1400): {
  message: string | null;
  flash: (text: string) => void;
} {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
      }
    };
  }, []);

  const flash = (text: string): void => {
    setMessage(text);
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
    }
    timer.current = window.setTimeout(() => {
      setMessage(null);
      timer.current = null;
    }, durationMs);
  };

  return { message, flash };
}

export function FlashToast({ message }: { message: string | null }) {
  if (message === null) {
    return null;
  }
  return createPortal(
    <div className="stage-set-toast" aria-live="polite" aria-atomic="true">
      <p>{message}</p>
    </div>,
    document.body,
  );
}
