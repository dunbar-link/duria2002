"use client";

import { useCallback, useEffect, useRef } from "react";

type Point = {
  x: number;
  y: number;
};

type UseLongPressOptions = {
  onLongPress: (point: Point) => void;
  delay?: number;
  moveTolerance?: number;
  disabled?: boolean;
  capturePointer?: boolean;
};

type LongPressBind = {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
  onContextMenu: (event: React.MouseEvent<HTMLElement>) => void;
};

export function useLongPress(options: UseLongPressOptions): {
  bind: LongPressBind;
  cancelLongPress: () => void;
  wasLongPressedRef: React.MutableRefObject<boolean>;
} {
  const {
    onLongPress,
    delay = 420,
    moveTolerance = 8,
    disabled = false,
    capturePointer = false,
  } = options;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPointRef = useRef<Point | null>(null);
  const latestPointRef = useRef<Point | null>(null);
  const pressedPointerIdRef = useRef<number | null>(null);
  const pressedPointerTypeRef = useRef<string>("mouse");
  const capturedTargetRef = useRef<Element | null>(null);
  const wasLongPressedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseCapturedPointer = useCallback(() => {
    const target = capturedTargetRef.current;
    const pointerId = pressedPointerIdRef.current;

    if (target && pointerId !== null) {
      try {
        if (
          typeof (target as Element & { hasPointerCapture?: (id: number) => boolean }).hasPointerCapture === "function" &&
          (target as Element & { hasPointerCapture: (id: number) => boolean }).hasPointerCapture(pointerId)
        ) {
          (target as Element & { releasePointerCapture: (id: number) => void }).releasePointerCapture(pointerId);
        }
      } catch {
        // Pointer may already be released or invalid; ignore.
      }
    }

    capturedTargetRef.current = null;
  }, []);

  const resetState = useCallback(() => {
    clearTimer();
    releaseCapturedPointer();
    startPointRef.current = null;
    latestPointRef.current = null;
    pressedPointerIdRef.current = null;
  }, [clearTimer, releaseCapturedPointer]);

  const cancelLongPress = useCallback(() => {
    resetState();
  }, [resetState]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (disabled) {
        return;
      }

      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      wasLongPressedRef.current = false;
      pressedPointerIdRef.current = event.pointerId;
      pressedPointerTypeRef.current = event.pointerType || "mouse";

      const point = {
        x: event.clientX,
        y: event.clientY,
      };

      startPointRef.current = point;
      latestPointRef.current = point;

      if (capturePointer) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
          capturedTargetRef.current = event.currentTarget;
        } catch {
          capturedTargetRef.current = null;
        }
      } else {
        capturedTargetRef.current = null;
      }

      clearTimer();

      timerRef.current = setTimeout(() => {
        const finalPoint = latestPointRef.current ?? point;
        wasLongPressedRef.current = true;
        onLongPress(finalPoint);
        resetState();
      }, delay);
    },
    [capturePointer, clearTimer, delay, disabled, onLongPress, resetState]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (disabled) {
        return;
      }

      if (pressedPointerIdRef.current !== event.pointerId) {
        return;
      }

      const nextPoint = {
        x: event.clientX,
        y: event.clientY,
      };

      latestPointRef.current = nextPoint;

      const startPoint = startPointRef.current;
      if (!startPoint) {
        return;
      }

      const dx = nextPoint.x - startPoint.x;
      const dy = nextPoint.y - startPoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const effectiveTolerance =
        pressedPointerTypeRef.current === "touch"
          ? Math.max(moveTolerance, 16)
          : moveTolerance;

      if (distance > effectiveTolerance) {
        cancelLongPress();
      }
    },
    [cancelLongPress, disabled, moveTolerance]
  );

  const handlePointerUp = useCallback(() => {
    clearTimer();
    releaseCapturedPointer();
    startPointRef.current = null;
    latestPointRef.current = null;
    pressedPointerIdRef.current = null;
  }, [clearTimer, releaseCapturedPointer]);

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (disabled) {
        return;
      }

      if (
        pressedPointerIdRef.current !== null &&
        pressedPointerIdRef.current !== event.pointerId
      ) {
        return;
      }

      const isTouchPress = pressedPointerTypeRef.current === "touch";
      const longPressFired = wasLongPressedRef.current;

      if (capturePointer && isTouchPress && !longPressFired) {
        // Defensive: scroll-capture induced cancel from a parent overflow container.
        // Pointer capture should already prevent this, but some browsers still emit
        // pointercancel briefly. Keep the timer alive; pointerup or the timer fire
        // will resolve.
        return;
      }

      cancelLongPress();
    },
    [cancelLongPress, capturePointer, disabled]
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (disabled) {
        return;
      }

      event.preventDefault();
    },
    [disabled]
  );

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return {
    bind: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onContextMenu: handleContextMenu,
    },
    cancelLongPress,
    wasLongPressedRef,
  };
}