"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "./ui";

export function UserNav() {
  const pathname = usePathname();
  const router = useRouter();
  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/kyc", label: "KYC" },
    { href: "/packages", label: "Packages" },
    { href: "/orders", label: "Orders" },
  ];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-border bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/dashboard" className="text-lg font-semibold text-primary">
          X-Call
        </Link>
        <nav className="flex flex-wrap items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                pathname.startsWith(l.href)
                  ? "bg-teal-50 font-medium text-primary"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <Button variant="ghost" onClick={logout} className="ml-1">
            Logout
          </Button>
        </nav>
      </div>
    </header>
  );
}

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const links = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/kyc", label: "KYC Review" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/orders", label: "Orders" },
  ];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-border bg-slate-900 text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/admin" className="text-lg font-semibold">
          X-Call Admin
        </Link>
        <nav className="flex flex-wrap items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                pathname === l.href || (l.href !== "/admin" && pathname.startsWith(l.href))
                  ? "bg-white/15 font-medium"
                  : "text-slate-200 hover:bg-white/10"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <button
            onClick={logout}
            className="ml-2 rounded-lg px-3 py-1.5 text-sm text-slate-200 hover:bg-white/10"
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
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold text-primary">
          X-Call
        </Link>
        <div className="flex gap-2">
          <Link href="/login" className="rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            Login
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
          >
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}
