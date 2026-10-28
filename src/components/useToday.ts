import { useEffect, useState } from 'react';
import { localIsoDate } from '../lib/status.ts';

/**
 * The current moment, replaced whenever the local calendar day changes. Background tabs throttle
 * timers, so the date is also rechecked when the tab becomes visible or focused again.
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    const refresh = () =>
      setToday((previous) => {
        const now = new Date();
        return localIsoDate(now) === localIsoDate(previous) ? previous : now;
      });
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = setTimeout(refresh, nextMidnight.getTime() - now.getTime() + 1000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [today]);

  return today;
}
