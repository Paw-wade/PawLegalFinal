'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ElementType } from 'react';
import { cn } from '@/lib/utils';

type OverflowScrollTitleProps = {
  text: string;
  className?: string;
  as?: ElementType;
};

/**
 * Texte tronqué par défaut. Si le contenu dépasse le cadre,
 * un survol (ou focus) lance un défilement unique vers la gauche.
 */
export default function OverflowScrollTitle({
  text,
  className,
  as: Tag = 'h3',
}: OverflowScrollTitleProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [overflowPx, setOverflowPx] = useState(0);
  const [scrolling, setScrolling] = useState(false);

  const measure = useCallback(() => {
    const box = containerRef.current;
    const label = textRef.current;
    if (!box || !label) return;
    setOverflowPx(Math.max(0, label.scrollWidth - box.clientWidth));
  }, []);

  useEffect(() => {
    // Remesurer hors animation (état reset)
    setScrolling(false);
    const id = requestAnimationFrame(() => measure());
    return () => cancelAnimationFrame(id);
  }, [text, measure]);

  useEffect(() => {
    const box = containerRef.current;
    if (!box) return;
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(() => {
      if (!scrolling) measure();
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [measure, scrolling]);

  const canScroll = overflowPx > 1;

  const startScroll = () => {
    if (!canScroll || scrolling) return;
    setScrolling(true);
  };

  const resetScroll = () => {
    setScrolling(false);
    requestAnimationFrame(() => measure());
  };

  return (
    <Tag
      ref={(node: HTMLElement | null) => {
        containerRef.current = node;
      }}
      className={cn('block min-w-0 overflow-hidden', className)}
      title={text}
      onMouseEnter={startScroll}
      onMouseLeave={resetScroll}
      onFocus={startScroll}
      onBlur={resetScroll}
      tabIndex={canScroll ? 0 : undefined}
    >
      <span
        ref={textRef}
        className={cn(
          'inline-block max-w-full whitespace-nowrap align-bottom',
          !scrolling && 'truncate',
          scrolling && canScroll && 'overflow-scroll-title-once'
        )}
        style={
          scrolling && canScroll
            ? ({ ['--overflow-scroll']: `-${overflowPx}px` } as CSSProperties)
            : undefined
        }
      >
        {text}
      </span>
    </Tag>
  );
}
