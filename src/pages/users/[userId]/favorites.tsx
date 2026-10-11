import UserFavorites from '@app/components/UserFavorites';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';

const UserFavoritesPage: NextPage = () => {
  useRouteGuard([Permission.MANAGE_REQUESTS, Permission.WATCHLIST_VIEW], {
    type: 'or',
  });
  return <UserFavorites />;
};

export default UserFavoritesPage;
