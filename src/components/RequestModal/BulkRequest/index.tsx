import Badge from '@app/components/Common/Badge';
import QuotaDisplay from '@app/components/RequestModal/QuotaDisplay';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import type { BulkRequestResponse } from '@server/interfaces/api/requestInterfaces';
import type { QuotaStatus } from '@server/interfaces/api/userInterfaces';
import type { BulkSkipReason } from '@server/lib/catalogFilters';
import { MAX_BULK_REQUEST_ITEMS } from '@server/lib/catalogFilters';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import type { IntlShape } from 'react-intl';
import { useIntl } from 'react-intl';

// Pieces shared by the discography and author catalog request modals

const messages = defineMessages('components.RequestModal.BulkRequest', {
  quotausage:
    'This will use <strong>{count, number}</strong> of your <strong>{remaining, number}</strong> remaining {type, select, music {music} other {book}} requests.',
  quotausageuser:
    "This will use <strong>{count, number}</strong> of this user's <strong>{remaining, number}</strong> remaining {type, select, music {music} other {book}} requests.",
  quotaexceeded:
    'This needs <strong>{count, number}</strong> {type, select, music {music} other {book}} requests, but only <strong>{remaining, number}</strong> remain. Deselect some to continue.',
  quotabypassed:
    'These {count, plural, one {request} other {requests}} will not count against the quota.',
  toomany:
    'A request can include at most {max, number} {type, select, music {albums} other {books}}. Deselect {over, number} to continue.',
  toomanybooks:
    'A request can include at most {max, number} books, and a book requested in both formats counts twice. Deselect some to continue.',
  requested:
    'Requested <strong>{count, number}</strong> {type, select, music {{count, plural, one {album} other {albums}}} other {{count, plural, one {book} other {books}}}}.',
  skipped:
    '{count, number} already requested, available or blocklisted {count, plural, one {was} other {were}} skipped.',
  failed: '{count, number} could not be requested: {titles}',
  nothingrequested: 'Nothing was requested.',
});

export type BulkRequestType = 'music' | 'book';

/**
 * Fades a bulk request modal in and out the way RequestModal does, and
 * mounts it only while it is shown
 */
export const BulkRequestTransition = ({
  show,
  children,
}: {
  show: boolean;
  children: ReactNode;
}) => (
  <Transition
    as="div"
    enter="transition-opacity duration-300"
    enterFrom="opacity-0"
    enterTo="opacity-100"
    leave="transition-opacity duration-300"
    leaveFrom="opacity-100"
    leaveTo="opacity-0"
    show={show}
  >
    {children}
  </Transition>
);

interface BulkItemRowProps {
  id: string;
  title: string;
  detail?: ReactNode;
  checked: boolean;
  skipReason?: BulkSkipReason;
  disabled?: boolean;
  onToggle: () => void;
}

/**
 * An album or book of a bulk request. One that is already requested,
 * available or blocklisted shows why and cannot be selected.
 */
export const BulkItemRow = ({
  id,
  title,
  detail,
  checked,
  skipReason,
  disabled,
  onToggle,
}: BulkItemRowProps) => {
  const intl = useIntl();
  const isLocked = !!skipReason || disabled;
  const inputId = `bulk-item-${id}`;

  return (
    <li className="flex items-center gap-3 px-4 py-2 text-sm">
      <input
        id={inputId}
        type="checkbox"
        className="h-5 w-5 flex-shrink-0"
        checked={!skipReason && checked}
        disabled={isLocked}
        onChange={onToggle}
      />
      <label
        htmlFor={inputId}
        className={`flex min-w-0 flex-1 items-baseline gap-2 ${
          isLocked ? 'opacity-50' : 'cursor-pointer'
        }`}
      >
        <span className="truncate text-gray-100">{title}</span>
        {detail && (
          <span className="flex-shrink-0 text-xs text-gray-400">{detail}</span>
        )}
      </label>
      {skipReason === 'available' ? (
        <Badge badgeType="success">
          {intl.formatMessage(globalMessages.available)}
        </Badge>
      ) : skipReason === 'requested' ? (
        <Badge badgeType="primary">
          {intl.formatMessage(globalMessages.requested)}
        </Badge>
      ) : skipReason === 'blocklisted' ? (
        <Badge badgeType="danger">
          {intl.formatMessage(globalMessages.blocklisted)}
        </Badge>
      ) : null}
    </li>
  );
};

interface GroupCheckboxProps {
  id: string;
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  onChange: () => void;
}

/**
 * A checkbox that selects a whole group, half checked while only some of
 * the group is selected
 */
export const GroupCheckbox = ({
  id,
  checked,
  indeterminate,
  disabled,
  onChange,
}: GroupCheckboxProps) => {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      id={id}
      type="checkbox"
      className="h-5 w-5 flex-shrink-0"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
    />
  );
};

/**
 * Whether a bulk request of count requests needs more than the quota has
 * left and is not bypassing it
 */
export const isOverQuota = (
  quota: QuotaStatus | undefined,
  count: number,
  ignoreQuota?: boolean
): boolean =>
  !ignoreQuota && (quota?.limit ?? 0) > 0 && count > (quota?.remaining ?? 0);

interface BulkQuotaNoticeProps {
  type: BulkRequestType;
  quota?: QuotaStatus;
  count: number;
  ignoreQuota?: boolean;
  userOverride?: number;
}

/**
 * The quota of the requester and how much of it the request uses
 */
export const BulkQuotaNotice = ({
  type,
  quota,
  count,
  ignoreQuota,
  userOverride,
}: BulkQuotaNoticeProps) => {
  const intl = useIntl();

  if ((quota?.limit ?? 0) <= 0) {
    return null;
  }

  const remaining = quota?.remaining ?? 0;
  const strong = (msg: ReactNode) => <strong>{msg}</strong>;

  return (
    <>
      <QuotaDisplay
        mediaType={type}
        quota={quota}
        userOverride={userOverride}
      />
      {count > 0 && (
        <p
          className={`-mt-2 mb-4 text-sm ${
            isOverQuota(quota, count, ignoreQuota)
              ? 'text-red-500'
              : 'text-gray-300'
          }`}
        >
          {ignoreQuota
            ? intl.formatMessage(messages.quotabypassed, { count })
            : count > remaining
              ? intl.formatMessage(messages.quotaexceeded, {
                  count,
                  remaining,
                  type,
                  strong,
                })
              : intl.formatMessage(
                  userOverride ? messages.quotausageuser : messages.quotausage,
                  { count, remaining, type, strong }
                )}
        </p>
      )}
    </>
  );
};

interface BulkLimitNoticeProps {
  type: BulkRequestType;
  count: number;
}

/**
 * Tells the user to deselect items when the request is over the limit of a
 * single bulk request
 */
export const BulkLimitNotice = ({ type, count }: BulkLimitNoticeProps) => {
  const intl = useIntl();

  if (count <= MAX_BULK_REQUEST_ITEMS) {
    return null;
  }

  return (
    <p className="mb-4 text-sm text-red-500">
      {type === 'book'
        ? intl.formatMessage(messages.toomanybooks, {
            max: MAX_BULK_REQUEST_ITEMS,
          })
        : intl.formatMessage(messages.toomany, {
            max: MAX_BULK_REQUEST_ITEMS,
            over: count - MAX_BULK_REQUEST_ITEMS,
            type,
          })}
    </p>
  );
};

const MAX_FAILED_TITLES = 5;

/**
 * Toast content summing up what a bulk request created, skipped and failed
 */
export const getBulkRequestToast = (
  intl: IntlShape,
  type: BulkRequestType,
  result: BulkRequestResponse
): {
  content: ReactNode;
  appearance: 'success' | 'warning' | 'info';
} => {
  // A book requested in both formats is one book
  const count = new Set(result.created.map((item) => item.mediaId)).size;
  const failedTitles = [...new Set(result.failed.map((item) => item.title))];

  return {
    content: (
      <span>
        {count > 0
          ? intl.formatMessage(messages.requested, {
              count,
              type,
              strong: (msg: ReactNode) => <strong>{msg}</strong>,
            })
          : intl.formatMessage(messages.nothingrequested)}
        {result.skipped.length > 0 && (
          <>
            {' '}
            {intl.formatMessage(messages.skipped, {
              count: result.skipped.length,
            })}
          </>
        )}
        {failedTitles.length > 0 && (
          <>
            {' '}
            {intl.formatMessage(messages.failed, {
              count: failedTitles.length,
              titles:
                failedTitles.slice(0, MAX_FAILED_TITLES).join(', ') +
                (failedTitles.length > MAX_FAILED_TITLES ? ', …' : ''),
            })}
          </>
        )}
      </span>
    ),
    appearance:
      result.failed.length > 0 ? 'warning' : count > 0 ? 'success' : 'info',
  };
};
