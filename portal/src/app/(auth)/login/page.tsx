"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

function HeadsetIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5a9 9 0 0 1 18 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function ShieldCheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      router.push(data.redirectTo || "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="mb-7 flex justify-center">
        <Image src="/selorax-logo.png" alt="SeloraX" width={137} height={42} priority className="h-[42px] w-auto" />
      </div>

      <div className="rounded-[14px] border border-[#e4e4ef] bg-white p-8 shadow-[0_1px_3px_rgba(43,42,117,0.08)]">
        <div className="mb-1.5 flex items-center gap-2.5">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-[#eeeefb] text-navy">
            <HeadsetIcon />
          </div>
          <h1 className="text-[19px] font-semibold text-[#1a1a3d]">Log in</h1>
        </div>
        <p className="mb-[22px] text-[13px] text-[#7a7a94]">Use your phone number and password.</p>

        <form onSubmit={onSubmit}>
          <label htmlFor="phone" className="mb-1.5 block text-[13px] text-[#4a4a66]">
            Mobile number
          </label>
          <div className="relative mb-4">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#a0a0b8]">
              <PhoneIcon />
            </span>
            <input
              id="phone"
              type="tel"
              placeholder="01XXXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="w-full rounded-lg border border-[#e0e0ec] py-[11px] pl-9 pr-3 text-[14px] text-[#1a1a3d] outline-none transition-colors placeholder:text-[#b0b0c4] focus:border-navy"
            />
          </div>

          <label htmlFor="password" className="mb-1.5 block text-[13px] text-[#4a4a66]">
            Password
          </label>
          <div className="relative mb-4">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#a0a0b8]">
              <LockIcon />
            </span>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-[#e0e0ec] py-[11px] pl-9 pr-3 text-[14px] text-[#1a1a3d] outline-none transition-colors placeholder:text-[#b0b0c4] focus:border-navy"
            />
          </div>

          <div className="mb-5 flex justify-end">
            <Link href="/login" className="text-[12px] text-orange hover:underline">
              Forgot password?
            </Link>
          </div>

          {error ? (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mb-3.5 w-full rounded-lg bg-navy py-3 text-[14px] font-semibold text-white transition-colors hover:bg-navy-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Log in"}
          </button>
        </form>

        <p className="text-center text-[13px] text-[#7a7a94]">
          New here?{" "}
          <Link href="/signup" className="font-semibold text-orange hover:underline">
            Create account
          </Link>
        </p>
      </div>

      <div className="mt-[18px] flex justify-center gap-4">
        <span className="flex items-center gap-1 text-[12px] text-[#8a8aa0]">
          <span className="text-navy">
            <ShieldCheckIcon />
          </span>
          NID-verified
        </span>
        <span className="flex items-center gap-1 text-[12px] text-[#8a8aa0]">
          <span className="text-navy">
            <LockIcon />
          </span>
          Encrypted
        </span>
      </div>
    </>
  );
}
