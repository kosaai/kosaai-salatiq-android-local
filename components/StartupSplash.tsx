import type { ReactNode } from 'react';

// Android owns the startup sequence; the other platforms render their app normally.
export function StartupSplash({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
