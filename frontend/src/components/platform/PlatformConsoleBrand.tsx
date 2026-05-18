import { clsx } from 'clsx';

type Variant = 'signin' | 'header';

type Props = {
  className?: string;
  variant?: Variant;
};

/** Wordmark typographique — Console Ada Papers (sans image PNG). */
export function PlatformConsoleBrand({ className, variant = 'signin' }: Props) {
  const compact = variant === 'header';

  return (
    <p
      className={clsx(
        'font-bold tracking-tight leading-tight',
        compact ? 'text-base sm:text-lg' : 'text-2xl sm:text-[1.75rem]',
        className
      )}
      aria-label="Console Ada Papers"
    >
      <span className="text-white">Console </span>
      <span className="text-orange-400">Ada Papers</span>
    </p>
  );
}
