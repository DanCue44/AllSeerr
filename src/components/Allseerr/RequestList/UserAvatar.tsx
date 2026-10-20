import CachedImage from '@app/components/Common/CachedImage';
import { useState } from 'react';

// Background colors for the initials fallback, picked by user id
const fallbackColors = [
  'bg-[#5b3a6e]',
  'bg-[#2f5a6b]',
  'bg-[#6b4a2f]',
  'bg-[#2f6b4f]',
  'bg-[#6b2f3e]',
  'bg-[#3e4a7a]',
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

interface UserAvatarProps {
  id: number;
  name: string;
  avatar?: string;
  size: number;
  className?: string;
}

/**
 * Round user picture, falling back to initials on a colored circle when
 * there is no picture or it fails to load.
 */
const UserAvatar = ({ id, name, avatar, size, className }: UserAvatarProps) => {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={`relative inline-flex flex-none items-center justify-center overflow-hidden rounded-full font-bold text-as-ink ${
        fallbackColors[Math.abs(id) % fallbackColors.length]
      } ${className ?? ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {avatar && !failed ? (
        <CachedImage
          type="avatar"
          src={avatar}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
};

export default UserAvatar;
