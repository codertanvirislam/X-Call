import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui";
import { expireDueSubscriptions } from "@/lib/provisioning";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  await expireDueSubscriptions();

  const [stores, pendingKyc, paidOrders, failedProvision] = await Promise.all([
    prisma.store.count(),
    prisma.kycSubmission.count({ where: { status: "PENDING" } }),
    prisma.order.count({ where: { status: { in: ["PAID", "ACTIVE", "PROVISIONING"] } } }),
    prisma.order.count({ where: { status: "PROVISIONING_FAILED" } }),
  ]);

  const cards = [
    { label: "Stores", value: stores },
    { label: "Pending KYC", value: pendingKyc },
    { label: "Paid / active orders", value: paidOrders },
    { label: "Provision failures", value: failedProvision },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Admin overview</h1>
      <p className="mt-1 text-sm text-muted">Manage KYC, stores, balance and orders</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <p className="text-sm text-muted">{c.label}</p>
            <p className="mt-2 text-3xl font-semibold">{c.value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
