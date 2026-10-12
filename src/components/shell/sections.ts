import {
  CalendarDaysIcon,
  ListTodoIcon,
  type LucideIcon,
  MessageSquareIcon,
  SettingsIcon,
} from "lucide-react";

export type Section = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Path prefix that marks the section active, when it differs from `href`. */
  match?: string;
};

export const primarySections: Section[] = [
  { href: "/chat", label: "Chat", icon: MessageSquareIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarDaysIcon },
  { href: "/todos", label: "Todos", icon: ListTodoIcon },
];

export const settingsSection: Section = {
  href: "/settings/profile",
  match: "/settings",
  label: "Settings",
  icon: SettingsIcon,
};

/** A path is active on itself and every path nested under it. */
export function isPathActive(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isSectionActive(pathname: string, section: Section): boolean {
  return isPathActive(pathname, section.match ?? section.href);
}
