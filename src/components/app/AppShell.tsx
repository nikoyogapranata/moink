"use client";

import {
  BookOpen,
  Coins,
  Flame,
  House,
  Settings,
  SquareStack,
  User,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";

import { Wordmark } from "@/components/Wordmark";
import { levelLabel, type HskStandard } from "@/lib/hsk";

import { HskStandardProvider } from "./HskStandard";

// No gamification data yet. Flip to true once streaks and coins exist.
const SHOW_GAME_STATS = false;

export interface AppUser {
  id: string;
  username: string;
  /** profiles.hsk_level_target, a level in hskStandard. */
  hskLevel: number | null;
  hskStandard: HskStandard;
  avatarUrl: string | null;
  fullName: string | null;
}

const AppUserContext = createContext<AppUser | null>(null);

/** The signed-in user, for any client component inside the app shell. */
export function useAppUser() {
  const user = useContext(AppUserContext);
  if (!user) throw new Error("useAppUser must be used inside <AppShell>");
  return user;
}

const NAV: { href: string; label: string; short: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: House },
  { href: "/training", label: "Training", short: "Train", icon: SquareStack },
  { href: "/dictionary", label: "Dictionary", short: "Words", icon: BookOpen },
  { href: "/profile", label: "Profile", short: "Profile", icon: User },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Solid rust ring: at 40% it would fall under 3:1 against white.
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust";

// Shared by the sidebar and the tab bar.
const PANEL = "border-[1.5px] border-line bg-surface-raised";

/* Pieces */

function GameStats() {
  if (!SHOW_GAME_STATS) return null;
  // Placeholder values until the data exists.
  const stats = [
    { icon: Flame, label: "Day streak", value: 0, color: "text-bamboo-gold-dark" },
    { icon: Coins, label: "Coins", value: 0, color: "text-bamboo-gold-dark" },
  ];
  return (
    <div className="flex items-center gap-2">
      {stats.map(({ icon: Icon, label, value, color }) => (
        <span
          key={label}
          className="flex items-center gap-1.5 rounded-pill bg-highlight px-3 py-1"
        >
          <Icon size={16} aria-hidden="true" className={color} />
          <span className="font-body text-body font-medium text-bark">
            <span className="sr-only">{label}: </span>
            {value}
          </span>
        </span>
      ))}
    </div>
  );
}

function Avatar({ user }: { user: AppUser }) {
  if (user.avatarUrl) {
    return (
      <Image
        src={user.avatarUrl}
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-highlight font-heading text-body font-bold uppercase text-bark"
    >
      {user.username.charAt(0)}
    </span>
  );
}

function Sidebar({ pathname, user }: { pathname: string; user: AppUser }) {
  return (
    <aside
      className={`fixed inset-y-4 left-4 z-30 hidden w-55 flex-col rounded-[22px] p-3 lg:flex ${PANEL}`}
    >
      <div className="px-2 pb-6 pt-2">
        <Wordmark href="/dashboard" />
      </div>

      <nav aria-label="Main">
        <ul className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-11 items-center gap-3 rounded-md px-3 font-body text-body transition-colors ${FOCUS_RING} ${
                    active
                      ? "bg-highlight font-medium text-bark"
                      : "text-bark-muted hover:bg-highlight/60 hover:text-bark"
                  }`}
                >
                  {/* rust-dark: plain rust is under 3:1 on blush. */}
                  <Icon
                    size={20}
                    aria-hidden="true"
                    className={active ? "text-rust-dark" : undefined}
                  />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        {SHOW_GAME_STATS && (
          <div className="px-2">
            <GameStats />
          </div>
        )}
        <hr className="border-t-[1.5px] border-line" />
        <div className="flex items-center gap-2.5 px-1 pb-1">
          <Avatar user={user} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-body text-body font-medium text-bark">
              @{user.username}
            </p>
            {user.hskLevel !== null && (
              <p className="whitespace-nowrap font-body text-[13px] leading-5 text-bark-muted">
                {levelLabel(user.hskLevel, user.hskStandard)} ({user.hskStandard === "hsk3" ? "3.0" : "2.0"})
              </p>
            )}
          </div>
          <Link
            href="/settings"
            aria-label="Settings"
            aria-current={isActive(pathname, "/settings") ? "page" : undefined}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-highlight/60 hover:text-bark ${FOCUS_RING} ${
              isActive(pathname, "/settings")
                ? "bg-highlight text-rust-dark"
                : "text-bark-muted"
            }`}
          >
            <Settings size={20} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </aside>
  );
}

function MobileTopBar() {
  return (
    <header className="flex items-center justify-between gap-4 px-4 pb-2 pt-4 sm:px-6 lg:hidden">
      <Wordmark href="/dashboard" />
      <GameStats />
    </header>
  );
}

function TabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Main"
      className={`fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-30 rounded-[22px] p-1.5 lg:hidden ${PANEL}`}
    >
      <ul className="grid grid-cols-4 gap-1">
        {NAV.map(({ href, short, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-[16px] px-1 py-1.5 transition-colors ${FOCUS_RING} ${
                  active ? "bg-highlight text-bark" : "text-bark-muted"
                }`}
              >
                <Icon
                  size={21}
                  aria-hidden="true"
                  className={active ? "text-rust-dark" : undefined}
                />
                <span
                  className={`font-body text-[12px] leading-4 ${active ? "font-medium" : ""}`}
                >
                  {short}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* Shell */

export function AppShell({
  user,
  children,
}: {
  user: AppUser;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AppUserContext.Provider value={user}>
      <HskStandardProvider standard={user.hskStandard}>
        <div className="min-h-dvh bg-background">
          <Sidebar pathname={pathname} user={user} />
          <MobileTopBar />
          {/* Desktop: sidebar 220px + its 16px gaps on both sides + 24px.
              Mobile: room for the tab bar (about 66px tall, 12px off the
              bottom edge) plus breathing space. */}
          <main className="px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:pb-10 lg:pl-69 lg:pr-8 lg:pt-10">
            <div className="mx-auto w-full max-w-275">{children}</div>
          </main>
          <TabBar pathname={pathname} />
        </div>
      </HskStandardProvider>
    </AppUserContext.Provider>
  );
}
