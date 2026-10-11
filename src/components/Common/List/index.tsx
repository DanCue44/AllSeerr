import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import { withProperties } from '@app/utils/typeHelpers';

interface ListItemProps {
  title: string;
  className?: string;
  children: React.ReactNode;
}

const ListItem = ({ title, className, children }: ListItemProps) => {
  const [interfaceStyle] = useInterfaceStyle();

  return (
    <div>
      <div className="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
        <dt
          className={
            interfaceStyle === 'ambient'
              ? 'block text-sm font-semibold text-as-ink-faint'
              : 'block text-sm font-bold text-gray-400'
          }
        >
          {title}
        </dt>
        <dd className="flex text-sm text-white sm:col-span-2 sm:mt-0">
          <span className={`flex-grow ${className}`}>{children}</span>
        </dd>
      </div>
    </div>
  );
};

interface ListProps {
  title: string;
  subTitle?: string;
  children: React.ReactNode;
}

const List = ({ title, subTitle, children }: ListProps) => {
  const [interfaceStyle] = useInterfaceStyle();

  if (interfaceStyle === 'ambient') {
    return (
      <>
        <div>
          <h3 className="heading">{title}</h3>
          {subTitle && <p className="description">{subTitle}</p>}
        </div>
        <div className="section rounded-[22px] bg-as-surface px-6 py-1.5">
          <dl className="divide-y divide-as-line">{children}</dl>
        </div>
      </>
    );
  }

  return (
    <>
      <div>
        <h3 className="heading">{title}</h3>
        {subTitle && <p className="description">{subTitle}</p>}
      </div>
      <div className="section border-t border-gray-800">
        <dl className="divide-y divide-gray-800">{children}</dl>
      </div>
    </>
  );
};

export default withProperties(List, { Item: ListItem });
