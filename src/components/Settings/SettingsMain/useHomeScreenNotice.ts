import { DEFAULT_APPLICATION_TITLE } from '@app/hooks/useBranding';
import useToasts from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import { useCallback } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Settings.SettingsMain', {
  homeScreenNotice:
    'Phones keep the name and logo they had when the app was added to the home screen. To see the change, delete {applicationTitle} from your home screen and add it to the home screen again. Let your users know they need to do the same.',
});

/**
 * Tells the admin that home screen shortcuts do not pick up a new name or
 * logo: iOS keeps them from when the shortcut was added.
 */
const useHomeScreenNotice = () => {
  const intl = useIntl();
  const { addToast } = useToasts();

  return useCallback(
    (applicationTitle?: string) =>
      addToast(
        intl.formatMessage(messages.homeScreenNotice, {
          applicationTitle: applicationTitle || DEFAULT_APPLICATION_TITLE,
        }),
        { autoDismiss: false, appearance: 'info' }
      ),
    [addToast, intl]
  );
};

export default useHomeScreenNotice;
