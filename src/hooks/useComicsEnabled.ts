import useSettings from '@app/hooks/useSettings';
import type { ComicsStatus } from '@server/lib/comics';
import useSWR from 'swr';

/**
 * Whether comics and manga can be requested: book requests go to Talearr
 * and its comics library answers. Asked only while Talearr is the book
 * service, and kept for a few minutes. Undefined while Talearr is asked.
 */
const useComicsEnabled = (): boolean | undefined => {
  const settings = useSettings();
  const isTalearr = settings.currentSettings.bookService === 'talearr';
  const { data } = useSWR<ComicsStatus>(
    isTalearr ? '/api/v1/comic/status' : null,
    { dedupingInterval: 5 * 60_000, revalidateOnFocus: false }
  );

  if (!isTalearr) {
    return false;
  }

  return data ? data.enabled : undefined;
};

export default useComicsEnabled;
