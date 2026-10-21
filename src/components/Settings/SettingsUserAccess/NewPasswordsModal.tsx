import Alert from '@app/components/Common/Alert';
import Modal from '@app/components/Common/Modal';
import CopyButton from '@app/components/Settings/CopyButton';
import { APP_NAMES } from '@app/components/Settings/SettingsUserAccess/common';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import type { UserAccessApp } from '@server/constants/userAccess';
import type { NewPasswords } from '@server/interfaces/api/userAccessInterfaces';
import { useIntl } from 'react-intl';

const messages = defineMessages(
  'components.Settings.SettingsUserAccess.NewPasswordsModal',
  {
    title: 'New accounts for {name}',
    onlyNow:
      'These passwords are shown only now. Allseerr does not keep them. Send them to {name} or note them somewhere safe.',
    emailed: 'Also emailed to {name}.',
    username: 'Username',
    password: 'Password',
    done: 'Done',
  }
);

interface NewPasswordsModalProps {
  name: string;
  passwords: NewPasswords;
  onClose: () => void;
}

/**
 * Shows the passwords of accounts Allseerr just made, once
 */
const NewPasswordsModal = ({
  name,
  passwords,
  onClose,
}: NewPasswordsModalProps) => {
  const intl = useIntl();
  const entries = Object.entries(passwords) as [
    UserAccessApp,
    NonNullable<NewPasswords[UserAccessApp]>,
  ][];

  return (
    <Transition
      as="div"
      appear
      show
      enter="transition-opacity ease-in-out duration-300"
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leave="transition-opacity ease-in-out duration-300"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
    >
      <Modal
        title={intl.formatMessage(messages.title, { name })}
        onOk={onClose}
        okText={intl.formatMessage(messages.done)}
        backgroundClickable={false}
      >
        <Alert
          title={intl.formatMessage(messages.onlyNow, { name })}
          type="warning"
        />
        <ul className="mt-4 space-y-4">
          {entries.map(([app, { username, password, emailed }]) => (
            <li key={app} className="rounded-xl p-4 ring-1 ring-as-line">
              <div className="mb-2 font-semibold">{APP_NAMES[app]}</div>
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 text-sm">
                <span className="text-as-ink-muted">
                  {intl.formatMessage(messages.username)}
                </span>
                <code className="truncate">{username}</code>
                <CopyButton textToCopy={username} />
                <span className="text-as-ink-muted">
                  {intl.formatMessage(messages.password)}
                </span>
                <code className="truncate">{password}</code>
                <CopyButton textToCopy={password} />
              </div>
              {emailed && (
                <p className="mt-2 text-xs text-as-ink-faint">
                  {intl.formatMessage(messages.emailed, { name })}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Modal>
    </Transition>
  );
};

export default NewPasswordsModal;
