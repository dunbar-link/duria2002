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
};

type LongPressBind = {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
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
  } = options;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPointRef = useRef<Point | null>(null);
  const latestPointRef = useRef<Point | null>(null);
  const pressedPointerIdRef = useRef<number | null>(null);
  const pressedPointerTypeRef = useRef<string>("mouse");
  const wasLongPressedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetState = useCallback(() => {
    clearTimer();
    startPointRef.current = null;
    latestPointRef.current = null;
    pressedPointerIdRef.current = null;
  }, [clearTimer]);

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

      clearTimer();

      timerRef.current = setTimeout(() => {
        const finalPoint = latestPointRef.current ?? point;
        wasLongPressedRef.current = true;
        onLongPress(finalPoint);
        resetState();
      }, delay);
    },
    [clearTimer, delay, disabled, onLongPress, resetState]
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
    startPointRef.current = null;
    latestPointRef.current = null;
    pressedPointerIdRef.current = null;
  }, [clearTimer]);

  const handlePointerCancel = useCallback(() => {
    cancelLongPress();
  }, [cancelLongPress]);

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