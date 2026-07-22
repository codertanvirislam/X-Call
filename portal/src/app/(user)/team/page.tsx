"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Input, PageShell } from "@/components/ui";

type Member = {
  id: string;
  phone: string;
  name: string | null;
  role: "OWNER" | "EMPLOYEE";
  status: string;
};

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [myRole, setMyRole] = useState<"OWNER" | "EMPLOYEE" | null>(null);
  const [hasActiveSub, setHasActiveSub] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setError("");
    const [meRes, empRes] = await Promise.all([
      fetch("/api/me"),
      fetch("/api/store/employees"),
    ]);
    const me = await meRes.json();
    const emp = await empRes.json();
    if (meRes.ok) {
      setMyRole(me.user?.role ?? null);
      setHasActiveSub(
        Array.isArray(me.subscriptions) &&
          me.subscriptions.some((s: { status: string }) => s.status === "ACTIVE"),
      );
    }
    if (empRes.ok) {
      setMembers(emp.members || []);
    } else {
      setError(emp.error || "Failed to load team");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addEmployee(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const res = await fetch("/api/store/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name: name || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add employee");
        return;
      }
      setNotice(
        `Added ${phone}. They can now sign in with this number, receive an OTP, and set their password.`,
      );
      setPhone("");
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError("");
    setNotice("");
    const res = await fetch(`/api/store/employees/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to remove");
      return;
    }
    await load();
  }

  const isOwner = myRole === "OWNER";

  return (
    <PageShell
      title="Team"
      subtitle="Owner and employees who can log into this store"
    >
      {error ? <Alert>{error}</Alert> : null}
      {notice ? (
        <div className="mb-4 rounded-xl bg-primary-soft p-3 text-sm text-primary">
          {notice}
        </div>
      ) : null}

      {isOwner ? (
        <Card>
          <h2 className="font-semibold">Add an employee</h2>
          <p className="mt-1 text-sm text-muted">
            Enter the employee&apos;s phone number to grant access. They then sign
            in with that number, verify the OTP, and set their own password.
          </p>
          {!hasActiveSub ? (
            <div className="mt-3">
              <Alert>
                Buy a package and activate a subscription before adding employees.
              </Alert>
            </div>
          ) : (
            <form onSubmit={addEmployee} className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Employee phone (e.g. 01XXXXXXXXX)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
              <Input
                placeholder="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button type="submit" disabled={busy}>
                {busy ? "Adding..." : "Add"}
              </Button>
            </form>
          )}
        </Card>
      ) : null}

      <div className="mt-6 space-y-3">
        {members.map((m) => (
          <Card key={m.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{m.name || "Unnamed"}</p>
                <p className="text-sm text-muted">{m.phone}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={m.role === "OWNER" ? "blue" : undefined}>
                  {m.role === "OWNER" ? "Owner" : "Employee"}
                </Badge>
                <Badge tone={m.status === "ACTIVE" ? "green" : "yellow"}>
                  {m.status === "ACTIVE" ? "Active" : "Pending sign-in"}
                </Badge>
                {isOwner && m.role === "EMPLOYEE" ? (
                  <Button variant="ghost" onClick={() => remove(m.id)}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
        {members.length === 0 ? (
          <p className="text-sm text-muted">No team members yet.</p>
        ) : null}
      </div>
    </PageShell>
  );
}
