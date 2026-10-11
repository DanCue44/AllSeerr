import React, { createContext, useCallback, useEffect, useState } from 'react';

export type InterfaceStyle = 'classic' | 'ambient';

export const INTERFACE_COOKIE = 'allseerr-interface';

// The Ambient interface is the default; the classic one stays selectable
export const DEFAULT_INTERFACE_STYLE: InterfaceStyle = 'ambient';

// Charcoal, the gray picked for AllSeerr
export const AMBIENT_PALETTE = 'charcoal';

export const parseInterfaceStyle = (cookie?: string): InterfaceStyle => {
  const match = cookie?.match(
    new RegExp(`(?:^|;\\s*)${INTERFACE_COOKIE}=(\\w+)`)
  );
  return match?.[1] === 'ambient' || match?.[1] === 'classic'
    ? match[1]
    : DEFAULT_INTERFACE_STYLE;
};

interface InterfaceStyleContextProps {
  interfaceStyle: InterfaceStyle;
  setInterfaceStyle: (style: InterfaceStyle) => void;
}

export const InterfaceStyleContext = createContext<InterfaceStyleContextProps>({
  interfaceStyle: DEFAULT_INTERFACE_STYLE,
  setInterfaceStyle: () => undefined,
});

interface InterfaceStyleProviderProps {
  initialStyle: InterfaceStyle;
  children?: React.ReactNode;
}

/**
 * Holds the interface this browser uses. It is kept in a cookie so the
 * server renders the right layout on the first paint.
 */
export const InterfaceStyleProvider = ({
  initialStyle,
  children,
}: InterfaceStyleProviderProps) => {
  const [interfaceStyle, setStyle] = useState<InterfaceStyle>(initialStyle);

  const setInterfaceStyle = useCallback((style: InterfaceStyle) => {
    document.cookie = `${INTERFACE_COOKIE}=${style}; path=/; max-age=31536000; samesite=lax`;
    setStyle(style);
  }, []);

  // The palette lives on <html> so pages outside the layout, such as sign
  // in, and modals rendered at the body pick it up too
  useEffect(() => {
    const root = document.documentElement;

    if (interfaceStyle === 'ambient') {
      root.dataset.palette = AMBIENT_PALETTE;
    } else {
      delete root.dataset.palette;
    }
  }, [interfaceStyle]);

  // Earlier builds kept the choice in local storage; carry it over once
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(INTERFACE_COOKIE);
      if (stored === 'ambient' || stored === 'classic') {
        window.localStorage.removeItem(INTERFACE_COOKIE);
        if (!document.cookie.includes(`${INTERFACE_COOKIE}=`)) {
          setInterfaceStyle(stored);
        }
      }
    } catch {
      // Storage can be unavailable; the cookie is what matters
    }
  }, [setInterfaceStyle]);

  return (
    <InterfaceStyleContext.Provider
      value={{ interfaceStyle, setInterfaceStyle }}
    >
      {children}
    </InterfaceStyleContext.Provider>
  );
};
