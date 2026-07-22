"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, statusTone } from "@/components/ui";

type Order = {
  id: string;
  packageName: string;
  serviceType: string;
  priceBdt: number;
  minutes: number;
  status: string;
  provisionError?: string | null;
  createdAt: string;
  store: { phone: string | null; name: string | null };
  payment?: { status: string; provider: string } | null;
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    setError("");
    const res = await fetch("/api/admin/orders");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to load orders");
      return;
    }
    setOrders(data.orders || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function act(orderId: string, action: "RETRY_PROVISION" | "CANCEL") {
    const label = action === "RETRY_PROVISION" ? "retry provisioning" : "cancel";
    if (!confirm(`Are you sure you want to ${label} this order?`)) return;

    setBusy(orderId + action);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      setSuccess(data.message || "Action completed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Orders</h1>
      <p className="mt-1 text-sm text-muted">Payments and provisioning status</p>
      {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
      {success ? <div className="mt-4"><Alert tone="success">{success}</Alert></div> : null}
      <div className="mt-6 space-y-3">
        {orders.map((o) => (
          <Card key={o.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{o.packageName}</h2>
                <p className="text-sm text-muted">
                  {o.store.name || "Store"} · {o.store.phone}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {o.serviceType} · {o.minutes} min · ৳{o.priceBdt}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {new Date(o.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                {o.payment ? (
                  <Badge tone={statusTone(o.payment.status)}>
                    {o.payment.provider}:{o.payment.status}
                  </Badge>
                ) : null}
              </div>
            </div>

            {o.provisionError ? (
              <p className="mt-3 text-sm text-danger">{o.provisionError}</p>
            ) : null}

            {/* Action buttons */}
            {o.status === "PROVISIONING_FAILED" ? (
              <div className="mt-3">
                <Button
                  variant="secondary"
                  disabled={busy === o.id + "RETRY_PROVISION"}
                  onClick={() => act(o.id, "RETRY_PROVISION")}
                >
                  {busy === o.id + "RETRY_PROVISION" ? "Retrying..." : "Retry provision"}
                </Button>
              </div>
            ) : null}

            {["PENDING_PAYMENT", "PAYMENT_FAILED"].includes(o.status) ? (
              <div className="mt-3">
                <Button
                  variant="danger"
                  disabled={busy === o.id + "CANCEL"}
                  onClick={() => act(o.id, "CANCEL")}
                >
                  {busy === o.id + "CANCEL" ? "Cancelling..." : "Cancel order"}
                </Button>
              </div>
            ) : null}
          </Card>
        ))}
        {orders.length === 0 ? (
          <p className="text-sm text-muted">No orders yet.</p>
        ) : null}
      </div>
    </div>
  );
}
