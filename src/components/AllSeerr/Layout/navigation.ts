import type { SidebarLinkProps } from '@app/components/Layout/Sidebar';
import { SidebarLinks } from '@app/components/Layout/Sidebar';
import type { PhoneTabKey, SpaceKey } from '@app/utils/spaces';

type LinkKey = SidebarLinkProps['messagesKey'];

// Links that live under "More" so the bar stays short. Everything else in
// the sidebar is shown directly, so new sidebar entries appear automatically.
const OVERFLOW_KEYS: LinkKey[] = ['blocklist', 'issues', 'users', 'settings'];

// The sidebar link of each space
export const SPACE_LINK_KEYS: Record<SpaceKey, LinkKey> = {
  movies: 'browsemovies',
  series: 'browsetv',
  music: 'browsemusic',
  books: 'browsebooks',
};

const PHONE_TAB_LINK_KEYS: Record<PhoneTabKey, LinkKey> = {
  home: 'dashboard',
  ...SPACE_LINK_KEYS,
  requests: 'requests',
  library: 'library',
};

export const primaryLinks = SidebarLinks.filter(
  (link) => !OVERFLOW_KEYS.includes(link.messagesKey)
);

export const overflowLinks = SidebarLinks.filter((link) =>
  OVERFLOW_KEYS.includes(link.messagesKey)
);

/** The sidebar links of the phone tab bar, in tab order */
export const getTabBarLinks = (tabs: PhoneTabKey[]): SidebarLinkProps[] =>
  tabs.flatMap((tab) =>
    SidebarLinks.filter((link) => link.messagesKey === PHONE_TAB_LINK_KEYS[tab])
  );

/** Everything the phone tab bar has no room for, for the More sheet */
export const getMoreSheetLinks = (
  tabs: PhoneTabKey[],
  hiddenKeys: LinkKey[] = []
): SidebarLinkProps[] => {
  const tabKeys = tabs.map((tab) => PHONE_TAB_LINK_KEYS[tab]);

  return SidebarLinks.filter(
    (link) =>
      !tabKeys.includes(link.messagesKey) &&
      !hiddenKeys.includes(link.messagesKey)
  );
};
