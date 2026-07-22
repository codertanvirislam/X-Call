"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Card, PageShell, statusTone } from "@/components/ui";

type MeResponse = {
  user: { id: string; phone: string; name: string | null };
  kyc: { status: string; rejectReason?: string | null };
  credentials: {
    selxUserId: number;
    selxUserSlug?: string | null;
    hasToken: boolean;
  } | null;
  subscriptions: Array<{
    id: string;
    packageName: string;
    serviceType: string;
    minutesTotal: number;
    status: string;
    expiresAt: string;
  }>;
  orders: Array<{ id: string; packageName: string; status: string; priceBdt: number }>;
};

export default function DashboardPage() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [balance, setBalance] = useState<{ balance_minutes: number; balance_seconds: number } | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const res = await fetch("/api/me");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to load");
      return;
    }
    setData(json);

    if (json.credentials?.hasToken) {
      const b = await fetch("/api/me/balance");
      if (b.ok) {
        const bj = await b.json();
        setBalance(bj.balance);
      }
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (!data) {
    return (
      <PageShell title="Dashboard">
        <p className="text-sm text-muted">{error || "Loading..."}</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={`Hello${data.user.name ? `, ${data.user.name}` : ""}`}
      subtitle={data.user.phone}
      actions={
        <Link href="/packages">
          <Button>Buy package</Button>
        </Link>
      }
    >
      {error ? <Alert>{error}</Alert> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-muted">KYC status</p>
          <div className="mt-2">
            <Badge tone={statusTone(data.kyc.status)}>{data.kyc.status}</Badge>
          </div>
          {data.kyc.status === "REJECTED" && data.kyc.rejectReason ? (
            <p className="mt-2 text-xs text-danger">{data.kyc.rejectReason}</p>
          ) : null}
          {data.kyc.status !== "APPROVED" ? (
            <Link href="/kyc" className="mt-3 inline-block text-sm font-medium text-primary">
              Go to KYC →
            </Link>
          ) : null}
        </Card>

        <Card>
          <p className="text-sm text-muted">Live balance</p>
          <p className="mt-2 text-3xl font-semibold">
            {balance ? `${balance.balance_minutes}` : "—"}
          </p>
          <p className="text-xs text-muted">minutes remaining (from call backend)</p>
        </Card>

        <Card>
          <p className="text-sm text-muted">Active packages</p>
          <p className="mt-2 text-3xl font-semibold">
            {data.subscriptions.filter((s) => s.status === "ACTIVE").length}
          </p>
          <p className="text-xs text-muted">minutes + expiry controlled packages</p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Calling account</h2>
          {!data.credentials ? (
            <p className="mt-2 text-sm text-muted">
              Not ready yet. Complete KYC and buy a package to activate calling.
            </p>
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted">Status</span>
                {data.credentials.hasToken ? (
                  <Badge tone="green">Ready to call</Badge>
                ) : (
                  <Badge tone="yellow">Setting up…</Badge>
                )}
              </div>
              <p className="text-xs text-muted">
                {data.credentials.hasToken
                  ? "Your calling account is active. Use the dialer to place calls; minutes are drawn from your package balance."
                  : "We're provisioning your calling account with the backend. This usually takes a moment."}
              </p>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold">Subscriptions</h2>
          <div className="mt-3 space-y-3">
            {data.subscriptions.length === 0 ? (
              <p className="text-sm text-muted">No packages purchased yet.</p>
            ) : (
              data.subscriptions.map((s) => (
                <div key={s.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{s.packageName}</p>
                    <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {s.serviceType} · {s.minutesTotal} min · expires{" "}
                    {new Date(s.expiresAt).toLocaleDateString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
