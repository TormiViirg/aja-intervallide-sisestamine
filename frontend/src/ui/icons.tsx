/** Line icons drawn to match the design's 2-unit stroke weight. */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Svg({ title, children, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} {...rest}>
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" strokeWidth={2.2} />
    <path d="M12 6v6.5l4 2.5" strokeLinecap="round" strokeWidth={2.2} />
  </Svg>
);

export const LockIcon = ({ open, ...p }: IconProps & { open: boolean }) => (
  <Svg {...p}>
    <rect x="4.5" y="10.5" width="15" height="11" fill="currentColor" stroke="none" />
    {open ? <path d="M8 10.5V7a4 4 0 0 1 7.6-1.7" strokeWidth={2.4} /> : <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" strokeWidth={2.4} />}
    <rect x="11" y="13.5" width="2" height="4.5" fill="var(--paper)" stroke="none" />
  </Svg>
);

export const ChevronIcon = ({ up, ...p }: IconProps & { up?: boolean }) => (
  <Svg {...p}>
    <path d={up ? 'M3 17 12 7l9 10' : 'M3 7l9 10 9-10'} strokeWidth={2} strokeLinejoin="miter" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5l14 14M19 5 5 19" strokeWidth={2} />
  </Svg>
);

/** Bold U-turn arrow, as on 27.10 and 13.11 in the design. */
export const UTurnIcon = (p: IconProps) => (
  <Svg {...p} stroke="none" fill="currentColor">
    <path d="M9 3 2 9.5 9 16v-4.2h7.5v5.7H5V22h16V7.3H9z" />
  </Svg>
);

export const EyeIcon = ({ closed, ...p }: IconProps & { closed?: boolean }) => (
  <Svg {...p}>
    <path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12Z" />
    <circle cx="12" cy="12" r="3.2" />
    {closed ? <path d="M3 21 21 3" /> : null}
  </Svg>
);

export const ArrowIcon = ({ left, ...p }: IconProps & { left?: boolean }) => (
  <Svg {...p}>
    <path d={left ? 'M22 12H3m8-8-8 8 8 8' : 'M2 12h19m-8-8 8 8-8 8'} strokeWidth={2.2} />
  </Svg>
);

export const FloppyIcon = (p: IconProps) => (
  <Svg {...p} strokeWidth={1.6}>
    <path d="M3 3h14l4 4v14H3z" />
    <path d="M7 3v5h9V3M6 12h12v9H6z" />
    <path d="M8 15h8M8 18h8" />
  </Svg>
);

export const PencilIcon = (p: IconProps) => (
  <Svg {...p} stroke="none" fill="currentColor">
    <path d="M16.5 2.5l5 5L9 20H4v-5z" />
  </Svg>
);
