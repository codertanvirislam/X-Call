"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Button, Card, Input } from "@/components/ui";

export default function VerifyOtpPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("SIGNUP");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem("signup");
    if (!raw) {
      router.replace("/signup");
      return;
    }
    const data = JSON.parse(raw) as { phone: string; name?: string; purpose?: string };
    setPhone(data.phone);
    setName(data.name || "");
    setPurpose(data.purpose || "SIGNUP");
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, purpose, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "OTP verification failed");
      if (data.needsPassword) {
        router.push("/set-password");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h1 className="text-xl font-semibold">Verify OTP</h1>
      <p className="mt-1 text-sm text-muted">Code sent to {phone || "your phone"}</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Input
          label="6-digit OTP"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          required
        />
        {error ? <Alert>{error}</Alert> : null}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Verifying..." : "Verify"}
        </Button>
      </form>
    </Card>
  );
}
