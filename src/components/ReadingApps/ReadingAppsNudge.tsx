import { dismiss, isDismissed } from '@app/components/ReadingApps/common';
import useSettings from '@app/hooks/useSettings';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { BookOpenIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { ReadingAppsResponse } from '@server/interfaces/api/userAccessInterfaces';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.ReadingApps.ReadingAppsNudge', {
  nudge: 'Set up your reading apps to read and listen to books here.',
  setUp: 'Set up',
  dismiss: 'Dismiss',
});

/**
 * A small reminder for people who cannot request, so they still find their
 * Reading apps settings. Shown while an app waits to be set up or asked
 * for, until they set it up or dismiss it for 30 days.
 */
const ReadingAppsNudge = ({ className = '' }: { className?: string }) => {
  const intl = useIntl();
  const settings = useSettings();
  const { user, hasPermission } = useUser();
  const [hidden, setHidden] = useState(true);
  const canRequest = hasPermission(
    [Permission.REQUEST, Permission.REQUEST_BOOK],
    { type: 'or' }
  );
  const shouldCheck =
    !!user && settings.currentSettings.readingAppsEnabled && !canRequest;
  const { data } = useSWR<ReadingAppsResponse>(
    shouldCheck ? `/api/v1/user/${user?.id}/settings/apps` : null
  );

  // Read after the first render, as storage only exists in the browser
  useEffect(() => {
    setHidden(!user || isDismissed('nudge', user.id));
  }, [user]);

  const waiting = data?.apps.some(
    (app) => app.state === 'available' || app.state === 'notGranted'
  );

  if (!shouldCheck || !waiting || hidden) {
    return null;
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-xl bg-as-tile px-4 py-3 text-sm ring-1 ring-as-line ${className}`}
      data-testid="reading-apps-nudge"
    >
      <BookOpenIcon className="h-5 w-5 shrink-0 text-as-accent" />
      <span className="min-w-0 flex-1">
        {intl.formatMessage(messages.nudge)}
      </span>
      <Link
        href="/profile/settings/apps"
        className="shrink-0 font-semibold text-as-accent hover:underline"
      >
        {intl.formatMessage(messages.setUp)}
      </Link>
      <button
        type="button"
        className="shrink-0 text-as-ink-muted hover:text-as-ink"
        aria-label={intl.formatMessage(messages.dismiss)}
        onClick={() => {
          if (user) {
            dismiss('nudge', user.id);
          }
          setHidden(true);
        }}
      >
        <XMarkIcon className="h-5 w-5" />
      </button>
    </div>
  );
};

export default ReadingAppsNudge;
