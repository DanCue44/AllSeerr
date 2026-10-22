import { getRepository } from '@server/datasource';
import { NoBookEndsDevice } from '@server/entity/NoBookEndsDevice';
import { User } from '@server/entity/User';
import {
  getNoBookEndsAppConnectUrl,
  getNoBookEndsConnectUrl,
} from '@server/lib/nobookends';
import { getSettings } from '@server/lib/settings';
import { generateUserApiKey, hashUserApiKey } from '@server/lib/userApiKey';
import logger from '@server/logger';
import { sanitizeNoBookEndsDeviceLabel } from '@server/utils/nobookendsDeviceLabel';

// Connecting more devices than this removes the oldest ones
export const MAX_NOBOOKENDS_DEVICES = 10;

// When a device was last used is only saved this often, so every request
// the app makes does not write to the database
export const NOBOOKENDS_LAST_USED_INTERVAL_MS = 60 * 60 * 1000;

export interface NoBookEndsDeviceResponse {
  id: number;
  label: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

const toResponse = (device: NoBookEndsDevice): NoBookEndsDeviceResponse => ({
  id: device.id,
  label: device.label ?? null,
  createdAt: device.createdAt,
  lastUsedAt: device.lastUsedAt ?? null,
});

/**
 * The devices a user connected, newest first. Never includes the key hashes.
 */
export const getNoBookEndsDevices = async (
  userId: number
): Promise<NoBookEndsDeviceResponse[]> => {
  const devices = await getRepository(NoBookEndsDevice).find({
    where: { user: { id: userId } },
    order: { createdAt: 'DESC', id: 'DESC' },
  });

  return devices.map(toResponse);
};

/**
 * Makes a key for one more device. The keys of the user's other devices keep
 * working, up to the limit, past which the oldest are removed.
 */
export const addNoBookEndsDevice = async (
  user: User,
  label?: unknown
): Promise<{ apiKey: string; device: NoBookEndsDeviceResponse }> => {
  const repository = getRepository(NoBookEndsDevice);
  const apiKey = generateUserApiKey();

  const device = await repository.save(
    new NoBookEndsDevice({
      user,
      keyHash: hashUserApiKey(apiKey),
      label: sanitizeNoBookEndsDeviceLabel(label),
      createdAt: new Date(),
      lastUsedAt: null,
    })
  );

  const devices = await repository.find({
    where: { user: { id: user.id } },
    order: { createdAt: 'DESC', id: 'DESC' },
    select: { id: true },
  });
  const removed = devices.slice(MAX_NOBOOKENDS_DEVICES).map(({ id }) => id);

  if (removed.length > 0) {
    await repository.delete(removed);
  }

  logger.info('NoBookEnds device connected', {
    label: 'API',
    userId: user.id,
    deviceId: device.id,
    removedDevices: removed.length,
  });

  return { apiKey, device: toResponse(device) };
};

/**
 * Connects NoBookEnds on one more device of a user: its key, the link that
 * sets the app up with it, and the app URL the connect page hands it back
 * with
 */
export const connectNoBookEndsDevice = async (
  user: User,
  allseerrUrl: string,
  label?: unknown
): Promise<{
  apiKey: string;
  device: NoBookEndsDeviceResponse;
  connectUrl: string;
  appUrl: string;
}> => {
  const { apiKey, device } = await addNoBookEndsDevice(user, label);
  const connectParams = {
    audiobookshelfUrl: getSettings().audiobookshelf.url ?? '',
    allseerrUrl,
    apiKey,
  };

  return {
    apiKey,
    device,
    connectUrl: getNoBookEndsConnectUrl(connectParams),
    appUrl: getNoBookEndsAppConnectUrl(connectParams),
  };
};

/**
 * The user a device key belongs to, or null. Notes when the device was used.
 */
export const getNoBookEndsDeviceUser = async (
  keyHash: string
): Promise<User | null> => {
  const repository = getRepository(NoBookEndsDevice);
  const device = await repository.findOne({
    where: { keyHash },
    relations: { user: true },
  });

  if (!device?.user) {
    return null;
  }

  const user = await getRepository(User).findOne({
    where: { id: device.user.id },
  });

  if (!user) {
    return null;
  }

  const now = Date.now();
  const lastUsed = device.lastUsedAt
    ? new Date(device.lastUsedAt).getTime()
    : 0;

  if (now - lastUsed >= NOBOOKENDS_LAST_USED_INTERVAL_MS) {
    try {
      await repository.update(device.id, { lastUsedAt: new Date(now) });
    } catch (e) {
      logger.warn('Could not save when a NoBookEnds device was used', {
        label: 'API',
        deviceId: device.id,
        errorMessage: e.message,
      });
    }
  }

  return user;
};
