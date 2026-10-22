import Button from '@app/components/Common/Button';
import Modal from '@app/components/Common/Modal';
import type { ReadingKind } from '@app/components/ReadingApps/common';
import {
  NewPasswordBox,
  dismiss,
  isDismissed,
} from '@app/components/ReadingApps/common';
import useSettings from '@app/hooks/useSettings';
import { useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import type {
  ReadingAppSetupResult,
  ReadingAppStatus,
  ReadingAppsResponse,
} from '@server/interfaces/api/userAccessInterfaces';
import axios from 'axios';
import { useRouter } from 'next/router';
import { createContext, useCallback, useContext, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.ReadingApps.ReadingAppPrompt', {
  title: 'Set up {app}?',
  askedaudiobook:
    "You asked for an audiobook. You can't listen in {app} yet. Set it up now?",
  askedebook:
    "You asked for an ebook. You can't read it in {app} yet. Set it up now?",
  askedcomic:
    'You asked for a comic. Your access to read comics in {app} has not been set up yet. Would you like to set it up now?',
  notGranted:
    'An admin needs to give you access first. You can ask for it in your settings.',
  setUpNow: 'Set up now',
  notNow: 'Not now',
  readyTitle: '{app} is ready',
  ready: 'Your {app} account is ready.',
  open: 'Open {app}',
  done: 'Done',
  setupError:
    'Something went wrong while setting up {app}. You can try again in your settings.',
  openSettings: 'Open settings',
});

interface Prompt {
  kind: ReadingKind;
  status: ReadingAppStatus;
}

interface ReadingAppPromptContextValue {
  prompt: (kinds: ReadingKind | ReadingKind[]) => void;
}

const ReadingAppPromptContext = createContext<ReadingAppPromptContextValue>({
  prompt: () => undefined,
});

/**
 * Asks a person who just requested a book to set up the app it is read or
 * heard in, when their account there is not ready. Mounted once for the
 * whole app, so the prompt outlives the request modal that started it.
 */
export const ReadingAppPromptProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const intl = useIntl();
  const router = useRouter();
  const settings = useSettings();
  const { user } = useUser();
  const [current, setCurrent] = useState<Prompt | null>(null);
  const [result, setResult] = useState<ReadingAppSetupResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const prompt = useCallback(
    async (kinds: ReadingKind | ReadingKind[]) => {
      if (!user || !settings.currentSettings.readingAppsEnabled) {
        return;
      }

      try {
        const { data } = await axios.get<ReadingAppsResponse>(
          `/api/v1/user/${user.id}/settings/apps`
        );

        for (const kind of Array.isArray(kinds) ? kinds : [kinds]) {
          const status = data.apps.find(
            (app) => app.app === data.readingApps[kind]
          );

          // Someone who already asked for access has nothing to do now
          if (
            status &&
            status.state !== 'ready' &&
            status.state !== 'requested' &&
            !isDismissed(status.app, user.id)
          ) {
            setResult(null);
            setFailed(false);
            setCurrent({ kind, status });
            return;
          }
        }
      } catch {
        // The prompt is only a help, a request that worked stays done
      }
    },
    [user, settings.currentSettings.readingAppsEnabled]
  );

  const close = () => {
    setCurrent(null);
    setResult(null);
    setFailed(false);
  };

  const notNow = () => {
    if (current && user) {
      dismiss(current.status.app, user.id);
    }
    close();
  };

  const openSettings = () => {
    if (current) {
      router.push(`/profile/settings/apps?app=${current.status.app}`);
    }
    close();
  };

  const setUpNow = async () => {
    if (!current || !user) {
      return;
    }

    // Only an app the person was given can be set up right here
    if (current.status.state !== 'available') {
      openSettings();
      return;
    }

    setIsUpdating(true);
    try {
      const { data } = await axios.post<ReadingAppSetupResult>(
        `/api/v1/user/${user.id}/settings/apps/${current.status.app}/setup`
      );

      if (data.app.state === 'ready') {
        setResult(data);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setIsUpdating(false);
    }
  };

  const app = current?.status.name ?? '';

  return (
    <ReadingAppPromptContext.Provider value={{ prompt }}>
      {children}
      <Transition
        as="div"
        show={!!current}
        enter="transition-opacity duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-300"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        {current && result ? (
          <Modal
            title={intl.formatMessage(messages.readyTitle, { app })}
            onOk={close}
            okText={intl.formatMessage(messages.done)}
            backgroundClickable={false}
          >
            <p>{intl.formatMessage(messages.ready, { app })}</p>
            {result.password && <NewPasswordBox password={result.password} />}
            {result.app.publicUrl && (
              <Button
                as="a"
                className="mt-4"
                href={result.app.publicUrl}
                target="_blank"
                rel="noreferrer"
                buttonType="primary"
              >
                <ArrowTopRightOnSquareIcon />
                <span>{intl.formatMessage(messages.open, { app })}</span>
              </Button>
            )}
          </Modal>
        ) : current && failed ? (
          <Modal
            title={intl.formatMessage(messages.title, { app })}
            onOk={openSettings}
            okText={intl.formatMessage(messages.openSettings)}
            onCancel={close}
            cancelText={intl.formatMessage(messages.notNow)}
          >
            <p>{intl.formatMessage(messages.setupError, { app })}</p>
          </Modal>
        ) : current ? (
          <Modal
            title={intl.formatMessage(messages.title, { app })}
            onOk={setUpNow}
            okText={intl.formatMessage(messages.setUpNow)}
            okDisabled={isUpdating}
            loading={isUpdating}
            onCancel={notNow}
            cancelText={intl.formatMessage(messages.notNow)}
          >
            <p data-testid="reading-app-prompt">
              {intl.formatMessage(messages[`asked${current.kind}`], { app })}
            </p>
            {current.status.state === 'notGranted' && (
              <p className="mt-2 text-sm text-as-ink-muted">
                {intl.formatMessage(messages.notGranted)}
              </p>
            )}
          </Modal>
        ) : null}
      </Transition>
    </ReadingAppPromptContext.Provider>
  );
};

/**
 * Returns a function that, after a successful request, asks the person to
 * set up the app the kind is read or heard in when they cannot use it yet.
 * Comic requests call it with 'comic'. Pass several kinds for a request of
 * both book formats; the first one not ready is asked about.
 */
export const useReadingAppPrompt = (kind?: ReadingKind | ReadingKind[]) => {
  const { prompt } = useContext(ReadingAppPromptContext);

  return useCallback(
    (override?: ReadingKind | ReadingKind[]) => {
      const kinds = override ?? kind;

      if (kinds) {
        prompt(kinds);
      }
    },
    [prompt, kind]
  );
};
