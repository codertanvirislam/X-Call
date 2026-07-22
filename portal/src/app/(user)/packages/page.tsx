"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Card, PageShell, statusTone } from "@/components/ui";

type Pkg = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  serviceType: string;
  priceBdt: number;
  minutes: number;
  validityDays: number;
  features: string;
};

export default function PackagesPage() {
  const router = useRouter();
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [loadingId, setLoadingId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/packages")
      .then((r) => r.json())
      .then((d) => setPackages(d.packages || []))
      .catch(() => setError("Failed to load packages"));
  }, []);

  async function buy(packageId: string) {
    setLoadingId(packageId);
    setError("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create order");

      if (data.paymentMode === "mock") {
        const pay = await fetch("/api/payments/mock-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: data.order.id }),
        });
        const payData = await pay.json();
        if (!pay.ok) throw new Error(payData.error || "Payment failed");
        router.push("/dashboard");
        return;
      }

      if (data.paymentMode === "eps") {
        const pay = await fetch("/api/payments/eps/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: data.order.id }),
        });
        const payData = await pay.json();
        if (!pay.ok || !payData.redirectUrl) {
          throw new Error(payData.error || "Could not start EPS payment");
        }
        // Hand off to the EPS hosted payment page.
        window.location.assign(payData.redirectUrl);
        return;
      }

      router.push("/orders");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoadingId("");
    }
  }

  return (
    <PageShell title="Packages" subtitle="Human calling and AI auto calling minutes">
      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {packages.map((pkg) => (
          <Card key={pkg.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{pkg.name}</h2>
                <p className="mt-1 text-sm text-muted">{pkg.description}</p>
              </div>
              <Badge tone={statusTone(pkg.serviceType)}>{pkg.serviceType}</Badge>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-muted">Price</p>
                <p className="font-semibold">৳{pkg.priceBdt}</p>
              </div>
              <div>
                <p className="text-muted">Minutes</p>
                <p className="font-semibold">{pkg.minutes}</p>
              </div>
              <div>
                <p className="text-muted">Validity</p>
                <p className="font-semibold">{pkg.validityDays}d</p>
              </div>
            </div>
            {pkg.features ? (
              <p className="mt-3 text-xs text-muted">Features: {pkg.features}</p>
            ) : null}
            <Button
              className="mt-4 w-full"
              disabled={loadingId === pkg.id}
              onClick={() => buy(pkg.id)}
            >
              {loadingId === pkg.id ? "Processing..." : "Buy now"}
            </Button>
          </Card>
        ))}
      </div>
      {packages.length === 0 ? (
        <p className="text-sm text-muted">No packages configured yet. Run the seed script.</p>
      ) : null}
    </PageShell>
  );
}
