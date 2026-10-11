import TheMovieDb from '@server/api/themoviedb';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import { defineMessages, getIntl } from '@server/i18n';
import globalMessages from '@server/i18n/globalMessages';
import { getEmailLogo } from '@server/lib/branding';
import PreparedEmail from '@server/lib/email';
import type { NewsletterContent } from '@server/lib/newsletter';
import {
  getNewsletterSince,
  selectNewsletterMedia,
} from '@server/lib/newsletter';
import { Notification } from '@server/lib/notifications';
import EmailAgent from '@server/lib/notifications/agents/email';
import { NotificationAgentKey, getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import type { AvailableLocale } from '@server/types/languages';
import { truncate } from 'lodash';
import path from 'path';
import { MoreThan } from 'typeorm';
import validator from 'validator';

const messages = defineMessages('notifications.newsletter', {
  subject: 'Recently Added to {applicationTitle}',
  body: 'Here is what became available since the last newsletter:',
  movies: 'Movies',
  series: 'Series',
  optOut:
    'You can stop receiving this newsletter in your email notification settings.',
});

interface NewsletterItem {
  title: string;
  year?: string;
  overview: string;
  imageUrl?: string;
  actionUrl?: string;
}

class RecentlyAddedNewsletter {
  public running = false;

  public async run(): Promise<void> {
    const settings = getSettings();
    const { options } = settings.notifications.agents.email;

    if (!options.newsletterEnabled || !new EmailAgent().shouldSend()) {
      logger.info(
        'Skipping recently added newsletter, the newsletter or email agent is disabled',
        { label: 'Newsletter' }
      );
      return;
    }

    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const now = new Date();
      const content = await this.getContent(
        getNewsletterSince(settings.newsletter.lastSentAt, now),
        now
      );

      if (!content.movies.length && !content.series.length) {
        logger.info('No media was added since the last newsletter', {
          label: 'Newsletter',
        });
        return;
      }

      const userRepository = getRepository(User);
      const users = (await userRepository.find()).filter(
        (user) =>
          validator.isEmail(user.email, { require_tld: false }) &&
          (!user.settings ||
            (user.settings.hasNotificationType(
              NotificationAgentKey.EMAIL,
              Notification.NEWSLETTER
            ) ??
              true))
      );

      for (const user of users) {
        await this.sendToUser(user, content);
      }

      settings.newsletter = { lastSentAt: now.toISOString() };
      await settings.save();

      logger.info('Recently added newsletter sent', {
        label: 'Newsletter',
        recipients: users.length,
        movies: content.movies.length,
        series: content.series.length,
      });
    } catch (e) {
      logger.error('Failed to send recently added newsletter', {
        label: 'Newsletter',
        errorMessage: e.message,
      });
    } finally {
      this.running = false;
    }
  }

  /**
   * Sends the newsletter to the given user only. If nothing was added since
   * the last newsletter, the most recently added media is used instead.
   */
  public async sendTest(user: User): Promise<boolean> {
    const settings = getSettings();
    const now = new Date();

    let content = await this.getContent(
      getNewsletterSince(settings.newsletter.lastSentAt, now),
      now
    );

    if (!content.movies.length && !content.series.length) {
      content = await this.getContent(new Date(0), now);
    }

    if (!content.movies.length && !content.series.length) {
      return false;
    }

    return this.sendToUser(user, content);
  }

  private async getContent(
    since: Date,
    until: Date
  ): Promise<NewsletterContent<NewsletterItem>> {
    const settings = getSettings();
    const { applicationUrl } = settings.main;
    const { embedPoster, options } = settings.notifications.agents.email;
    const mediaRepository = getRepository(Media);
    const tmdb = new TheMovieDb();

    const media = await mediaRepository.find({
      where: { mediaAddedAt: MoreThan(since) },
      order: { mediaAddedAt: 'DESC' },
    });
    const selected = selectNewsletterMedia(media, {
      since,
      until,
      include4k: options.newsletterInclude4k,
    });

    const toItem = async (item: Media): Promise<NewsletterItem | undefined> => {
      try {
        const details =
          item.mediaType === MediaType.MOVIE
            ? await tmdb.getMovie({ movieId: item.tmdbId })
            : await tmdb.getTvShow({ tvId: item.tmdbId });
        const title = 'title' in details ? details.title : details.name;
        const date =
          'release_date' in details
            ? details.release_date
            : details.first_air_date;

        return {
          title,
          year: date ? date.slice(0, 4) : undefined,
          overview: truncate(details.overview, {
            length: 200,
            separator: /\s/,
            omission: '…',
          }),
          imageUrl:
            embedPoster && details.poster_path
              ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${details.poster_path}`
              : undefined,
          actionUrl: applicationUrl
            ? `${applicationUrl}/${item.mediaType}/${item.tmdbId}`
            : undefined,
        };
      } catch (e) {
        logger.warn('Failed to fetch details for newsletter media', {
          label: 'Newsletter',
          tmdbId: item.tmdbId,
          mediaType: item.mediaType,
          errorMessage: e.message,
        });
        return undefined;
      }
    };

    const isItem = (item: NewsletterItem | undefined): item is NewsletterItem =>
      !!item;

    return {
      movies: (await Promise.all(selected.movies.map(toItem))).filter(isItem),
      series: (await Promise.all(selected.series.map(toItem))).filter(isItem),
    };
  }

  private async sendToUser(
    user: User,
    content: NewsletterContent<NewsletterItem>
  ): Promise<boolean> {
    const settings = getSettings();
    const { applicationUrl, applicationTitle } = settings.main;
    const emailSettings = settings.notifications.agents.email;
    const intl = getIntl(user.settings?.locale as AvailableLocale);
    const { logoUrl, logoIconUrl } = getEmailLogo();

    if (!validator.isEmail(user.email, { require_tld: false })) {
      logger.warn('Invalid email address provided for user', {
        label: 'Newsletter',
        recipient: user.displayName,
      });
      return false;
    }

    logger.debug('Sending recently added newsletter', {
      label: 'Newsletter',
      recipient: user.displayName,
    });

    try {
      const email = new PreparedEmail(emailSettings, user.settings?.pgpKey);

      await email.send({
        template: path.join(__dirname, '../templates/email/newsletter'),
        message: {
          to: user.email,
        },
        locals: {
          subject: intl.formatMessage(messages.subject, { applicationTitle }),
          body: intl.formatMessage(messages.body),
          moviesTitle: intl.formatMessage(messages.movies),
          seriesTitle: intl.formatMessage(messages.series),
          optOut: intl.formatMessage(messages.optOut),
          openIn: intl.formatMessage(globalMessages.openIn, {
            applicationTitle,
          }),
          movies: content.movies,
          series: content.series,
          settingsUrl: applicationUrl
            ? `${applicationUrl}/profile/settings/notifications/email`
            : undefined,
          applicationUrl,
          applicationTitle,
          logoUrl,
          logoIconUrl,
          recipientName: user.displayName,
          recipientEmail: user.email,
        },
      });

      return true;
    } catch (e) {
      logger.error('Error sending recently added newsletter', {
        label: 'Newsletter',
        recipient: user.displayName,
        errorMessage: e.message,
      });

      return false;
    }
  }
}

const recentlyAddedNewsletter = new RecentlyAddedNewsletter();

export default recentlyAddedNewsletter;
