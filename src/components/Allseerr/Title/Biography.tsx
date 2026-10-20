import defineMessages from '@app/utils/defineMessages';
import { useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Allseerr.Biography', {
  showmore: 'Show more',
  showless: 'Show less',
});

// Longer texts start clamped to a few lines
const CLAMP_LENGTH = 480;

/** Biography or description text in the details sheet, clamped when long. */
const Biography = ({ title, text }: { title?: string; text: string }) => {
  const intl = useIntl();
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > CLAMP_LENGTH;

  return (
    <div className="flex max-w-[760px] flex-col gap-1.5">
      {title && (
        <h2 className="text-xs font-bold uppercase tracking-wider text-as-ink-faint">
          {title}
        </h2>
      )}
      <p
        className={`whitespace-pre-line leading-relaxed text-as-ink-soft ${
          isLong && !expanded ? 'line-clamp-5' : ''
        }`}
      >
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          className="self-start text-sm font-semibold text-as-accent hover:text-as-accent-soft"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {intl.formatMessage(expanded ? messages.showless : messages.showmore)}
        </button>
      )}
    </div>
  );
};

export default Biography;
