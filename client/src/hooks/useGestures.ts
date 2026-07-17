import { useEffect, useRef } from "react";

/**
 * Row swipe gestures for mobile: swipe right → advance status ("do kontaktu"),
 * swipe left → archive. Attach returned handlers to a table row.
 */
export function useRowSwipe({
  onSwipeRight,
  onSwipeLeft,
  threshold = 70,
}: {
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  threshold?: number;
}) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const el = useRef<HTMLElement | null>(null);

  function onTouchStart(e: React.TouchEvent<HTMLElement>) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    el.current = e.currentTarget;
  }

  function onTouchMove(e: React.TouchEvent<HTMLElement>) {
    if (startX.current === null || startY.current === null || !el.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    // Only translate when horizontal intent is clear (avoid hijacking scroll)
    if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      el.current.style.transform = `translateX(${Math.max(-100, Math.min(100, dx))}px)`;
      el.current.style.transition = "none";
      el.current.style.background = dx > 0 ? "#fef9c3" : "#fee2e2";
    }
  }

  function onTouchEnd(e: React.TouchEvent<HTMLElement>) {
    if (startX.current === null || startY.current === null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    const dy = e.changedTouches[0].clientY - startY.current;
    const target = el.current;
    if (target) {
      target.style.transition = "transform 0.2s ease, background 0.3s ease";
      target.style.transform = "";
      target.style.background = "";
    }
    if (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.6) {
      if (dx > 0) onSwipeRight();
      else onSwipeLeft();
    }
    startX.current = null;
    startY.current = null;
    el.current = null;
  }

  return { onTouchStart, onTouchMove, onTouchEnd };
}

export interface ShortcutMap {
  [key: string]: () => void;
}

/**
 * Global keyboard shortcuts (desktop). Ignored while typing in inputs,
 * textareas, selects or contenteditable elements, and when dialogs are open.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap, enabled = true) {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Don't trigger while a dialog / sheet is open (radix sets aria-hidden on body content)
      if (document.querySelector('[role="dialog"][data-state="open"]')) {
        if (e.key !== "Escape") return;
      }
      const fn = ref.current[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled]);
}
