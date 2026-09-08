/**
 * The board index entry. Boards are reading surfaces under More (`?tab=more&board=`); this type
 * outlived the left icon rail that used to render them as floating windows, and is now shared by
 * the More index and the Dashboard that builds the list.
 */
export type NavIconName =
  | "wire"
  | "tools"
  | "models"
  | "agents"
  | "launches"
  | "research"
  | "benchmarks"
  | "labs"
  | "regional-wire"
  | "sdk-adoption"
  | "model-usage"
  | "audit";

export type NavItem = {
  id: string;
  label: string;
  icon: NavIconName;
  /** The live number this board carries, when it has one. */
  count?: number | null;
  hot?: boolean;
  /** Announced but not built — rendered inert. */
  soon?: boolean;
};
