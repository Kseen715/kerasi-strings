// The "Local only · 0 requests" counter: a real measurement of every
// resource the page loaded, by origin, plus every request the Content
// Security Policy blocked.

import { useEffect, useState } from 'react';

export interface RequestCounts {
  /** Files loaded from this site */
  local: number;
  /** Requests that reached another origin */
  remote: number;
  /** Requests the Content Security Policy stopped */
  blocked: number;
}

const NONE: RequestCounts = { local: 0, remote: 0, blocked: 0 };

export function isRemote(url: string, origin: string): boolean {
  const { protocol, origin: target } = new URL(url, origin);
  return /^(https?|wss?):$/.test(protocol) && target !== origin;
}

export function useRequestCounts(): RequestCounts {
  const [counts, setCounts] = useState(NONE);

  useEffect(() => {
    const { origin } = location;
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const remote = entries.filter((e) => isRemote(e.name, origin)).length;
      setCounts((last) => ({
        ...last,
        local: last.local + entries.length - remote,
        remote: last.remote + remote,
      }));
    });
    observer.observe({ type: 'resource', buffered: true });

    const onBlocked = () => {
      setCounts((last) => ({ ...last, blocked: last.blocked + 1 }));
    };
    document.addEventListener('securitypolicyviolation', onBlocked);
    return () => {
      observer.disconnect();
      document.removeEventListener('securitypolicyviolation', onBlocked);
    };
  }, []);

  return counts;
}
