"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Input, statusTone } from "@/components/ui";

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
  isActive: boolean;
  sortOrder: number;
  _count?: { orders: number };
};

type FormData = {
  code: string;
  name: string;
  description: string;
  serviceType: "HUMAN" | "AI";
  priceBdt: string;
  minutes: string;
  validityDays: string;
  features: string;
  isActive: boolean;
  sortOrder: string;
};

const emptyForm: FormData = {
  code: "",
  name: "",
  description: "",
  serviceType: "HUMAN",
  priceBdt: "",
  minutes: "",
  validityDays: "",
  features: "",
  isActive: true,
  sortOrder: "0",
};

export default function AdminPackagesPage() {
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError("");
    const res = await fetch("/api/admin/packages");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to load packages");
      return;
    }
    setPackages(data.packages || []);
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
    setSuccess("");
    setError("");
  }

  function openEdit(pkg: Pkg) {
    setEditingId(pkg.id);
    setForm({
      code: pkg.code,
      name: pkg.name,
      description: pkg.description || "",
      serviceType: pkg.serviceType as "HUMAN" | "AI",
      priceBdt: String(pkg.priceBdt),
      minutes: String(pkg.minutes),
      validityDays: String(pkg.validityDays),
      features: pkg.features,
      isActive: pkg.isActive,
      sortOrder: String(pkg.sortOrder),
    });
    setShowForm(true);
    setSuccess("");
    setError("");
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    const payload = {
      ...form,
      priceBdt: Number(form.priceBdt),
      minutes: Number(form.minutes),
      validityDays: Number(form.validityDays),
      sortOrder: Number(form.sortOrder),
    };

    try {
      let res: Response;
      if (editingId) {
        // PATCH — don't send code (can't change)
        const updatePayload = { ...payload, code: undefined };
        res = await fetch(`/api/admin/packages/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatePayload),
        });
      } else {
        res = await fetch("/api/admin/packages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      setSuccess(editingId ? "Package updated" : "Package created");
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(pkg: Pkg) {
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/admin/packages/${pkg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !pkg.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setSuccess(`Package ${pkg.isActive ? "disabled" : "enabled"}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Packages</h1>
          <p className="text-sm text-muted">Create and manage calling packages</p>
        </div>
        {!showForm && (
          <Button onClick={openCreate}>Add package</Button>
        )}
      </div>

      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {success ? <div className="mb-4"><Alert tone="success">{success}</Alert></div> : null}

      {/* Create / Edit Form */}
      {showForm ? (
        <Card className="mb-6">
          <h2 className="mb-4 text-lg font-semibold">
            {editingId ? "Edit package" : "New package"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Code"
                value={form.code}
                onChange={(e) => update("code", e.target.value.toUpperCase())}
                placeholder="HUMAN_STARTER"
                required
                disabled={!!editingId}
                pattern="[A-Z0-9_]+"
                title="Uppercase letters, numbers, underscores only"
              />
              <Input
                label="Name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Human Calling Starter"
                required
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Service type</span>
                <select
                  className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
                  value={form.serviceType}
                  onChange={(e) => update("serviceType", e.target.value as "HUMAN" | "AI")}
                >
                  <option value="HUMAN">Human</option>
                  <option value="AI">AI</option>
                </select>
              </label>
              <Input
                label="Description"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="Optional description"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Input
                label="Price (৳)"
                type="number"
                min="1"
                value={form.priceBdt}
                onChange={(e) => update("priceBdt", e.target.value)}
                placeholder="2000"
                required
              />
              <Input
                label="Minutes"
                type="number"
                min="1"
                value={form.minutes}
                onChange={(e) => update("minutes", e.target.value)}
                placeholder="500"
                required
              />
              <Input
                label="Validity (days)"
                type="number"
                min="1"
                value={form.validityDays}
                onChange={(e) => update("validityDays", e.target.value)}
                placeholder="30"
                required
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Features (comma-separated)"
                value={form.features}
                onChange={(e) => update("features", e.target.value)}
                placeholder="transfer, recording, multi_extension"
              />
              <Input
                label="Sort order"
                type="number"
                min="0"
                value={form.sortOrder}
                onChange={(e) => update("sortOrder", e.target.value)}
                placeholder="0"
              />
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => update("isActive", e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-sm text-slate-700">Active (visible to users)</span>
            </label>

            <div className="flex gap-2 pt-2">
              <Button disabled={busy} type="submit">
                {busy ? "Saving..." : editingId ? "Update package" : "Create package"}
              </Button>
              <Button variant="secondary" type="button" onClick={closeForm}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {/* Package List */}
      <div className="space-y-3">
        {packages.map((pkg) => (
          <Card key={pkg.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{pkg.name}</h2>
                  <Badge tone={statusTone(pkg.serviceType)}>{pkg.serviceType}</Badge>
                  {!pkg.isActive ? <Badge tone="red">Disabled</Badge> : null}
                </div>
                <p className="mt-0.5 text-xs text-muted font-mono">{pkg.code}</p>
                {pkg.description ? (
                  <p className="mt-1 text-sm text-muted">{pkg.description}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <span>
                    <span className="text-muted">Price:</span>{" "}
                    <span className="font-semibold">৳{pkg.priceBdt}</span>
                  </span>
                  <span>
                    <span className="text-muted">Minutes:</span>{" "}
                    <span className="font-semibold">{pkg.minutes}</span>
                  </span>
                  <span>
                    <span className="text-muted">Validity:</span>{" "}
                    <span className="font-semibold">{pkg.validityDays}d</span>
                  </span>
                  {pkg._count ? (
                    <span>
                      <span className="text-muted">Orders:</span>{" "}
                      <span className="font-semibold">{pkg._count.orders}</span>
                    </span>
                  ) : null}
                </div>
                {pkg.features ? (
                  <p className="mt-2 text-xs text-muted">Features: {pkg.features}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="secondary" onClick={() => openEdit(pkg)}>
                  Edit
                </Button>
                <Button
                  variant={pkg.isActive ? "ghost" : "secondary"}
                  onClick={() => toggleActive(pkg)}
                >
                  {pkg.isActive ? "Disable" : "Enable"}
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {packages.length === 0 ? (
          <p className="text-sm text-muted">No packages yet. Click &quot;Add package&quot; to create one.</p>
        ) : null}
      </div>
    </div>
  );
}
