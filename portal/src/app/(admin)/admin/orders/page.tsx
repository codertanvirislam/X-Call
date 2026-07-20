"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Card, statusTone } from "@/components/ui";

type Order = {
  id: string;
  packageName: string;
  serviceType: string;
  priceBdt: number;
  minutes: number;
  status: string;
  provisionError?: string | null;
  createdAt: string;
  user: { phone: string; name: string | null };
  payment?: { status: string; provider: string } | null;
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/orders")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed");
        setOrders(d.orders || []);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Orders</h1>
      <p className="mt-1 text-sm text-muted">Payments and provisioning status</p>
      {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}
      <div className="mt-6 space-y-3">
        {orders.map((o) => (
          <Card key={o.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{o.packageName}</h2>
                <p className="text-sm text-muted">
                  {o.user.name || "User"} · {o.user.phone}
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
          </Card>
        ))}
      </div>
    </div>
  );
}
