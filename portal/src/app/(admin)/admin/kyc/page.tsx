"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Textarea, statusTone } from "@/components/ui";

type KycItem = {
  id: string;
  fullName: string;
  nidNumber: string;
  status: string;
  rejectReason?: string | null;
  frontUrl?: string | null;
  backUrl?: string | null;
  createdAt: string;
  store: { id: string; phone: string | null; name: string | null };
};

export default function AdminKycPage() {
  const [items, setItems] = useState<KycItem[]>([]);
  const [status, setStatus] = useState("PENDING");
  const [error, setError] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");

  async function load(nextStatus = status) {
    setError("");
    const res = await fetch(`/api/admin/kyc?status=${nextStatus}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setItems(data.items || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function review(kycId: string, action: "APPROVE" | "REJECT") {
    setBusy(kycId + action);
    setError("");
    try {
      const res = await fetch("/api/admin/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kycId,
          action,
          rejectReason: reasons[kycId] || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">KYC review</h1>
          <p className="text-sm text-muted">Approve or reject NID submissions</p>
        </div>
        <select
          className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            load(e.target.value);
          }}
        >
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="ALL">All</option>
        </select>
      </div>

      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}

      <div className="space-y-4">
        {items.map((item) => (
          <Card key={item.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{item.fullName}</h2>
                <p className="text-sm text-muted">
                  {item.store.phone} · NID {item.nidNumber}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
              <Badge tone={statusTone(item.status)}>{item.status}</Badge>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-muted">Front</p>
                {item.frontUrl ? (
                  <a href={item.frontUrl} target="_blank" rel="noreferrer" className="text-sm text-primary">
                    Open front file
                  </a>
                ) : (
                  <p className="text-sm text-muted">No signed URL (check S3 config)</p>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted">Back</p>
                {item.backUrl ? (
                  <a href={item.backUrl} target="_blank" rel="noreferrer" className="text-sm text-primary">
                    Open back file
                  </a>
                ) : (
                  <p className="text-sm text-muted">No signed URL (check S3 config)</p>
                )}
              </div>
            </div>

            {item.status === "PENDING" ? (
              <div className="mt-4 space-y-3">
                <Textarea
                  label="Reject reason (required if rejecting)"
                  value={reasons[item.id] || ""}
                  onChange={(e) =>
                    setReasons((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                />
                <div className="flex gap-2">
                  <Button
                    disabled={busy === item.id + "APPROVE"}
                    onClick={() => review(item.id, "APPROVE")}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy === item.id + "REJECT"}
                    onClick={() => review(item.id, "REJECT")}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        ))}
        {items.length === 0 ? <p className="text-sm text-muted">No KYC items.</p> : null}
      </div>
    </div>
  );
}
