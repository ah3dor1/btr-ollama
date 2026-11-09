import { useId, type ReactNode, type SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const ArrowUpIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </Icon>
);

export const StopIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />
  </Icon>
);

export const CopyIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6.5A2.5 2.5 0 0 0 4 5.5v6A2.5 2.5 0 0 0 6.5 14" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);

export const RefreshIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
    <path d="M20 4v7h-7" />
  </Icon>
);

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 6h17M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6" />
    <path d="M6 6l.9 13A1.5 1.5 0 0 0 8.4 20.5h7.2A1.5 1.5 0 0 0 17 19L18 6" />
    <path d="M10 10.5v6M14 10.5v6" />
  </Icon>
);

export const SlidersIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 21v-6M4 9V3M12 21v-9M12 6V3M20 21v-4M20 11V3" />
    <circle cx="4" cy="11" r="2" />
    <circle cx="12" cy="8" r="2" />
    <circle cx="20" cy="13" r="2" />
  </Icon>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.6-3.6" />
  </Icon>
);

export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4 20h16" />
  </Icon>
);

export const ExternalLinkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 4h6v6M20 4l-8.5 8.5" />
    <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
  </Icon>
);

export const SparklesIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 10.9 10.1 9 12 3.5Z" />
    <path d="M18.5 3.5v3M17 5h3" />
  </Icon>
);

export const CpuIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="7" y="7" width="10" height="10" rx="2" />
    <path d="M10 2.5v3M14 2.5v3M10 18.5v3M14 18.5v3M2.5 10h3M2.5 14h3M18.5 10h3M18.5 14h3" />
  </Icon>
);

export const ActivityIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12h3.5l2.5-7 4 14 2.5-7H21" />
  </Icon>
);

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const PanelRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M15 4v16" />
  </Icon>
);

export const PencilIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4L20 8l-4-4L4 16v4Z" />
    <path d="m14.5 5.5 4 4" />
  </Icon>
);

export const ZapIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 2 4 14h6.5L11 22l9-12h-6.5L13 2Z" />
  </Icon>
);

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 21 20H3L12 3.5Z" />
    <path d="M12 9.5v4.5" />
    <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
  </Icon>
);

export const WifiIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 9.5a11 11 0 0 1 15 0" />
    <path d="M7.5 13a7 7 0 0 1 9 0" />
    <path d="M10.5 16.4a3 3 0 0 1 3 0" />
    <circle cx="12" cy="19.5" r="0.9" fill="currentColor" stroke="none" />
  </Icon>
);

export const WifiOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 9.5a11 11 0 0 1 4-2.5" />
    <path d="M14 7.2a11 11 0 0 1 5.5 2.3" />
    <path d="M7.5 13a7 7 0 0 1 2.8-1.4" />
    <path d="M14 11.7a7 7 0 0 1 2.5 1.3" />
    <path d="M3 3l18 18" />
  </Icon>
);

export const DiceIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="8.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
  </Icon>
);

export const ArrowDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icon>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 12h16M13 5l7 7-7 7" />
  </Icon>
);

export const ArrowUpRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 17 17 7M8 7h9v9" />
  </Icon>
);

export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);

export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20.6 14.1A8.6 8.6 0 0 1 9.9 3.4 8.6 8.6 0 1 0 20.6 14.1Z" />
  </Icon>
);

export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3 5 6v6c0 4 3 7.4 7 9 4-1.6 7-5 7-9V6l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);

export const FolderIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h4l2 2.5h6A2.5 2.5 0 0 1 20.5 10v7A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17V7.5Z" />
    <path d="M3.5 10h17" />
  </Icon>
);

export const CodeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4M13.5 5l-3 14" />
  </Icon>
);

export const FileTextIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3.5h7l5 5v12H6v-17Z" />
    <path d="M13 3.5v5h5M9 13h6M9 16.5h4" />
  </Icon>
);

export const TerminalIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <path d="m7 9 3 3-3 3M12.5 15H17" />
  </Icon>
);


export const MessageIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 14.5a2.5 2.5 0 0 1-2.5 2.5H8l-4.5 4V6A2.5 2.5 0 0 1 6 3.5h12.5A2.5 2.5 0 0 1 21 6v8.5Z" />
  </Icon>
);

export const SquareIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="5" width="14" height="14" rx="3" />
  </Icon>
);

export function Logo({ size = 34 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true" className="brand-mark">
      <defs>
        <linearGradient id={`${id}-ring`} x1="9" y1="7" x2="27" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#dccbe9" />
          <stop offset="1" stopColor="#8f6fac" />
        </linearGradient>
        <linearGradient id={`${id}-bg`} x1="4" y1="2" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1b1424" />
          <stop offset="1" stopColor="#100b16" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="34" height="34" rx="9" fill={`url(#${id}-bg)`} />
      <rect x="1" y="1" width="34" height="34" rx="9" stroke="rgba(255,255,255,0.08)" />
      <circle
        cx="18"
        cy="18"
        r="8.4"
        stroke={`url(#${id}-ring)`}
        strokeWidth="1.4"
        strokeDasharray="34 8"
        strokeLinecap="round"
      />
      <circle cx="18" cy="18" r="4.6" stroke={`url(#${id}-ring)`} strokeWidth="1.1" opacity="0.55" />
      <circle cx="18" cy="18" r="1.5" fill="#e8dccd" />
    </svg>
  );
}
