'use client';

import type { ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={250} skipDelayDuration={300}>
        {children}
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </MotionConfig>
  );
}
