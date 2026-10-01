/**
 * Nav icons — modern rounded line style, drawn to match the retro-chic theme.
 * Every icon inherits `currentColor` (the nav link's text color), so the only
 * colors ever rendered are the palette's ink/forest/lime tones — no new hues.
 */

type IconProps = { className?: string };

function base(props: IconProps) {
  return {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: props.className,
  };
}

export function IconDashboard(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 20V12" />
      <path d="M12 20V6" />
      <path d="M19 20v-5" />
    </svg>
  );
}

export function IconCampaigns(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6l-4 4H4a1 1 0 0 0-1 1Z" />
      <path d="M14 8a5 5 0 0 1 0 8" />
      <path d="M17.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

export function IconAutomations(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13 3 5 13h5l-1 8 8-10h-5l1-8Z" />
    </svg>
  );
}

export function IconInbox(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M21 12c0 4-4 7-9 7-1.2 0-2.4-.17-3.4-.5L4 20l1.3-3.1C4 15.6 3 13.9 3 12c0-4 4-7 9-7s9 3 9 7Z" />
    </svg>
  );
}

export function IconContacts(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.7-3 3-4.5 5.5-4.5S13.8 16 14.5 19" />
      <path d="M16 5.5a3.2 3.2 0 0 1 0 5.4" />
      <path d="M17.5 14.7c1.6.6 2.6 1.9 3 4.3" />
    </svg>
  );
}

export function IconSegments(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.8" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconMedia(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M20 16.5 15.5 12l-7 7" />
    </svg>
  );
}

export function IconNumbers(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 4h3.5l1.5 4.5-2.2 1.6a13 13 0 0 0 6.1 6.1l1.6-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5C10.4 20 4 13.6 3.5 5.6A1.5 1.5 0 0 1 5 4Z" />
    </svg>
  );
}

export function IconCompliance(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3 5 6v5c0 4.4 3 8.1 7 9.5 4-1.4 7-5.1 7-9.5V6l-7-3Z" />
      <path d="m9 12 2 2 4-4.5" />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.15-1.4l2-1.55-2-3.4-2.35.95A7 7 0 0 0 14.1 5.2L13.7 2.7h-3.9l-.4 2.5a7 7 0 0 0-2.4 1.4L4.65 5.65l-2 3.4 2 1.55a7 7 0 0 0 0 2.8l-2 1.55 2 3.4 2.35-.95a7 7 0 0 0 2.4 1.4l.4 2.5h3.9l.4-2.5a7 7 0 0 0 2.4-1.4l2.35.95 2-3.4-2-1.55c.1-.45.15-.92.15-1.4Z" />
    </svg>
  );
}
