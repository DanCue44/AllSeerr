import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import AuthorCatalogRequestModal from '@app/components/RequestModal/AuthorCatalogRequestModal';
import { BulkRequestTransition } from '@app/components/RequestModal/BulkRequest';
import BookTitleCard from '@app/components/TitleCard/BookTitleCard';
import WatchlistButton from '@app/components/WatchlistButton';
import useSettings from '@app/hooks/useSettings';
import { useUser } from '@app/hooks/useUser';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { UserIcon } from '@heroicons/react/24/solid';
import { Permission } from '@server/lib/permissions';
import type { AuthorDetails as AuthorDetailsType } from '@server/models/Book';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.AuthorDetails', {
  biography: 'Biography',
  biographyunavailable: 'No biography is available for this author.',
  lifespan: '{birthDate} to {deathDate}',
  born: 'Born {birthDate}',
  works: 'Works',
  noworks: 'No works are listed for this author.',
  truncatedworks:
    'Showing the {shown} most published of {total, number} works.',
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
    <>
      <PageTitle title={data.name} />
      <BulkRequestTransition show={showCatalogModal}>
        <AuthorCatalogRequestModal
          authorId={data.olId}
          authorName={data.name}
          onCancel={() => setShowCatalogModal(false)}
          onComplete={() => setShowCatalogModal(false)}
        />
      </BulkRequestTransition>
      <div className="relative z-10 mb-8 mt-4 flex flex-col items-center lg:flex-row lg:items-start">
        <div className="relative mb-6 mr-0 h-36 w-36 flex-shrink-0 overflow-hidden rounded-full bg-gray-800 ring-1 ring-gray-700 lg:mb-0 lg:mr-6 lg:h-44 lg:w-44">
          {data.profilePath ? (
            <CachedImage
              type="book"
              src={data.profilePath}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              fill
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-600">
              <UserIcon className="h-1/2 w-1/2" />
            </div>
          )}
        </div>
        <div className="text-center text-gray-300 lg:text-left">
          <h1 className="text-3xl text-white lg:text-4xl">{data.name}</h1>
          {lifeSpan && (
            <div className="mb-2 mt-1 text-xs sm:text-sm lg:text-base">
              {lifeSpan}
            </div>
          )}
          <div className="mt-4">
            <h2 className="mb-2 text-lg font-bold text-white">
              {intl.formatMessage(messages.biography)}
            </h2>
            <p className="whitespace-pre-line text-sm sm:text-base">
              {data.bio ?? intl.formatMessage(messages.biographyunavailable)}
            </p>
            <div className="mt-2 space-x-4 text-sm">
              {data.wikipedia && (
                <a
                  href={data.wikipedia}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gray-400 transition duration-300 hover:text-gray-100"
                >
                  {intl.formatMessage(messages.readmore)}
                </a>
              )}
              {data.links.map((link) => (
                <a
                  key={`link-${link.url}`}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gray-400 transition duration-300 hover:text-gray-100"
                >
                  {link.title}
                </a>
              ))}
              <a
                href={`https://openlibrary.org/authors/${data.olId}`}
                target="_blank"
                rel="noreferrer"
                className="text-gray-400 transition duration-300 hover:text-gray-100"
              >
                {intl.formatMessage(messages.openinopenlibrary)}
              </a>
            </div>
            <div className="mt-4 flex items-center justify-center lg:justify-start">
              {canRequest && (
                <Button
                  buttonType="primary"
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
              />
            </div>
          </div>
        </div>
      </div>
      <div className="relative z-10">
        <div className="slider-header">
          <Header>{intl.formatMessage(messages.works)}</Header>
        </div>
        {data.works.length === 0 ? (
          <p className="text-gray-400">
            {intl.formatMessage(messages.noworks)}
          </p>
        ) : (
          <ul className="cards-vertical">
            {data.works.map((work) => (
              <li key={`work-${work.id}`}>
                <BookTitleCard
                  id={work.id}
                  mediaType="book"
                  title={work.title}
                  subtitle={work.authorName}
                  year={work.firstPublishYear}
                  image={work.posterPath}
                  status={work.mediaInfo?.status}
                  statusAudio={work.mediaInfo?.statusAudio}
                  canExpand
                />
              </li>
            ))}
          </ul>
        )}
        {data.totalWorks > data.works.length && (
          <p className="mt-4 text-sm text-gray-400">
            {intl.formatMessage(messages.truncatedworks, {
              shown: data.works.length,
              total: data.totalWorks,
            })}
          </p>
        )}
      </div>
      <div className="extra-bottom-space relative" />
    </>
  );
};

export default AuthorDetails;
