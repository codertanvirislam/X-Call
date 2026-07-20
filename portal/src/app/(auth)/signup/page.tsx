"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, Input } from "@/components/ui";

export default function SignupPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [devCode, setDevCode] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setDevCode("");
    try {
      const res = await fetch("/api/auth/otp/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, purpose: "SIGNUP" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send OTP");
      if (data.devCode) setDevCode(data.devCode);
      sessionStorage.setItem(
        "signup",
        JSON.stringify({ phone: data.phone || phone, name, purpose: "SIGNUP" }),
      );
      router.push("/verify-otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h1 className="text-xl font-semibold">Create account</h1>
      <p className="mt-1 text-sm text-muted">We will send a one-time OTP to your phone.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input
          label="Mobile number"
          placeholder="01XXXXXXXXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        {error ? <Alert>{error}</Alert> : null}
        {devCode ? <Alert tone="info">Dev OTP: {devCode}</Alert> : null}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Sending..." : "Send OTP"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary">
          Login
        </Link>
      </p>
    </Card>
  );
}
