'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'link' | 'danger' | 'success' | 'dark';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center rounded-full text-sm font-semibold disabled:opacity-50 disabled:pointer-events-none',
          {
            'bg-orange-500 text-white hover:bg-orange-600': variant === 'default',
            'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300': variant === 'outline',
            'text-gray-700 hover:bg-gray-100': variant === 'ghost',
            'text-orange-500 underline-offset-4 hover:underline': variant === 'link',
            'bg-red-500 text-white hover:bg-red-600': variant === 'danger',
            'bg-green-600 text-white hover:bg-green-700': variant === 'success',
            'bg-gray-900 text-white hover:bg-gray-700': variant === 'dark',
            'h-10 py-2 px-5': size === 'default',
            'h-8 px-3 text-xs': size === 'sm',
            'h-11 px-7 text-base': size === 'lg',
            'h-10 w-10 p-0': size === 'icon',
          },
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button };
