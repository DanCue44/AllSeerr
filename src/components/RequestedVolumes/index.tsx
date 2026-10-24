import defineMessages from '@app/utils/defineMessages';
import { formatVolumeRanges } from '@server/lib/comicVolumes';
import { useIntl } from 'react-intl';

export const messages = defineMessages('components.RequestedVolumes', {
  volumes: 'Volumes',
  volumelist: 'Vol. {volumes}',
});

/**
 * The volumes a comic request asks for, such as "Vol. 1-3, 7". Nothing for
 * a request of the whole series.
 */
const RequestedVolumes = ({
  volumes,
  className,
}: {
  volumes?: number[] | null;
  className?: string;
}) => {
  const intl = useIntl();

  if (!volumes?.length) {
    return null;
  }

  return (
    <span className={className}>
      {intl.formatMessage(messages.volumelist, {
        volumes: formatVolumeRanges(volumes),
      })}
    </span>
  );
};

export default RequestedVolumes;
