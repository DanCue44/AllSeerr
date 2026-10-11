import UserAvatar from '@app/components/AllSeerr/RequestList/UserAvatar';
import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from '@headlessui/react';
import {
  CheckIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import type { User } from '@server/entity/User';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

interface RequesterSelectProps {
  users: Pick<User, 'id' | 'displayName' | 'avatar'>[];
  value?: number;
  onChange: (userId?: number) => void;
  everyoneLabel: string;
  label: string;
  searchPlaceholder: string;
  noResultsLabel: string;
}

type Option = Pick<User, 'id' | 'displayName' | 'avatar'>;

/**
 * Picks whose requests to show, with each person's avatar next to their
 * name so they are easy to tell apart, and a search field for long lists.
 */
const RequesterSelect = ({
  users,
  value,
  onChange,
  everyoneLabel,
  label,
  searchPlaceholder,
  noResultsLabel,
}: RequesterSelectProps) => {
  const selected = users.find((user) => user.id === value);

  const everyoneIcon = (
    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-as-raised text-as-ink-muted">
      <UsersIcon className="h-4 w-4" />
    </span>
  );

  return (
    <Popover className="relative">
      <PopoverButton
        aria-label={label}
        className="flex h-11 max-w-[16rem] items-center gap-2.5 rounded-full border border-as-line-strong bg-as-raised pl-2 pr-3.5 text-[15px] font-semibold text-as-ink transition hover:bg-as-line focus:outline-none focus-visible:ring-2 focus-visible:ring-as-accent"
      >
        {selected ? (
          <UserAvatar
            id={selected.id}
            name={selected.displayName}
            avatar={selected.avatar}
            size={28}
          />
        ) : (
          everyoneIcon
        )}
        <span className="truncate">
          {selected ? selected.displayName : everyoneLabel}
        </span>
        <ChevronDownIcon className="h-4 w-4 flex-none text-as-ink-muted" />
      </PopoverButton>
      <Transition
        as={Fragment}
        enter="transition duration-100 ease-out"
        enterFrom="opacity-0 scale-95"
        enterTo="opacity-100 scale-100"
        leave="transition duration-75 ease-in"
        leaveFrom="opacity-100 scale-100"
        leaveTo="opacity-0 scale-95"
      >
        <PopoverPanel className="absolute left-0 z-40 mt-2 w-72 origin-top-left rounded-2xl border border-as-line bg-as-surface p-1.5 shadow-[0_20px_40px_rgba(0,0,0,0.45)] focus:outline-none">
          {({ close }) => (
            <RequesterList
              users={users}
              value={value}
              everyoneLabel={everyoneLabel}
              everyoneIcon={everyoneIcon}
              searchPlaceholder={searchPlaceholder}
              noResultsLabel={noResultsLabel}
              onPick={(userId) => {
                onChange(userId);
                close();
              }}
            />
          )}
        </PopoverPanel>
      </Transition>
    </Popover>
  );
};

const RequesterList = ({
  users,
  value,
  everyoneLabel,
  everyoneIcon,
  searchPlaceholder,
  noResultsLabel,
  onPick,
}: {
  users: Option[];
  value?: number;
  everyoneLabel: string;
  everyoneIcon: React.ReactNode;
  searchPlaceholder: string;
  noResultsLabel: string;
  onPick: (userId?: number) => void;
}) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Everyone stays at the top until a search narrows the list
  const options = useMemo<Option[]>(() => {
    const term = query.trim().toLowerCase();
    const matches = term
      ? users.filter((user) => user.displayName.toLowerCase().includes(term))
      : users;
    return term
      ? matches
      : [{ id: 0, displayName: everyoneLabel, avatar: '' }, ...matches];
  }, [users, query, everyoneLabel]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && options[active]) {
      event.preventDefault();
      onPick(options[active].id || undefined);
    }
  };

  return (
    <>
      <div className="relative mb-1.5">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-as-ink-faint" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          autoComplete="off"
          className="!h-10 !w-full !rounded-xl !border-0 !bg-as-raised !pl-9 !pr-3 !text-sm !text-as-ink placeholder:text-as-ink-faint focus:!ring-1 focus:!ring-as-line-strong"
        />
      </div>
      <div
        ref={listRef}
        role="listbox"
        className="max-h-72 overflow-auto overscroll-contain"
      >
        {options.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-as-ink-faint">
            {noResultsLabel}
          </div>
        )}
        {options.map((user, index) => {
          const isSelected = (value ?? 0) === user.id;
          return (
            <button
              key={`requester-option-${user.id}`}
              type="button"
              role="option"
              aria-selected={isSelected}
              data-index={index}
              onMouseEnter={() => setActive(index)}
              onClick={() => onPick(user.id || undefined)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm ${
                index === active
                  ? 'bg-as-raised text-as-ink'
                  : 'text-as-ink-soft'
              }`}
            >
              {user.id === 0 ? (
                everyoneIcon
              ) : (
                <UserAvatar
                  id={user.id}
                  name={user.displayName}
                  avatar={user.avatar}
                  size={28}
                />
              )}
              <span
                className={`flex-1 truncate ${
                  isSelected ? 'font-semibold text-as-ink' : ''
                }`}
              >
                {user.displayName}
              </span>
              {isSelected && (
                <CheckIcon className="h-4 w-4 flex-none text-as-accent" />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
};

export default RequesterSelect;
