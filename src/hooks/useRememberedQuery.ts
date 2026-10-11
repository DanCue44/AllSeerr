import { useRouter } from 'next/router';
import { useEffect, useRef } from 'react';

/**
 * Remembers a page's query string (its filters and sort) in local storage,
 * and restores it when the page is opened without one.
 */
const useRememberedQuery = (storageKey: string): void => {
  const router = useRouter();
  const restored = useRef(false);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    if (!restored.current) {
      restored.current = true;

      if (Object.keys(router.query).length === 0) {
        try {
          const saved = window.localStorage.getItem(storageKey);
          const query = saved ? JSON.parse(saved) : null;

          if (query && Object.keys(query).length > 0) {
            router.replace({ pathname: router.pathname, query }, undefined, {
              shallow: true,
            });
            return;
          }
        } catch {
          // Storage can be unavailable or hold bad data; start fresh
        }
      }
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(router.query));
    } catch {
      // Ignore storage errors, the page works without them
    }
  }, [router, router.isReady, router.query, storageKey]);
};

export default useRememberedQuery;
