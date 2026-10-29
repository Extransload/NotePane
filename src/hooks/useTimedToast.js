import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * One toast that dismisses itself after its timeout, with a timer that can wait. `show(toast,
 * timeout)` replaces the current toast, giving it a new `id` and its `timeout`; a timeout of 0
 * keeps it until `hide()`. `pause()` stops the countdown, as while the pointer or focus is on the
 * toast, and `resume()` continues it with the time that was left. `getRemainingFraction()` reads
 * how much of the timeout is left, from 1 to 0, for the toast's time bar.
 */
export function useTimedToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const countdownRef = useRef({ deadline: 0, isPaused: false, remaining: 0, timeout: 0 });
  const nextIdRef = useRef(1);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback((delay) => {
    const countdown = countdownRef.current;
    countdown.deadline = Date.now() + delay;
    countdown.isPaused = false;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setToast(null);
    }, delay);
  }, []);

  const show = useCallback((nextToast, timeout) => {
    clearTimer();
    const id = nextIdRef.current;
    nextIdRef.current += 1;
    countdownRef.current = { deadline: 0, isPaused: false, remaining: timeout, timeout };
    setToast({ ...nextToast, id, timeout });
    if (timeout > 0) {
      startTimer(timeout);
    }
  }, [clearTimer, startTimer]);

  const hide = useCallback(() => {
    clearTimer();
    countdownRef.current = { deadline: 0, isPaused: false, remaining: 0, timeout: 0 };
    setToast(null);
  }, [clearTimer]);

  const pause = useCallback(() => {
    const countdown = countdownRef.current;
    if (!timerRef.current || countdown.isPaused) {
      return;
    }
    clearTimer();
    countdown.remaining = Math.max(0, countdown.deadline - Date.now());
    countdown.isPaused = true;
  }, [clearTimer]);

  const resume = useCallback(() => {
    const countdown = countdownRef.current;
    if (!countdown.isPaused) {
      return;
    }
    startTimer(countdown.remaining);
  }, [startTimer]);

  const getRemainingFraction = useCallback(() => {
    const { deadline, isPaused, remaining, timeout } = countdownRef.current;
    if (timeout <= 0) {
      return 1;
    }
    const left = isPaused ? remaining : deadline - Date.now();
    return Math.min(1, Math.max(0, left / timeout));
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const timer = useMemo(
    () => ({ getRemainingFraction, pause, resume }),
    [getRemainingFraction, pause, resume],
  );

  return { hide, show, timer, toast };
}
