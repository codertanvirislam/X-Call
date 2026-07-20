"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Card, PageShell, statusTone } from "@/components/ui";

type Order = {
  id: string;
  packageName: string;
  serviceType: string;
  priceBdt: number;
  minutes: number;
  status: string;
  provisionError?: string | null;
  createdAt: string;
  expiresAt?: string | null;
  payment?: { status: string; provider: string } | null;
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/orders")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed");
        setOrders(d.orders || []);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <PageShell title="Orders" subtitle="Payment and provisioning history">
      {error ? <Alert>{error}</Alert> : null}
      <div className="space-y-3">
        {orders.map((o) => (
          <Card key={o.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{o.packageName}</h2>
                <p className="mt-1 text-sm text-muted">
                  {o.serviceType} · {o.minutes} min · ৳{o.priceBdt}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {new Date(o.createdAt).toLocaleString()}
                  {o.expiresAt ? ` · expires ${new Date(o.expiresAt).toLocaleDateString()}` : ""}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                {o.payment ? (
                  <Badge tone={statusTone(o.payment.status)}>
                    pay: {o.payment.status}
                  </Badge>
                ) : null}
              </div>
            </div>
            {o.provisionError ? (
              <p className="mt-3 text-sm text-danger">{o.provisionError}</p>
            ) : null}
          </Card>
        ))}
        {orders.length === 0 ? <p className="text-sm text-muted">No orders yet.</p> : null}
      </div>
    </PageShell>
  );
}
