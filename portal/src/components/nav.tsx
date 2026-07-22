"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";

function useLogout() {
  const router = useRouter();
  return async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };
}

function Logo({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex items-center">
      <Image
        src="/selorax-logo.png"
        alt="SeloraX"
        width={104}
        height={32}
        priority
        className="h-8 w-auto"
      />
    </Link>
  );
}

export function UserNav() {
  const pathname = usePathname();
  const logout = useLogout();
  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/kyc", label: "KYC" },
    { href: "/packages", label: "Packages" },
    { href: "/orders", label: "Orders" },
    { href: "/team", label: "Team" },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Logo href="/dashboard" />
        <nav className="flex flex-wrap items-center gap-1">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-primary-soft font-semibold text-primary"
                    : "text-brand-slate hover:bg-surface hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
          <button
            onClick={logout}
            className="ml-1 rounded-lg px-3 py-1.5 text-sm font-medium text-brand-slate transition-colors hover:bg-surface hover:text-ink"
          >
            Logout
          </button>
        </nav>
      </div>
    </header>
  );
}

export function AdminNav() {
  const pathname = usePathname();
  const logout = useLogout();
  const links = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/kyc", label: "KYC Review" },
    { href: "/admin/stores", label: "Stores" },
    { href: "/admin/packages", label: "Packages" },
    { href: "/admin/orders", label: "Orders" },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-navy-deep text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Link href="/admin" className="flex items-center gap-2">
          <span className="font-display text-lg font-bold tracking-tight">
            Selora<span className="text-orange">X</span>
          </span>
          <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white/80">
            Admin
          </span>
        </Link>
        <nav className="flex flex-wrap items-center gap-1">
          {links.map((l) => {
            const active =
              pathname === l.href || (l.href !== "/admin" && pathname.startsWith(l.href + "/"));
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active ? "bg-white/15 font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
          <button
            onClick={logout}
            className="ml-2 rounded-lg px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            Logout
          </button>
        </nav>
      </div>
    </header>
  );
}

export function PublicNav() {
  return (
    <header className="border-b border-border bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 md:px-6">
        <Logo href="/" />
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="px-2 py-2 text-sm font-semibold text-navy-deep transition-colors hover:text-primary"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-soft transition-all hover:-translate-y-px hover:bg-primary-hover hover:shadow-lift"
          >
            Create account
          </Link>
        </div>
      </div>
    </header>
  );
}
