import type { UserAccessApp } from '@server/constants/userAccess';
import {
  DEFAULT_INVITE_DAYS,
  MAX_INVITE_DAYS,
  USER_ACCESS_APP_NAMES,
  USER_ACCESS_APPS,
} from '@server/constants/userAccess';
import { getRepository } from '@server/datasource';
import type { InviteApps } from '@server/entity/AccessInvite';
import { AccessInvite } from '@server/entity/AccessInvite';
import type { User } from '@server/entity/User';
import type { InviteSummary } from '@server/interfaces/api/userAccessInterfaces';
import type { NewPasswords } from '@server/lib/userAccess';
import { getAppPublicUrl, updatePerson } from '@server/lib/userAccess';
import type { AgeLimit } from '@server/lib/userAccess/ageLimits';
import { isRestricted } from '@server/lib/userAccess/ageLimits';
import { createHash, randomBytes } from 'crypto';
import { IsNull, MoreThan } from 'typeorm';

export type { InviteSummary };

export const hashInviteToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const summarize = (invite: AccessInvite): InviteSummary => ({
  id: invite.id,
  label: invite.label ?? null,
  apps: invite.apps,
  ageLimit: invite.ageLimit ?? null,
  includeUnrated: invite.includeUnrated,
  expiresAt: invite.expiresAt,
  redeemedAt: invite.redeemedAt ?? null,
  redeemedBy: invite.redeemedBy
    ? {
        id: invite.redeemedBy.id,
        displayName: invite.redeemedBy.displayName,
      }
    : null,
  revokedAt: invite.revokedAt ?? null,
  createdAt: invite.createdAt,
  createdBy: invite.createdBy
    ? { id: invite.createdBy.id, displayName: invite.createdBy.displayName }
    : null,
});

export interface NewInvite {
  label?: string | null;
  apps: InviteApps;
  ageLimit?: AgeLimit | null;
  includeUnrated?: boolean;
  days?: number;
}

/**
 * Makes an invite and answers with its token, which is only known now
 */
export const createInvite = async (
  createdBy: User,
  { label, apps, ageLimit, includeUnrated, days }: NewInvite
): Promise<{ invite: InviteSummary; token: string }> => {
  const token = randomBytes(24).toString('base64url');
  const validDays = Math.min(
    Math.max(Math.round(days ?? DEFAULT_INVITE_DAYS), 1),
    MAX_INVITE_DAYS
  );
  const invite = new AccessInvite({
    tokenHash: hashInviteToken(token),
    createdBy,
    label: label?.trim() || null,
    apps: Object.fromEntries(
      USER_ACCESS_APPS.filter((app) => apps[app]).map((app) => [
        app,
        {
          libraryIds: apps[app]?.libraryIds?.length
            ? apps[app]!.libraryIds
            : null,
        },
      ])
    ),
    ageLimit: isRestricted(ageLimit) ? ageLimit : null,
    includeUnrated: includeUnrated ?? false,
    expiresAt: new Date(Date.now() + validDays * 24 * 60 * 60 * 1000),
  });

  await getRepository(AccessInvite).save(invite);

  return { invite: summarize(invite), token };
};

export const listInvites = async (): Promise<InviteSummary[]> =>
  (
    await getRepository(AccessInvite).find({
      relations: { createdBy: true, redeemedBy: true },
      order: { createdAt: 'DESC' },
    })
  ).map(summarize);

export const revokeInvite = async (id: number): Promise<boolean> => {
  const repository = getRepository(AccessInvite);
  const invite = await repository.findOne({ where: { id } });

  if (!invite) {
    return false;
  }

  invite.revokedAt = invite.revokedAt ?? new Date();
  await repository.save(invite);

  return true;
};

/**
 * The invite a token opens, while it is neither used, revoked nor expired
 */
export const findValidInvite = async (
  token: unknown
): Promise<AccessInvite | null> => {
  if (typeof token !== 'string' || token.length < 16 || token.length > 128) {
    return null;
  }

  return getRepository(AccessInvite).findOne({
    where: {
      tokenHash: hashInviteToken(token),
      redeemedAt: IsNull(),
      revokedAt: IsNull(),
      expiresAt: MoreThan(new Date()),
    },
  });
};

/**
 * Whether the person came in through an invite, which keeps letting them
 * sign in with Plex without access to the Plex server
 */
export const hasRedeemedInvite = async (userId: number): Promise<boolean> =>
  (await getRepository(AccessInvite).count({
    where: { redeemedBy: { id: userId }, revokedAt: IsNull() },
  })) > 0;

/**
 * What an invite page shows before signing in: only the app names
 */
export const describeInvite = (invite: AccessInvite) => ({
  apps: USER_ACCESS_APPS.filter((app) => invite.apps[app]).map((app) => ({
    app,
    name: USER_ACCESS_APP_NAMES[app],
    url: getAppPublicUrl(app) ?? null,
  })),
  expiresAt: invite.expiresAt,
});

/**
 * Gives the person signing in with an invite the apps, libraries and age
 * limit it names, and uses it up. Answers with the passwords of accounts
 * made for them, to show them once.
 */
export const redeemInvite = async (
  invite: AccessInvite,
  user: User
): Promise<NewPasswords> => {
  const repository = getRepository(AccessInvite);

  // Taken first, so the same link cannot be used twice at once
  const taken = await repository
    .createQueryBuilder()
    .update(AccessInvite)
    .set({ redeemedAt: new Date(), redeemedBy: { id: user.id } })
    .where({ id: invite.id, redeemedAt: IsNull() })
    .execute();

  if (!taken.affected) {
    return {};
  }

  const apps: Partial<
    Record<UserAccessApp, { enabled: boolean; libraryIds: string[] | null }>
  > = {};

  for (const app of USER_ACCESS_APPS) {
    const access = invite.apps[app];
    if (access) {
      apps[app] = { enabled: true, libraryIds: access.libraryIds };
    }
  }

  const { passwords } = await updatePerson(user.id, {
    ageLimit: invite.ageLimit ?? null,
    includeUnrated: invite.includeUnrated,
    apps,
  });

  return passwords;
};
