import type { User } from '@server/entity/User';
import { getIntl } from '@server/i18n';
import { getEmailLogo } from '@server/lib/branding';
import PreparedEmail from '@server/lib/email';
import { emailMessages, getEmailLayoutLocals } from '@server/lib/email/format';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import type { AvailableLocale } from '@server/types/languages';
import path from 'path';

/**
 * Emails a person the username and password Allseerr made for them in an
 * app. Answers whether it was sent, false when email is off or the person
 * has no address.
 */
export const sendAppAccountEmail = async ({
  user,
  appName,
  appUrl,
  username,
  password,
}: {
  user: User;
  appName: string;
  appUrl?: string;
  username: string;
  password: string;
}): Promise<boolean> => {
  const settings = getSettings();
  const emailSettings = settings.notifications.agents.email;

  if (!emailSettings.enabled || !user.email || !user.email.includes('@')) {
    return false;
  }

  const { applicationTitle, applicationUrl } = settings.main;
  const intl = getIntl(user.settings?.locale as AvailableLocale);

  try {
    const email = new PreparedEmail(emailSettings, user.settings?.pgpKey);
    await email.send({
      template: path.join(__dirname, '../../templates/email/appaccount'),
      message: { to: user.email },
      locals: {
        appName,
        appUrl,
        username,
        password,
        applicationTitle,
        applicationUrl,
        appAccountCreated: intl.formatMessage(emailMessages.appAccountCreated, {
          applicationTitle,
          appName,
        }),
        yourUsernameLabel: intl.formatMessage(emailMessages.yourUsername),
        openAppLabel: intl.formatMessage(emailMessages.openApp, {
          applicationTitle: appName,
        }),
        ...getEmailLogo(),
        recipientName: user.displayName,
        recipientEmail: user.email,
        ...getEmailLayoutLocals({
          intl,
          applicationTitle,
          applicationUrl,
          recipientName: user.displayName,
          recipientEmail: user.email,
          manageNotifications: false,
        }),
      },
    });

    return true;
  } catch (e) {
    logger.error('Failed to email an app account', {
      label: 'User Access',
      app: appName,
      userId: user.id,
      message: (e as Error).message,
    });

    return false;
  }
};
