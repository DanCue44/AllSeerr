import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import { withProperties } from '@app/utils/typeHelpers';

type TBodyProps = {
  children: React.ReactNode;
};

const TBody = ({ children }: TBodyProps) => {
  const [interfaceStyle] = useInterfaceStyle();

  return (
    <tbody
      className={
        interfaceStyle === 'ambient'
          ? 'divide-y divide-as-line bg-as-surface'
          : 'divide-y divide-gray-700 bg-gray-800'
      }
    >
      {children}
    </tbody>
  );
};

const TH = ({
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<'th'>) => {
  const [interfaceStyle] = useInterfaceStyle();
  const style = [
    interfaceStyle === 'ambient'
      ? 'px-4 py-3 bg-as-raised text-left text-xs leading-4 font-semibold text-as-ink-faint uppercase tracking-wider truncate'
      : 'px-4 py-3 bg-gray-500 text-left text-xs leading-4 font-medium text-gray-200 uppercase tracking-wider truncate',
  ];

  if (className) {
    style.push(className);
  }

  return (
    <th className={style.join(' ')} {...props}>
      {children}
    </th>
  );
};

type TDProps = {
  alignText?: 'left' | 'center' | 'right';
  noPadding?: boolean;
};

const TD = ({
  children,
  alignText = 'left',
  noPadding,
  className,
  ...props
}: TDProps & React.ComponentPropsWithoutRef<'td'>) => {
  const style = ['text-sm leading-5 text-white'];

  switch (alignText) {
    case 'left':
      style.push('text-left');
      break;
    case 'center':
      style.push('text-center');
      break;
    case 'right':
      style.push('text-right');
      break;
  }

  if (!noPadding) {
    style.push('px-4 py-4');
  }

  if (className) {
    style.push(className);
  }

  return (
    <td className={style.join(' ')} {...props}>
      {children}
    </td>
  );
};

type TableProps = {
  children: React.ReactNode;
};

const Table = ({ children }: TableProps) => {
  const [interfaceStyle] = useInterfaceStyle();

  return (
    <div className="flex flex-col">
      <div className="-mx-4 my-2 overflow-x-auto md:mx-0 lg:mx-0">
        <div className="inline-block min-w-full py-2 align-middle">
          <div
            className={`overflow-hidden md:mx-0 lg:mx-0 ${
              interfaceStyle === 'ambient'
                ? 'ring-1 ring-as-line md:rounded-[22px]'
                : 'rounded-lg shadow'
            }`}
          >
            <table className="min-w-full">{children}</table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default withProperties(Table, { TH, TBody, TD });
