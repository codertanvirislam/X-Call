"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Input, statusTone } from "@/components/ui";

type UserRow = {
  id: string;
  phone: string;
  name: string | null;
  createdAt: string;
  kyc: { status: string; nidNumber: string } | null;
  selxCredential: {
    selxUserId: number;
    selxUserSlug?: string | null;
    hasToken: boolean;
  } | null;
  subscriptions: Array<{
    id: string;
    packageName: string;
    status: string;
    minutesTotal: number;
    expiresAt: string;
  }>;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [balance, setBalance] = useState<string>("");
  const [usage, setUsage] = useState<Array<Record<string, unknown>>>([]);
  const [busy, setBusy] = useState(false);

  async function load(query = q) {
    setError("");
    const res = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setUsers(data.users || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function inspect(userId: string) {
    setSelected(userId);
    setBusy(true);
    setBalance("");
    setUsage([]);
    setError("");
    try {
      const [bRes, uRes] = await Promise.all([
        fetch(`/api/admin/users/${userId}/balance`),
        fetch(`/api/admin/users/${userId}/usage?limit=20`),
      ]);
      const bData = await bRes.json();
      const uData = await uRes.json();
      if (bRes.ok) {
        setBalance(
          `${bData.balance.balance_minutes} min (${bData.balance.balance_seconds}s)`,
        );
      } else {
        setBalance(bData.error || "Balance unavailable");
      }
      if (uRes.ok) {
        setUsage(uData.calls || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="mt-1 text-sm text-muted">
        Lookup live balance and usage from call-center backend using user token
      </p>

      <div className="mt-4 flex gap-2">
        <Input
          placeholder="Search phone or name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button onClick={() => load(q)}>Search</Button>
      </div>

      {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}

      <div className="mt-6 space-y-3">
        {users.map((u) => (
          <Card key={u.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{u.name || "Unnamed user"}</h2>
                <p className="text-sm text-muted">{u.phone}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone={statusTone(u.kyc?.status || "NOT_STARTED")}>
                    KYC: {u.kyc?.status || "NOT_STARTED"}
                  </Badge>
                  {u.selxCredential ? (
                    <Badge tone="blue">
                      selx #{u.selxCredential.selxUserId}
                      {u.selxCredential.hasToken ? "" : " (token pending)"}
                    </Badge>
                  ) : (
                    <Badge>no backend user</Badge>
                  )}
                </div>
              </div>
              <Button
                variant="secondary"
                disabled={busy && selected === u.id}
                onClick={() => inspect(u.id)}
              >
                View balance/usage
              </Button>
            </div>

            {u.subscriptions.length > 0 ? (
              <div className="mt-3 space-y-1 text-sm">
                {u.subscriptions.map((s) => (
                  <p key={s.id} className="text-muted">
                    {s.packageName} · {s.minutesTotal} min · {s.status} · exp{" "}
                    {new Date(s.expiresAt).toLocaleDateString()}
                  </p>
                ))}
              </div>
            ) : null}

            {selected === u.id ? (
              <div className="mt-4 rounded-xl bg-slate-50 p-3">
                <p className="text-sm font-medium">Live balance: {balance || "—"}</p>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead>
                      <tr className="text-muted">
                        <th className="py-1 pr-3">Call</th>
                        <th className="py-1 pr-3">To</th>
                        <th className="py-1 pr-3">Status</th>
                        <th className="py-1 pr-3">Started</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.map((c) => (
                        <tr key={String(c.call_id)} className="border-t border-border">
                          <td className="py-1 pr-3 font-mono">{String(c.call_id)}</td>
                          <td className="py-1 pr-3">{String(c.to_number || "")}</td>
                          <td className="py-1 pr-3">{String(c.status || "")}</td>
                          <td className="py-1 pr-3">
                            {c.started_at
                              ? new Date(String(c.started_at)).toLocaleString()
                              : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {usage.length === 0 ? (
                    <p className="mt-2 text-xs text-muted">No usage rows.</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
