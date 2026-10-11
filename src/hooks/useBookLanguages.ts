import useSettings from '@app/hooks/useSettings';
import { useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import type { BookLanguage } from '@server/constants/bookLanguages';
import {
  BOOK_LANGUAGE_ANY,
  BOOK_LANGUAGE_CODES,
  getEffectiveBookLanguage,
  isBookLanguage,
} from '@server/constants/bookLanguages';
import { useCallback, useMemo } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('hooks.useBookLanguages', {
  anyLanguage: 'Any Language',
});

/**
 * The languages books can be requested in, named in the display language,
 * and the language the current user requests books in
 */
const useBookLanguages = () => {
  const intl = useIntl();
  const { user } = useUser();
  const { currentSettings } = useSettings();

  const getLanguageName = useCallback(
    (language?: string | null): string | undefined => {
      if (!isBookLanguage(language)) {
        return undefined;
      }

      return language === BOOK_LANGUAGE_ANY
        ? intl.formatMessage(messages.anyLanguage)
        : (intl.formatDisplayName(language, { type: 'language' }) ?? language);
    },
    [intl]
  );

  const options = useMemo(
    () =>
      BOOK_LANGUAGE_CODES.map((language) => ({
        value: language,
        label: getLanguageName(language) ?? language,
      })),
    [getLanguageName]
  );

  const userLanguage: BookLanguage = getEffectiveBookLanguage(
    user?.settings?.bookLanguage,
    currentSettings.bookLanguage
  );

  return {
    options,
    getLanguageName,
    serverLanguage: currentSettings.bookLanguage,
    userLanguage,
  };
};

export default useBookLanguages;
