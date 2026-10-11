import useBookLanguages from '@app/hooks/useBookLanguages';
import defineMessages from '@app/utils/defineMessages';
import type { BookLanguage } from '@server/constants/bookLanguages';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.RequestModal.BookLanguageSelect', {
  language: 'Language',
});

interface BookLanguageSelectProps {
  value: BookLanguage;
  onChange: (language: BookLanguage) => void;
  disabled?: boolean;
}

/**
 * The language books are requested in, for users who manage requests
 */
const BookLanguageSelect = ({
  value,
  onChange,
  disabled,
}: BookLanguageSelectProps) => {
  const intl = useIntl();
  const { options } = useBookLanguages();

  return (
    <div className="mt-4">
      <label
        htmlFor="bookLanguage"
        className="block text-sm font-medium text-gray-300"
      >
        {intl.formatMessage(messages.language)}
      </label>
      <select
        id="bookLanguage"
        name="bookLanguage"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as BookLanguage)}
        className="mt-2 border-gray-700 bg-gray-800"
        data-testid="book-language-select"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default BookLanguageSelect;
