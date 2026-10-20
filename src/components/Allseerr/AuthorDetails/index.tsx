import { TitleHero } from '@app/components/Allseerr/Title';
import Biography from '@app/components/Allseerr/Title/Biography';
import {
  BookCoverCard,
  coverGridClass,
} from '@app/components/Allseerr/Title/CoverCard';
import {
  chip,
  pillPrimary,
  pillSecondary,
} from '@app/components/Allseerr/Title/styles';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import AuthorCatalogRequestModal from '@app/components/RequestModal/AuthorCatalogRequestModal';
import { BulkRequestTransition } from '@app/components/RequestModal/BulkRequest';
import WatchlistButton from '@app/components/WatchlistButton';
import useSettings from '@app/hooks/useSettings';
import { useUser } from '@app/hooks/useUser';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { UserIcon } from '@heroicons/react/24/solid';
import { Permission } from '@server/lib/permissions';
import type { AuthorDetails as AuthorDetailsType } from '@server/models/Book';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Allseerr.AuthorDetails', {
  biography: 'Biography',
  biographyunavailable: 'No biography is available for this author.',
  lifespan: '{birthDate} to {deathDate}',
  born: 'Born {birthDate}',
  works: 'Works',
  noworks: 'No works are listed for this author.',
  truncatedworks:
    'Showing the {shown} most published of {total, number} works.',
  wikipedia: 'Wikipedia',
  openlibrary: 'OpenLibrary',
  readmore: 'Read more on Wikipedia',
  openinopenlibrary: 'Open in OpenLibrary',
  requestallbooks: 'Request All Books',
});

const AuthorDetails = () => {
  const intl = useIntl();
  const router = useRouter();
  const settings = useSettings();
  const { hasPermission } = useUser();
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const { data, error } = useSWR<AuthorDetailsType>(
    `/api/v1/author/${router.query.authorId}`
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={404} />;
  }

  const lifeSpan = data.birthDate
    ? data.deathDate
      ? intl.formatMessage(messages.lifespan, {
          birthDate: data.birthDate,
          deathDate: data.deathDate,
        })
      : intl.formatMessage(messages.born, { birthDate: data.birthDate })
    : undefined;

  const canRequest =
    settings.currentSettings.booksEnabled &&
    hasPermission([Permission.REQUEST, Permission.REQUEST_BOOK], {
      type: 'or',
    }) &&
    data.works.length > 0;

  return (
    <div className="relative -mx-4 -mt-20 pb-10 lg:-mt-28">
      <PageTitle title={data.name} />
      <BulkRequestTransition show={showCatalogModal}>
        <AuthorCatalogRequestModal
          authorId={data.olId}
          authorName={data.name}
          onCancel={() => setShowCatalogModal(false)}
          onComplete={() => setShowCatalogModal(false)}
        />
      </BulkRequestTransition>

      <TitleHero
        imageType="book"
        backdropPath={data.profilePath}
        blurBackdrop
        posterPath={data.profilePath}
        posterAlt={data.name}
        posterShape="round"
        posterFallback={<UserIcon />}
      >
        <h1
          className="font-display text-3xl font-bold leading-[1.05] tracking-[-1px] text-as-ink sm:text-4xl lg:text-5xl"
          data-testid="media-title"
        >
          {data.name}
        </h1>

        {lifeSpan && <div className="text-as-ink-muted">{lifeSpan}</div>}

        <Biography
          title={intl.formatMessage(messages.biography)}
          text={data.bio ?? intl.formatMessage(messages.biographyunavailable)}
        />

        <div className="flex flex-wrap items-center gap-2.5 max-sm:justify-center">
          {canRequest && (
            <Button
              className={pillPrimary}
              onClick={() => setShowCatalogModal(true)}
            >
              <ArrowDownTrayIcon />
              <span>{intl.formatMessage(messages.requestallbooks)}</span>
            </Button>
          )}
          <WatchlistButton
            mediaType="author"
            id={data.olId}
            title={data.name}
            onUserWatchlist={data.onUserWatchlist}
            ambient
          />
          {/* With the request button in the row the links move to a row of
              their own on phones, so each row stays on one line */}
          <div
            className={`flex items-center gap-2.5 max-sm:justify-center ${
              canRequest ? 'max-sm:basis-full' : ''
            }`}
          >
            {data.wikipedia && (
              <a
                href={data.wikipedia}
                target="_blank"
                rel="noreferrer"
                aria-label={intl.formatMessage(messages.readmore)}
                className={`inline-flex items-center justify-center border transition [&_svg]:h-4 [&_svg]:w-4 ${pillSecondary}`}
              >
                <ArrowTopRightOnSquareIcon />
                <span>{intl.formatMessage(messages.wikipedia)}</span>
              </a>
            )}
            <a
              href={`https://openlibrary.org/authors/${data.olId}`}
              target="_blank"
              rel="noreferrer"
              aria-label={intl.formatMessage(messages.openinopenlibrary)}
              className={`inline-flex items-center justify-center border transition [&_svg]:h-4 [&_svg]:w-4 ${pillSecondary}`}
            >
              <ArrowTopRightOnSquareIcon />
              <span>{intl.formatMessage(messages.openlibrary)}</span>
            </a>
          </div>
        </div>

        {data.links.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.links.map((link) => (
              <a
                key={`link-${link.url}`}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className={chip}
              >
                {link.title}
              </a>
            ))}
          </div>
        )}
      </TitleHero>

      <div className="flex flex-col gap-4 px-4 pt-[34px] lg:px-10">
        <h2 className="flex items-baseline gap-2.5 font-display text-[22px] font-medium text-as-ink">
          {intl.formatMessage(messages.works)}
          {data.totalWorks > 0 && (
            <span className="text-base text-as-ink-faint">
              {intl.formatNumber(data.totalWorks)}
            </span>
          )}
        </h2>
        {data.works.length === 0 ? (
          <p className="text-as-ink-muted">
            {intl.formatMessage(messages.noworks)}
          </p>
        ) : (
          <div className={coverGridClass}>
            {data.works.map((work) => (
              <BookCoverCard key={`work-${work.id}`} book={work} />
            ))}
          </div>
        )}
        {data.totalWorks > data.works.length && (
          <p className="text-sm text-as-ink-faint">
            {intl.formatMessage(messages.truncatedworks, {
              shown: data.works.length,
              total: data.totalWorks,
            })}
          </p>
        )}
      </div>
    </div>
  );
};

export default AuthorDetails;
