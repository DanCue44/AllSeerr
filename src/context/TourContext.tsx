import { useUser } from '@app/hooks/useUser';
import axios from 'axios';
import { useRouter } from 'next/router';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

/**
 * Raise this when the tour changes enough that everyone should see it again.
 * Users store the version they have seen, so a raise offers it once more.
 */
export const TOUR_VERSION = 1;

// Gives the page a moment to draw its navigation before the tour measures it
const AUTO_START_DELAY_MS = 1200;

interface TourContextProps {
  /** False outside the Ambient interface, where there is no tour */
  available: boolean;
  isOpen: boolean;
  startTour: () => void;
  closeTour: () => void;
}

export const TourContext = createContext<TourContextProps>({
  available: false,
  isOpen: false,
  startTour: () => undefined,
  closeTour: () => undefined,
});

export const useTour = (): TourContextProps => useContext(TourContext);

interface TourProviderProps {
  children?: React.ReactNode;
}

/**
 * Holds whether the guided tour is open. Opens it once, on its own, for
 * every user who has not seen this version of it yet; the seen version is
 * stored with the user so it follows them to every device.
 */
export const TourProvider = ({ children }: TourProviderProps) => {
  const router = useRouter();
  const { user, revalidate } = useUser();
  const [isOpen, setOpen] = useState(false);
  // Set once the tour has opened by itself, so it does so once per visit
  const autoStarted = useRef(false);

  const seenVersion = user?.settings?.tourVersion ?? 0;
  const onAuthPage = /^\/(login|setup|resetpassword)/.test(router.pathname);

  const markSeen = useCallback(async () => {
    if (!user) {
      return;
    }

    try {
      await axios.post(`/api/v1/user/${user.id}/settings/tour`, {
        version: TOUR_VERSION,
      });
      revalidate();
    } catch {
      // Not fatal: the tour shows again next time, and only then
    }
  }, [user, revalidate]);

  useEffect(() => {
    if (
      autoStarted.current ||
      !user ||
      !router.isReady ||
      onAuthPage ||
      seenVersion >= TOUR_VERSION
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      autoStarted.current = true;
      setOpen(true);
      // Stored as soon as it is shown, so a reload or a closed tab does not
      // bring it back; it can be replayed from the account menu
      markSeen();
    }, AUTO_START_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [user, router.isReady, onAuthPage, seenVersion, markSeen]);

  const startTour = useCallback(() => setOpen(true), []);
  const closeTour = useCallback(() => setOpen(false), []);

  return (
    <TourContext.Provider
      value={{ available: true, isOpen, startTour, closeTour }}
    >
      {children}
    </TourContext.Provider>
  );
};
