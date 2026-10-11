import HeadphonesIcon from '@app/components/Common/HeadphonesIcon';
import Tooltip from '@app/components/Common/Tooltip';
import useEditionAvailability from '@app/hooks/useEditionAvailability';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import type { BookFormatIndicatorState } from '@app/utils/bookStatus';
import {
  getBookFormatIndicator,
  needsEditionLookup,
} from '@app/utils/bookStatus';
import defineMessages from '@app/utils/defineMessages';
import { BookOpenIcon } from '@heroicons/react/24/solid';
import type { MediaStatus } from '@server/constants/media';
import { useInView } from 'react-intersection-observer';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Common.BookFormatIndicators', {
  ebookavailable: 'Ebook available',
  ebookrequested: 'Ebook requested',
  ebookprocessing: 'Ebook processing',
  ebooknotrequested: 'Ebook not requested',
  noebookedition: 'No ebook edition found',
  audiobookavailable: 'Audiobook available',
  audiobookrequested: 'Audiobook requested',
  audiobookprocessing: 'Audiobook processing',
  audiobooknotrequested: 'Audiobook not requested',
  noaudiobookedition: 'No audiobook edition found',
});

type BookFormat = 'ebook' | 'audiobook';
type IndicatorSize = 'card' | 'inline';

const classicTone: Record<BookFormatIndicatorState, string> = {
  available: 'bg-green-500/80 ring-green-400 text-green-100',
  requested: 'bg-yellow-500/80 ring-yellow-400 text-yellow-100',
  processing: 'bg-indigo-500/80 ring-indigo-400 text-indigo-100',
  none: 'bg-gray-900/85 ring-white/25 text-white',
  missing: 'bg-gray-900/85 ring-white/10 text-white/40',
};

const ambientTone: Record<BookFormatIndicatorState, string> = {
  available: 'bg-as-ok ring-as-ok text-as-ground',
  requested: 'bg-as-accent ring-as-accent text-as-ground',
  processing: 'bg-as-accent ring-as-accent text-as-ground',
  none: 'bg-as-ground/90 ring-as-line-strong text-as-ink',
  missing: 'bg-as-ground/90 ring-as-line text-as-ink/40',
};

const sizeClasses: Record<IndicatorSize, { chip: string; icon: string }> = {
  card: { chip: 'h-6 w-6 sm:h-7 sm:w-7', icon: 'h-3.5 w-3.5 sm:h-4 sm:w-4' },
  inline: { chip: 'h-7 w-7', icon: 'h-4 w-4' },
};

const getLabel = (format: BookFormat, state: BookFormatIndicatorState) => {
  if (format === 'ebook') {
    return {
      available: messages.ebookavailable,
      requested: messages.ebookrequested,
      processing: messages.ebookprocessing,
      none: messages.ebooknotrequested,
      missing: messages.noebookedition,
    }[state];
  }

  return {
    available: messages.audiobookavailable,
    requested: messages.audiobookrequested,
    processing: messages.audiobookprocessing,
    none: messages.audiobooknotrequested,
    missing: messages.noaudiobookedition,
  }[state];
};

/**
 * Small round chip for one format of a book: a book for the ebook and
 * headphones for the audiobook, colored by the format's status
 */
export const BookFormatIcon = ({
  format,
  state,
  size = 'card',
}: {
  format: BookFormat;
  state: BookFormatIndicatorState;
  size?: IndicatorSize;
}) => {
  const intl = useIntl();
  const [interfaceStyle] = useInterfaceStyle();
  const tone = (interfaceStyle === 'ambient' ? ambientTone : classicTone)[
    state
  ];
  const label = intl.formatMessage(getLabel(format, state));
  const Icon = format === 'ebook' ? BookOpenIcon : HeadphonesIcon;

  return (
    <Tooltip content={label}>
      <span
        role="img"
        aria-label={label}
        className={`pointer-events-auto inline-flex flex-none items-center justify-center rounded-full shadow-md ring-1 ${sizeClasses[size].chip} ${tone}`}
        data-testid={`book-format-${format}`}
        data-state={state}
      >
        <Icon className={sizeClasses[size].icon} />
      </span>
    </Tooltip>
  );
};

interface BookFormatIndicatorsProps {
  olId: string;
  title: string;
  // Author names, comma separated
  author?: string;
  status?: MediaStatus;
  statusAudio?: MediaStatus;
  size?: IndicatorSize;
  className?: string;
}

/**
 * Ebook and audiobook chips for a book. Asks whether an edition exists in
 * each format once the chips scroll into view, and only while that format
 * was not requested.
 */
const BookFormatIndicators = ({
  olId,
  title,
  author,
  status,
  statusAudio,
  size = 'card',
  className = '',
}: BookFormatIndicatorsProps) => {
  const { ref, inView } = useInView({ triggerOnce: true, rootMargin: '200px' });
  const ebook = useEditionAvailability(
    'ebook',
    { olId, title, author },
    inView && needsEditionLookup(status)
  );
  const audiobook = useEditionAvailability(
    'audiobook',
    { olId, title, author },
    inView && needsEditionLookup(statusAudio)
  );

  return (
    <span
      ref={ref}
      className={`inline-flex items-center ${
        size === 'card' ? 'gap-1' : 'gap-1.5'
      } ${className}`}
    >
      <BookFormatIcon
        format="ebook"
        state={getBookFormatIndicator(status, ebook?.exists)}
        size={size}
      />
      <BookFormatIcon
        format="audiobook"
        state={getBookFormatIndicator(statusAudio, audiobook?.exists)}
        size={size}
      />
    </span>
  );
};

export default BookFormatIndicators;
