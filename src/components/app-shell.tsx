"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/hooks";

const NAV = [
  { href: "/schedule", label: "Schedule", icon: CalendarIcon },
  { href: "/preferences", label: "Rules", icon: SlidersIcon },
  { href: "/explore", label: "Explore", icon: CompassIcon },
  { href: "/history", label: "History", icon: ClockIcon },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { connected, ready } = useSession();
  const onConnect = pathname === "/connect" || pathname === "/";
  const showNav = ready && connected && !onConnect;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 bg-bg/90 backdrop-blur border-b border-app">
        <div className="mx-auto max-w-2xl px-4 h-14 flex items-center justify-between">
          <Link href={connected ? "/schedule" : "/"} className="flex items-center gap-2 font-semibold">
            <FlameIcon className="h-5 w-5 text-accent" />
            Warmup
          </Link>
          {showNav && (
            <Link
              href="/connect"
              className="text-xs text-muted hover:text-fg transition-colors"
            >
              Account
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 pb-28 pt-4">
        {children}
      </main>

      {showNav && (
        <nav className="fixed bottom-0 inset-x-0 z-20 bg-surface/95 backdrop-blur border-t border-app">
          <div className="mx-auto max-w-2xl grid grid-cols-4">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                    active ? "text-accent" : "text-muted hover:text-fg",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      <footer className="mx-auto max-w-2xl px-4 py-6 text-center text-[11px] text-muted">
        Warmup is an independent project. Not affiliated with, endorsed by, or
        sponsored by Cure.fit. Your Cult.fit session stays in this browser.
      </footer>
    </div>
  );
}

/* --------------------------- inline icons --------------------------- */
/* Small stroked SVGs so there's no icon-library dependency. */

type IconProps = { className?: string };
const base = "none";

export function FlameIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1 .3-2 1-3-.2 2 1 3 1 3 .5-3-1-6 2-11z" />
      <path d="M8.5 12A6 6 0 1 0 18 16c0-4-3-6-4-9-1 4-5 3-5.5 5z" />
    </svg>
  );
}
export function CalendarIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}
export function SlidersIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 3v6M8 9v6M16 15v6" />
    </svg>
  );
}
export function CompassIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" />
    </svg>
  );
}
export function ClockIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={base} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
