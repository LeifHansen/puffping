"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input, Label, PageHeader, Select } from "@/components/ui";

type Member = { userId: string; email: string; name: string | null; role: string; isYou: boolean };
type Invite = { id: string; email: string; role: string; token: string };
type Workspace = { tenantId: string; name: string; role: string };
type Plan = { id: string; name: string; priceMonthly: number; messageQuota: number; features: string[] };

export default function SettingsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeTenantId, setActiveTenantId] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [newWorkspace, setNewWorkspace] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  // billing
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentPlan, setCurrentPlan] = useState("free");
  const [usage, setUsage] = useState(0);
  const [quota, setQuota] = useState(0);
  const [billingConfigured, setBillingConfigured] = useState(false);

  async function loadAll() {
    const [t, w, b] = await Promise.all([
      fetch("/api/team").then((r) => r.json()),
      fetch("/api/workspaces").then((r) => r.json()),
      fetch("/api/billing").then((r) => r.json()),
    ]);
    setMembers(t.members ?? []);
    setInvites(t.invites ?? []);
    setCanManage(t.canManage ?? false);
    setWorkspaces(w.workspaces ?? []);
    setActiveTenantId(w.activeTenantId ?? "");
    setPlans(b.plans ?? []);
    setCurrentPlan(b.currentPlan ?? "free");
    setUsage(b.usage ?? 0);
    setQuota(b.quota ?? 0);
    setBillingConfigured(b.billingConfigured ?? false);
  }
  useEffect(() => {
    loadAll();
  }, []);

  async function invite() {
    setMsg(null);
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error);
    setInviteEmail("");
    setMsg(data.joined ? "Added to the workspace." : "Invitation created — they'll join when they sign up.");
    loadAll();
  }

  async function removeMember(userId: string) {
    if (!confirm("Remove this member?")) return;
    await fetch(`/api/team?userId=${userId}`, { method: "DELETE" });
    loadAll();
  }
  async function revokeInvite(id: string) {
    await fetch(`/api/team?inviteId=${id}`, { method: "DELETE" });
    loadAll();
  }

  async function switchTo(tenantId: string) {
    await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    window.location.reload();
  }
  async function createWorkspace() {
    if (!newWorkspace.trim()) return;
    await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newWorkspace.trim() }),
    });
    window.location.reload();
  }

  async function upgrade(planId: string) {
    setMsg(null);
    const res = await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error);
    if (data.url) window.location.href = data.url;
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" subtitle="Workspace, team, and billing" />
      {msg && <p className="mb-4 text-sm text-emerald-300">{msg}</p>}

      {/* Workspaces */}
      <Card className="mb-5">
        <h3 className="mb-3 text-sm font-medium text-zinc-300">Workspaces</h3>
        <div className="space-y-2">
          {workspaces.map((w) => (
            <div key={w.tenantId} className="flex items-center justify-between rounded-md border border-zinc-800 px-3 py-2">
              <div>
                <span className="text-sm text-zinc-100">{w.name}</span>
                <span className="ml-2 text-xs text-zinc-500">{w.role}</span>
                {w.tenantId === activeTenantId && (
                  <span className="ml-2 rounded-full bg-emerald-600/25 px-2 py-0.5 text-[11px] text-emerald-300">active</span>
                )}
              </div>
              {w.tenantId !== activeTenantId && (
                <Button variant="secondary" onClick={() => switchTo(w.tenantId)}>
                  Switch
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <Label>Create a new workspace</Label>
            <Input value={newWorkspace} onChange={(e) => setNewWorkspace(e.target.value)} placeholder="Acme Cannabis Co." />
          </div>
          <Button onClick={createWorkspace}>Create</Button>
        </div>
      </Card>

      {/* Team */}
      <Card className="mb-5">
        <h3 className="mb-3 text-sm font-medium text-zinc-300">Team members</h3>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.userId} className="flex items-center justify-between rounded-md border border-zinc-800 px-3 py-2">
              <div>
                <span className="text-sm text-zinc-100">{m.name || m.email}</span>
                {m.isYou && <span className="ml-2 text-xs text-zinc-500">you</span>}
                <span className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">{m.role}</span>
              </div>
              {canManage && !m.isYou && (
                <Button variant="ghost" onClick={() => removeMember(m.userId)}>
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>

        {invites.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-xs text-zinc-500">Pending invitations</p>
            {invites.map((i) => (
              <div key={i.id} className="flex items-center justify-between rounded-md border border-zinc-800/60 px-3 py-2">
                <span className="text-sm text-zinc-400">
                  {i.email} · {i.role}
                </span>
                {canManage && (
                  <Button variant="ghost" onClick={() => revokeInvite(i.id)}>
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {canManage ? (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-48">
              <Label>Invite by email</Label>
              <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="teammate@company.com" />
            </div>
            <div className="w-36">
              <Label>Role</Label>
              <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
            <Button onClick={invite}>Send invite</Button>
          </div>
        ) : (
          <p className="mt-3 text-xs text-zinc-500">Only owners and admins can manage the team.</p>
        )}
      </Card>

      {/* Billing */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-300">Billing & usage</h3>
          {!billingConfigured && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
              Stripe not configured
            </span>
          )}
        </div>
        <div className="mb-4 rounded-md border border-zinc-800 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">This month</span>
            <span className="text-zinc-100">
              {usage.toLocaleString()} / {quota.toLocaleString()} messages
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${Math.min(100, quota ? (usage / quota) * 100 : 0)}%` }}
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`rounded-lg border p-4 ${
                p.id === currentPlan ? "border-emerald-500 bg-emerald-600/10" : "border-zinc-800"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-medium text-zinc-100">{p.name}</span>
                <span className="text-sm text-zinc-400">${p.priceMonthly}/mo</span>
              </div>
              <ul className="mt-2 space-y-1 text-xs text-zinc-500">
                {p.features.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              {p.id === currentPlan ? (
                <p className="mt-3 text-xs font-medium text-emerald-300">Current plan</p>
              ) : p.id !== "free" && canManage ? (
                <Button className="mt-3" onClick={() => upgrade(p.id)}>
                  Upgrade
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
