// Shared class lists for the Ambient title pages, taken from the design.

export const pillPrimary =
  'h-[50px] gap-2.5 rounded-full border-transparent bg-as-accent px-6 text-[15px] font-bold text-as-ground hover:border-transparent hover:bg-as-accent hover:brightness-110 active:bg-as-accent';

export const pillSecondary =
  'h-[50px] gap-2 rounded-full border-as-line-strong bg-as-raised px-5 text-[15px] font-semibold text-as-ink hover:border-as-line-strong hover:bg-as-line active:bg-as-line';

// Secondary pill that drops to an icon button on phones, so the action row
// stays on one line. Pair the label with max-sm:sr-only. The icon margin is
// dropped too, or the hidden label leaves the icon off center.
export const pillSecondaryCollapse = `${pillSecondary} max-sm:w-[50px] max-sm:!px-0 max-sm:[&_svg]:!m-0`;

// Primary pill that drops to an icon button on phones, for crowded rows
export const pillPrimaryCollapse = `${pillPrimary} max-sm:w-[50px] max-sm:justify-center max-sm:!px-0 max-sm:[&_svg]:!m-0`;

export const pillIcon =
  'h-[50px] w-[50px] rounded-full border-as-line-strong bg-as-raised !px-0 text-as-ink hover:border-as-line-strong hover:bg-as-line active:bg-as-line';

export const pillIconWarn =
  'h-[50px] w-[50px] rounded-full border-as-line-strong bg-[#3b2a25] !px-0 text-as-accent-soft hover:border-as-line-strong hover:bg-[#4a3530] active:bg-[#4a3530]';

export const chip =
  'rounded-full border border-as-line-strong px-3 py-1.5 text-[13px] text-as-ink-soft transition hover:border-as-ink-faint hover:text-as-ink';

export const softChip =
  'rounded-full border border-as-line bg-as-tile px-3 py-[7px] text-[13px] text-as-ink-soft transition hover:border-as-line-strong hover:text-as-ink';

export const statusTone = {
  ok: 'bg-[#1d3b33] text-[#a8e6c4]',
  info: 'bg-[#1e3247] text-[#aac8f0]',
  warn: 'bg-[#3b3424] text-[#f0d9a8]',
  bad: 'bg-[#3b2427] text-[#f2b0aa]',
  accent: 'bg-as-accent text-as-ground',
  neutral: 'bg-as-raised text-as-ink-soft',
};
