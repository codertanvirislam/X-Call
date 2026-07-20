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
    apiToken: string | null;
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
  const [copied, setCopied] = useState(false);

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

  async function copyToken() {
    if (!data?.credentials?.apiToken) return;
    await navigator.clipboard.writeText(data.credentials.apiToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

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
          <h2 className="font-semibold">API credentials</h2>
          {!data.credentials ? (
            <p className="mt-2 text-sm text-muted">
              No credentials yet. Complete KYC and buy a package.
            </p>
          ) : (
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <p className="text-muted">Selx User ID</p>
                <p className="font-mono">{data.credentials.selxUserId}</p>
              </div>
              {data.credentials.selxUserSlug ? (
                <div>
                  <p className="text-muted">User slug</p>
                  <p className="font-mono">{data.credentials.selxUserSlug}</p>
                </div>
              ) : null}
              <div>
                <p className="text-muted">Bearer token</p>
                {data.credentials.apiToken ? (
                  <div className="mt-1 flex items-center gap-2">
                    <code className="block max-w-full truncate rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs">
                      {data.credentials.apiToken}
                    </code>
                    <Button variant="secondary" onClick={copyToken}>
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-warning">Waiting for backend webhook credentials...</p>
                )}
              </div>
              <p className="text-xs text-muted">
                Use headers: <code>Authorization: Bearer TOKEN</code> and{" "}
                <code>X-User-Id: {data.credentials.selxUserId}</code>
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
