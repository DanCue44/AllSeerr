import Button from '@app/components/Common/Button';
import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Transition,
} from '@headlessui/react';
import { EllipsisVerticalIcon } from '@heroicons/react/24/solid';
import { Field, Form, Formik } from 'formik';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import ReactMarkdown from 'react-markdown';

const messages = defineMessages('components.IssueDetails.IssueDescription', {
  description: 'Description',
  edit: 'Edit Description',
  deleteissue: 'Delete Issue',
});

interface IssueDescriptionProps {
  description: string;
  belongsToUser: boolean;
  commentCount: number;
  onEdit: (newDescription: string) => void;
  onDelete: () => void;
}

const IssueDescription = ({
  description,
  belongsToUser,
  commentCount,
  onEdit,
  onDelete,
}: IssueDescriptionProps) => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const [interfaceStyle] = useInterfaceStyle();
  const ambient = interfaceStyle === 'ambient';
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div
      className={
        ambient
          ? 'relative rounded-[22px] bg-as-surface px-6 py-[22px]'
          : 'relative'
      }
    >
      <div className="flex items-center justify-between">
        <div
          className={
            ambient
              ? 'font-display text-lg font-medium text-as-ink lg:text-xl'
              : 'font-semibold text-gray-100 lg:text-xl'
          }
        >
          {intl.formatMessage(messages.description)}
        </div>
        {(hasPermission(Permission.MANAGE_ISSUES) || belongsToUser) && (
          <Menu as="div" className="relative inline-block text-left">
            {({ open }) => (
              <>
                <div>
                  <MenuButton className="flex items-center rounded-full text-gray-400 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-100">
                    <span className="sr-only">Open options</span>
                    <EllipsisVerticalIcon
                      className="h-5 w-5"
                      aria-hidden="true"
                    />
                  </MenuButton>
                </div>

                <Transition
                  show={open}
                  as="div"
                  enter="transition ease-out duration-100"
                  enterFrom="opacity-0 scale-95"
                  enterTo="opacity-100 scale-100"
                  leave="transition ease-in duration-75"
                  leaveFrom="opacity-100 scale-100"
                  leaveTo="opacity-0 scale-95"
                >
                  <MenuItems
                    static
                    className={`absolute right-0 mt-2 w-56 origin-top-right shadow-lg focus:outline-none ${
                      ambient
                        ? 'overflow-hidden rounded-2xl bg-as-raised ring-1 ring-as-line-strong'
                        : 'rounded-md bg-gray-700 ring-1 ring-black ring-opacity-5'
                    }`}
                  >
                    <div className="py-1">
                      {belongsToUser && (
                        <MenuItem>
                          {({ active }) => (
                            <button
                              onClick={() => setIsEditing(true)}
                              className={`block w-full px-4 py-2 text-left text-sm ${
                                active
                                  ? 'bg-gray-600 text-white'
                                  : 'text-gray-100'
                              }`}
                            >
                              {intl.formatMessage(messages.edit)}
                            </button>
                          )}
                        </MenuItem>
                      )}
                      {(hasPermission(Permission.MANAGE_ISSUES) ||
                        !commentCount) && (
                        <MenuItem>
                          {({ active }) => (
                            <button
                              onClick={() => onDelete()}
                              className={`block w-full px-4 py-2 text-left text-sm ${
                                active
                                  ? 'bg-gray-600 text-white'
                                  : 'text-gray-100'
                              }`}
                            >
                              {intl.formatMessage(messages.deleteissue)}
                            </button>
                          )}
                        </MenuItem>
                      )}
                    </div>
                  </MenuItems>
                </Transition>
              </>
            )}
          </Menu>
        )}
      </div>
      {isEditing ? (
        <Formik
          initialValues={{ newMessage: description }}
          onSubmit={(values) => {
            onEdit(values.newMessage);
            setIsEditing(false);
          }}
        >
          {() => {
            return (
              <Form className="mt-4">
                <Field
                  id="newMessage"
                  name="newMessage"
                  as="textarea"
                  className="h-40"
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    buttonType="default"
                    className="mr-2"
                    type="button"
                    onClick={() => setIsEditing(false)}
                  >
                    <span>{intl.formatMessage(globalMessages.cancel)}</span>
                  </Button>
                  <Button buttonType="primary">
                    <span>{intl.formatMessage(globalMessages.save)}</span>
                  </Button>
                </div>
              </Form>
            );
          }}
        </Formik>
      ) : (
        <div className="prose mt-4 [overflow-wrap:anywhere]">
          <ReactMarkdown
            allowedElements={['p', 'em', 'strong', 'ul', 'ol', 'li']}
            skipHtml
          >
            {description}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
};

export default IssueDescription;
