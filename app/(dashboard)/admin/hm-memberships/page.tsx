"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Membership {
  id: string;
  userId: string;
  email: string;
  companyId: string;
  role: string;
  isActive: boolean;
  grantedAt: string;
  grantedBy: string | null;
  expiresAt: string | null;
  company: { id: string; name: string; logoUrl: string | null };
}

interface Company {
  id: string;
  name: string;
}

export default function AdminHmMembershipsPage() {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Grant form state
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    userId: "",
    email: "",
    companyId: "",
    role: "viewer",
    expiresAt: "",
  });

  useEffect(() => {
    fetchMemberships();
    fetchCompanies();
  }, []);

  async function fetchMemberships() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/hm-memberships");
      if (!res.ok) throw new Error("Failed to fetch memberships");
      const data = await res.json();
      setMemberships(data.memberships || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load memberships");
    } finally {
      setLoading(false);
    }
  }

  async function fetchCompanies() {
    try {
      const res = await fetch("/api/companies");
      if (res.ok) {
        const data = await res.json();
        setCompanies(
          Array.isArray(data)
            ? data
            : Array.isArray(data.companies)
            ? data.companies
            : []
        );
      }
    } catch {
      // Non-critical, select will just be empty
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this membership? The user will lose access.")) return;
    setRevokingId(id);
    try {
      const res = await fetch(`/api/admin/hm-memberships?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Revoke failed");
      }
      await fetchMemberships();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setRevokingId(null);
    }
  }

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.userId || !formData.email || !formData.companyId) {
      setFormError("User ID, email, and company are required.");
      return;
    }
    setFormLoading(true);
    setFormError(null);
    try {
      const res = await fetch("/api/admin/hm-memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: formData.userId,
          email: formData.email,
          companyId: formData.companyId,
          role: formData.role,
          expiresAt: formData.expiresAt || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to grant membership");
      }
      setFormData({ userId: "", email: "", companyId: "", role: "viewer", expiresAt: "" });
      setShowForm(false);
      await fetchMemberships();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Grant failed");
    } finally {
      setFormLoading(false);
    }
  }

  const ROLE_COLORS: Record<string, string> = {
    viewer: "bg-zinc-700 text-zinc-300",
    editor: "bg-blue-900/50 text-blue-400",
    admin: "bg-violet-900/50 text-violet-400",
  };

  const inputClass =
    "w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500";

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">HM Memberships</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage hiring manager access to companies
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 text-sm font-medium rounded-md bg-violet-600 hover:bg-violet-500 text-white transition-colors"
          >
            {showForm ? "Cancel" : "Grant Membership"}
          </button>
          <Link
            href="/admin"
            className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
          >
            Back to Admin
          </Link>
        </div>
      </div>

      {/* Sub-nav */}
      <div className="flex gap-3 mb-6 text-sm">
        <Link href="/admin/interview-templates" className="text-zinc-400 hover:text-white">Templates</Link>
        <Link href="/admin/interview-analytics" className="text-zinc-400 hover:text-white">Analytics</Link>
        <Link href="/admin/shared-reports" className="text-zinc-400 hover:text-white">Shared Reports</Link>
        <Link href="/admin/hm-memberships" className="text-violet-400 font-medium">HM Memberships</Link>
      </div>

      {/* Grant Form */}
      {showForm && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 mb-6">
          <h2 className="text-sm font-medium text-white mb-4">Grant New Membership</h2>
          <form onSubmit={handleGrant} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">User ID</label>
                <input
                  className={inputClass}
                  placeholder="Supabase user ID"
                  value={formData.userId}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, userId: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Email</label>
                <input
                  type="email"
                  className={inputClass}
                  placeholder="user@example.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Company</label>
                <select
                  className={inputClass}
                  value={formData.companyId}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, companyId: e.target.value }))
                  }
                >
                  <option value="">Select company...</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Role</label>
                <select
                  className={inputClass}
                  value={formData.role}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, role: e.target.value }))
                  }
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Expires (optional)
                </label>
                <input
                  type="date"
                  className={inputClass}
                  value={formData.expiresAt}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, expiresAt: e.target.value }))
                  }
                />
              </div>
            </div>
            {formError && (
              <p className="text-sm text-red-400">{formError}</p>
            )}
            <button
              type="submit"
              disabled={formLoading}
              className="px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
            >
              {formLoading ? "Granting..." : "Grant Membership"}
            </button>
          </form>
        </div>
      )}

      {/* Memberships List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-violet-500" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-800 bg-red-950/50 p-6 text-center">
          <p className="text-red-400">{error}</p>
          <button
            onClick={fetchMemberships}
            className="mt-3 text-sm text-red-300 hover:text-white underline"
          >
            Try again
          </button>
        </div>
      ) : memberships.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-12 text-center">
          <p className="text-zinc-400">No memberships found.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase">
                    Email
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase">
                    Company
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase">
                    Role
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-zinc-500 uppercase">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase">
                    Granted
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase">
                    Expires
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {memberships.map((m) => (
                  <tr key={m.id} className="hover:bg-zinc-800/50 transition-colors">
                    <td className="px-4 py-3 text-white">{m.email}</td>
                    <td className="px-4 py-3 text-zinc-300">{m.company.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          ROLE_COLORS[m.role] || "bg-zinc-700 text-zinc-300"
                        }`}
                      >
                        {m.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          m.isActive
                            ? "bg-emerald-900/50 text-emerald-400"
                            : "bg-red-900/50 text-red-400"
                        }`}
                      >
                        {m.isActive ? "Active" : "Revoked"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {new Date(m.grantedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {m.expiresAt
                        ? new Date(m.expiresAt).toLocaleDateString()
                        : "Never"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {m.isActive ? (
                        <button
                          onClick={() => handleRevoke(m.id)}
                          disabled={revokingId === m.id}
                          className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
                        >
                          {revokingId === m.id ? "Revoking..." : "Revoke"}
                        </button>
                      ) : (
                        <span className="text-xs text-zinc-500">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
