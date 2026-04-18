"use client";

export type NavItem = {
  id: string;
  label: string;
  icon: NavIconName;
  count?: number | null;
  hot?: boolean;
};

export type LeftNavProps = {
  items: NavItem[];
  openIds: Set<string>;
  onToggle: (id: string) => void;
};

export function LeftNav({ items, openIds, onToggle }: LeftNavProps) {
  return (
    <div className="ap-leftnav" role="navigation" aria-label="Panel navigation">
      {items.map((n) => (
        <button
          key={n.id}
          className={`ap-leftnav__item ${openIds.has(n.id) ? "ap-leftnav__item--active" : ""}`}
          onClick={() => onToggle(n.id)}
          aria-pressed={openIds.has(n.id)}
        >
          <NavIcon name={n.icon} />
          <span>{n.label}</span>
          {n.count != null && (
            <span
              className={`ap-leftnav__count ${n.hot ? "ap-leftnav__count--hot" : ""}`}
            >
              {n.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

type NavIconName =
  | "wire"
  | "tools"
  | "models"
  | "agents"
  | "research"
  | "security"
  | "audit";

function NavIcon({ name }: { name: NavIconName }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 14 14",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.2,
  } as const;
  switch (name) {
    case "wire":
      return (
        <svg {...common}>
          <path d="M1 7h3l1.5-4 3 8 1.5-4H13" />
        </svg>
      );
    case "tools":
      return (
        <svg {...common}>
          <path d="M2 11l4-4m0 0l1.5-1.5a2 2 0 112.8 2.8L8.8 9.8M6 7l4 4m2 2l-1-1" />
        </svg>
      );
    case "models":
      return (
        <svg {...common}>
          <rect x="1.5" y="1.5" width="11" height="11" />
          <path d="M1.5 5h11M5 1.5v11" />
        </svg>
      );
    case "agents":
      return (
        <svg {...common}>
          <circle cx="7" cy="5" r="2" />
          <path d="M2.5 12c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" />
        </svg>
      );
    case "research":
      return (
        <svg {...common}>
          <path d="M2 2h7l3 3v7H2z M9 2v3h3" />
        </svg>
      );
    case "security":
      return (
        <svg {...common}>
          <path d="M7 1.5L2 3.5V7c0 3 2 5.2 5 5.5 3-0.3 5-2.5 5-5.5V3.5z" />
        </svg>
      );
    case "audit":
      return (
        <svg {...common}>
          <path d="M2 2h10v10H2z M4.5 5h5M4.5 7h5M4.5 9h3" />
        </svg>
      );
  }
}
