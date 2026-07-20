"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Input, PageShell, statusTone } from "@/components/ui";

type Kyc = {
  status: string;
  fullName?: string;
  nidNumber?: string;
  rejectReason?: string | null;
};

export default function KycPage() {
  const [kyc, setKyc] = useState<Kyc | null>(null);
  const [fullName, setFullName] = useState("");
  const [nidNumber, setNidNumber] = useState("");
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    const res = await fetch("/api/kyc");
    const data = await res.json();
    if (res.ok) {
      setKyc(data.kyc);
      if (data.kyc?.fullName) setFullName(data.kyc.fullName);
      if (data.kyc?.nidNumber) setNidNumber(data.kyc.nidNumber);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!front || !back) {
      setError("Upload NID front and back");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const form = new FormData();
      form.set("fullName", fullName);
      form.set("nidNumber", nidNumber);
      form.set("front", front);
      form.set("back", back);
      const res = await fetch("/api/kyc", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setSuccess("KYC submitted for review");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  const locked = kyc?.status === "PENDING" || kyc?.status === "APPROVED";

  return (
    <PageShell title="KYC verification" subtitle="NID number + front and back image/PDF">
      <Card className="max-w-xl">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm text-muted">Status</span>
          <Badge tone={statusTone(kyc?.status || "NOT_STARTED")}>
            {kyc?.status || "NOT_STARTED"}
          </Badge>
        </div>

        {kyc?.status === "REJECTED" && kyc.rejectReason ? (
          <Alert>{`Rejected: ${kyc.rejectReason}. Please resubmit.`}</Alert>
        ) : null}
        {kyc?.status === "APPROVED" ? (
          <Alert tone="success">Your KYC is approved. You can buy packages.</Alert>
        ) : null}
        {kyc?.status === "PENDING" ? (
          <Alert tone="info">Your documents are under admin review.</Alert>
        ) : null}

        {!locked ? (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <Input
              label="Full name (as on NID)"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <Input
              label="NID number"
              value={nidNumber}
              onChange={(e) => setNidNumber(e.target.value)}
              required
            />
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">NID front</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setFront(e.target.files?.[0] || null)}
                required
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">NID back</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setBack(e.target.files?.[0] || null)}
                required
              />
            </label>
            {error ? <Alert>{error}</Alert> : null}
            {success ? <Alert tone="success">{success}</Alert> : null}
            <Button type="submit" disabled={loading}>
              {loading ? "Uploading..." : "Submit KYC"}
            </Button>
          </form>
        ) : null}
      </Card>
    </PageShell>
  );
}
