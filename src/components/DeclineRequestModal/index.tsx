import Modal from '@app/components/Common/Modal';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.DeclineRequestModal', {
  declinerequest: 'Decline Request',
  declinerequests: 'Decline {count} Requests',
  declining: 'Declining…',
  reason: 'Reason',
  reasonTip: 'Optional. Shown to the requester and included in notifications.',
  reasonPlaceholder: 'Already streaming on a service we have',
});

interface DeclineRequestModalProps {
  show: boolean;
  title?: string;
  count?: number;
  isUpdating?: boolean;
  onDecline: (reason: string) => void;
  onCancel: () => void;
}

const DeclineRequestModal = ({
  show,
  title,
  count = 1,
  isUpdating = false,
  onDecline,
  onCancel,
}: DeclineRequestModalProps) => {
  const intl = useIntl();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (show) {
      setReason('');
    }
  }, [show]);

  return (
    <Transition
      as="div"
      enter="transition-opacity duration-300"
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leave="transition-opacity duration-300"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
      show={show}
    >
      <Modal
        backgroundClickable
        title={
          count > 1
            ? intl.formatMessage(messages.declinerequests, { count })
            : intl.formatMessage(messages.declinerequest)
        }
        subTitle={title}
        onCancel={onCancel}
        onOk={() => onDecline(reason.trim())}
        okText={
          isUpdating
            ? intl.formatMessage(messages.declining)
            : intl.formatMessage(globalMessages.decline)
        }
        okButtonType="danger"
        okDisabled={isUpdating}
      >
        <label htmlFor="declineReason" className="text-label">
          {intl.formatMessage(messages.reason)}
          <span className="label-tip">
            {intl.formatMessage(messages.reasonTip)}
          </span>
        </label>
        <div className="form-input-field mt-2">
          <textarea
            id="declineReason"
            name="declineReason"
            rows={3}
            maxLength={500}
            value={reason}
            placeholder={intl.formatMessage(messages.reasonPlaceholder)}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </Modal>
    </Transition>
  );
};

export default DeclineRequestModal;
