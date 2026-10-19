import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { getNoBookEndsDeviceUser } from '@server/lib/nobookendsDevices';
import type {
  Permission,
  PermissionCheckOptions,
} from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import { hashUserApiKey, isUserApiKey } from '@server/lib/userApiKey';

export const checkUser: Middleware = async (req, _res, next) => {
  const settings = getSettings();
  let user: User | undefined | null;

  const apiKey = req.header('X-API-Key');

  if (isUserApiKey(apiKey)) {
    // A personal key always acts as its owner; X-API-User is ignored
    const userRepository = getRepository(User);
    const keyHash = hashUserApiKey(apiKey);

    // The key the user made, the key of a device NoBookEnds connected on, or
    // the single NoBookEnds key from before devices were kept apart
    user =
      (await userRepository.findOne({
        where: [{ apiKeyHash: keyHash }, { nobookendsKeyHash: keyHash }],
      })) ?? (await getNoBookEndsDeviceUser(keyHash));
  } else if (apiKey && apiKey === settings.main.apiKey) {
    const userRepository = getRepository(User);

    let userId = 1; // Work on original administrator account

    // If a User ID is provided, we will act on that user's behalf
    if (req.header('X-API-User')) {
      userId = Number(req.header('X-API-User'));
    }

    user = await userRepository.findOne({ where: { id: userId } });
  } else if (req.session?.userId) {
    const userRepository = getRepository(User);

    user = await userRepository.findOne({
      where: { id: req.session.userId },
    });
  }

  if (user) {
    req.user = user;
  }

  req.locale = user?.settings?.locale
    ? user.settings.locale
    : settings.main.locale;

  next();
};

export const isAuthenticated = (
  permissions?: Permission | Permission[],
  options?: PermissionCheckOptions
): Middleware => {
  const authMiddleware: Middleware = (req, res, next) => {
    if (!req.user || !req.user.hasPermission(permissions ?? 0, options)) {
      res.status(403).json({
        status: 403,
        error: 'You do not have permission to access this endpoint',
      });
    } else {
      next();
    }
  };
  return authMiddleware;
};
