import * as React from 'react';
import { cn } from '../lib/utils';

interface LuminaLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'double';
}

export function LuminaLogo({ className, size = 'md' }: LuminaLogoProps) {
  const sizeClasses = {
    sm: 'w-8 h-8 rounded-lg',
    md: 'w-10 h-10 rounded-xl',
    lg: 'w-16 h-16 rounded-[1.5rem]',
    xl: 'w-24 h-24 rounded-[2.5rem]',
    double: 'w-20 h-20 rounded-[1.8rem]'
  };

  const iconSizes = {
    sm: '20',
    md: '24',
    lg: '38',
    xl: '56',
    double: '48'
  };

  return (
    <div 
      className={cn(
        "flex items-center justify-center bg-gradient-to-br from-[#2554C7] to-[#1E3A8A] shadow-lg relative overflow-hidden",
        sizeClasses[size],
        className
      )}
    >
      {/* Soft Gloss Effect */}
      <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
      
      {/* 4-Pointed Rounded Star Icon */}
      <svg 
        width={iconSizes[size]} 
        height={iconSizes[size]} 
        viewBox="0 0 24 24" 
        fill="currentColor" 
        className="text-white relative z-10"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12 3C12 3 13.5 9 21 12C21 12 13.5 15 12 21C12 21 10.5 15 3 12C3 12 10.5 9 12 3Z" />
      </svg>
    </div>
  );
}
