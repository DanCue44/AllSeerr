import type { InterfaceStyle } from '@app/context/InterfaceStyleContext';
import { InterfaceStyleContext } from '@app/context/InterfaceStyleContext';
import { useContext } from 'react';

export type { InterfaceStyle };

/**
 * The interface style this browser uses, and a setter. Stored per device,
 * so a household can try the new interface without changing it for everyone.
 */
const useInterfaceStyle = (): [
  InterfaceStyle,
  (style: InterfaceStyle) => void,
] => {
  const { interfaceStyle, setInterfaceStyle } = useContext(
    InterfaceStyleContext
  );

  return [interfaceStyle, setInterfaceStyle];
};

export default useInterfaceStyle;
