import {
  DEFAULT_ACCENT_COLOR,
  deriveAccentShades,
  normalizeHexColor,
} from '@server/utils/accentColor';
import { useEffect, useState } from 'react';

interface AccentColorPickerProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * A color well with a hex field beside it, and swatches of the shades the
 * interface derives from the color.
 */
const AccentColorPicker = ({ id, value, onChange }: AccentColorPickerProps) => {
  const [text, setText] = useState(value);

  // Follow outside changes, such as a reset
  useEffect(() => {
    setText(value);
  }, [value]);

  const color = normalizeHexColor(value) ?? DEFAULT_ACCENT_COLOR;
  const shades = deriveAccentShades(color);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="color"
        aria-labelledby={`${id}-label`}
        className="h-10 w-14 flex-shrink-0 cursor-pointer rounded-md border border-gray-500 bg-transparent p-1"
        value={color.toLowerCase()}
        onChange={(e) => onChange(normalizeHexColor(e.target.value) ?? color)}
      />
      <div className="form-input-field w-32">
        <input
          id={id}
          type="text"
          value={text}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            const normalized = normalizeHexColor(e.target.value);
            if (normalized && e.target.value.replace('#', '').length === 6) {
              onChange(normalized);
            }
          }}
          onBlur={() => setText(color)}
        />
      </div>
      {shades && (
        <div className="flex overflow-hidden rounded-md" aria-hidden="true">
          {[shades.soft, shades.accent, shades.strong, shades.deep].map(
            (shade, i) => (
              <span
                key={i}
                className="h-8 w-8"
                style={{ backgroundColor: `rgb(${shade.join(' ')})` }}
              />
            )
          )}
        </div>
      )}
    </div>
  );
};

export default AccentColorPicker;
