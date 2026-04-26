'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>{children}</button>;
}

interface ImpersonationBannerProps {
  userName: string;
  userEmail: string;
  onStopImpersonating: () => void;
}

export function ImpersonationBanner({ userName, userEmail, onStopImpersonating }: ImpersonationBannerProps) {
  return (
    <div className="mb-6 bg-gradient-to-r from-yellow-50 to-orange-50 border-l-4 border-yellow-500 rounded-lg p-4 shadow-md animate-pulse">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-xl">👤</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-yellow-900 text-sm md:text-base">
              Mode impersonation actif
            </p>
            <p className="text-xs md:text-sm text-yellow-700 truncate">
              Vous êtes sur le <strong>dashboard de l&apos;utilisateur</strong> <strong>{userName}</strong> ({userEmail})
            </p>
          </div>
        </div>
        <Button 
          onClick={onStopImpersonating}
          variant="outline"
          className="border-yellow-500 text-yellow-700 hover:bg-yellow-100 whitespace-nowrap flex-shrink-0"
        >
          Quitter l&apos;impersonation
        </Button>
      </div>
    </div>
  );
}


