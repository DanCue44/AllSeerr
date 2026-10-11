import useInterfaceStyle from '@app/hooks/useInterfaceStyle';
import {
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/solid';

interface AlertProps {
  title?: React.ReactNode;
  type?: 'warning' | 'info' | 'error';
  children?: React.ReactNode;
}

const Alert = ({ title, children, type }: AlertProps) => {
  const [interfaceStyle] = useInterfaceStyle();
  let design = {
    bgColor: 'border border-yellow-500 backdrop-blur bg-yellow-400/20',
    titleColor: 'text-yellow-100',
    textColor: 'text-yellow-300',
    svg: <ExclamationTriangleIcon className="h-5 w-5" />,
  };

  switch (type) {
    case 'info':
      design = {
        bgColor: 'border border-indigo-500 backdrop-blur bg-indigo-400/20',
        titleColor: 'text-gray-100',
        textColor: 'text-gray-300',
        svg: <InformationCircleIcon className="h-5 w-5" />,
      };
      break;
    case 'error':
      design = {
        bgColor: 'bg-red-600',
        titleColor: 'text-red-100',
        textColor: 'text-red-300',
        svg: <XCircleIcon className="h-5 w-5" />,
      };
      break;
  }

  // Ambient keeps the meaning of each type with the design's soft tones
  if (interfaceStyle === 'ambient') {
    design = {
      ...design,
      ...(type === 'info'
        ? {
            bgColor: 'bg-as-info-bg',
            titleColor: 'text-as-ink',
            textColor: 'text-as-info',
          }
        : type === 'error'
          ? {
              bgColor: 'bg-as-bad-bg',
              titleColor: 'text-as-bad',
              textColor: 'text-as-bad',
            }
          : {
              bgColor: 'bg-[#3b3424]',
              titleColor: 'text-[#f0d9a8]',
              textColor: 'text-[#f0d9a8]/80',
            }),
    };
  }

  return (
    <div
      className={`mb-4 ${
        interfaceStyle === 'ambient'
          ? 'rounded-[18px] px-5 py-4'
          : 'rounded-md p-4'
      } ${design.bgColor}`}
    >
      <div className="flex">
        <div className={`flex-shrink-0 ${design.titleColor}`}>{design.svg}</div>
        <div className="ml-3">
          {title && (
            <div className={`text-sm font-medium ${design.titleColor}`}>
              {title}
            </div>
          )}
          {children && (
            <div className={`mt-2 text-sm first:mt-0 ${design.textColor}`}>
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Alert;
