"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertTriangle, Banknote, Landmark, PiggyBank, Plus, ReceiptText, RefreshCw, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/dgb/auth-gate";
import { DgbAppShell } from "@/components/dgb/app-shell";
import {
  type AccountRow,
  type BalanceRow,
  type DgbProfile,
  formatMoney,
  type LoanProductRow,
  type LoanRequestRow,
  type LoanRow,
  type MemberRow,
  parseMoneyToCents,
  type ScheduleRow,
  shortDate,
  statusClassName,
  type TransactionRow,
} from "@/lib/dgb-live";

type AdminData = {
  members: MemberRow[];
  accounts: AccountRow[];
  balances: BalanceRow[];
  transactions: TransactionRow[];
  loanRequests: LoanRequestRow[];
  loanProducts: LoanProductRow[];
  loans: LoanRow[];
  schedules: ScheduleRow[];
};

const emptyData: AdminData = {
  members: [],
  accounts: [],
  balances: [],
  transactions: [],
  loanRequests: [],
  loanProducts: [],
  loans: [],
  schedules: [],
};

export default function AdminPage() {
  return (
    <AuthGate adminOnly>
      {({ supabase, profile }) => (
        <DgbAppShell supabase={supabase} profile={profile}>
          <AdminDashboard supabase={supabase} profile={profile} />
        </DgbAppShell>
      )}
    </AuthGate>
  );
}

function AdminDashboard({ supabase, profile }: { supabase: SupabaseClient; profile: DgbProfile }) {
  const [data, setData] = useState<AdminData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [members, accounts, balances, transactions, loanRequests, loanProducts, loans, schedules] = await Promise.all([
      supabase.from("members").select("*").order("created_at", { ascending: false }).returns<MemberRow[]>(),
      supabase.from("accounts").select("*").order("created_at", { ascending: false }).returns<AccountRow[]>(),
      supabase.from("member_account_balances").select("*").returns<BalanceRow[]>(),
      supabase.from("transactions").select("*").order("captured_at", { ascending: false }).limit(50).returns<TransactionRow[]>(),
      supabase.from("loan_requests").select("*").order("submitted_at", { ascending: false }).limit(50).returns<LoanRequestRow[]>(),
      supabase.from("loan_products").select("*").order("name").returns<LoanProductRow[]>(),
      supabase.from("loans").select("*").order("created_at", { ascending: false }).limit(50).returns<LoanRow[]>(),
      supabase.from("repayment_schedules").select("*").order("due_date", { ascending: true }).limit(100).returns<ScheduleRow[]>(),
    ]);

    const failed = [members, accounts, balances, transactions, loanRequests, loanProducts, loans, schedules].find((result) => result.error);
    if (failed?.error) {
      setError(failed.error.message);
      setLoading(false);
      return;
    }

    setData({
      members: members.data ?? [],
      accounts: accounts.data ?? [],
      balances: balances.data ?? [],
      transactions: transactions.data ?? [],
      loanRequests: loanRequests.data ?? [],
      loanProducts: loanProducts.data ?? [],
      loans: loans.data ?? [],
      schedules: schedules.data ?? [],
    });
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const metrics = useMemo(() => calculateAdminMetrics(data), [data]);

  async function createMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const form = new FormData(event.currentTarget);
    const memberNumber = String(form.get("member_number") ?? "").trim() || `DGB-${Date.now().toString().slice(-6)}`;
    const fullName = String(form.get("full_name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const accountNumber = String(form.get("account_number") ?? "").trim() || `${memberNumber}-WALLET`;

    if (!fullName || !email) {
      setError("Member name and email are required.");
      return;
    }

    const { error: rpcError } = await supabase.rpc("create_member_with_account", {
      p_member_number: memberNumber,
      p_full_name: fullName,
      p_email: email,
      p_phone: phone || null,
      p_account_number: accountNumber,
      p_created_by: profile.id,
    });

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    event.currentTarget.reset();
    setMessage(`Created ${fullName} and wallet account ${accountNumber}.`);
    await loadData();
  }

  async function captureContribution(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const form = new FormData(event.currentTarget);
    const accountId = String(form.get("account_id") ?? "");
    const account = data.accounts.find((item) => item.id === accountId);
    const amountCents = parseMoneyToCents(form.get("amount"));
    const reference = String(form.get("reference") ?? "").trim();
    const memo = String(form.get("memo") ?? "").trim();

    if (!account || !amountCents || !reference) {
      setError("Select an account, enter a positive amount, and add a payment reference.");
      return;
    }

    const { error: rpcError } = await supabase.rpc("capture_contribution", {
      p_member_id: account.member_id,
      p_account_id: account.id,
      p_amount_cents: amountCents,
      p_reference: reference,
      p_memo: memo || null,
    });

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    event.currentTarget.reset();
    setMessage(`Captured contribution of ${formatMoney(amountCents)}.`);
    await loadData();
  }

  async function rejectLoanRequest(requestId: string) {
    setMessage(null);
    setError(null);
    const { error: updateError } = await supabase
      .from("loan_requests")
      .update({ status: "rejected", reviewed_by: profile.id, reviewed_at: new Date().toISOString(), review_notes: "Rejected from admin dashboard." })
      .eq("id", requestId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage("Loan request rejected and audited.");
    await loadData();
  }

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="grid gap-5 lg:grid-cols-[1fr_0.72fr] lg:items-stretch">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.07] p-6 shadow-2xl shadow-black/20">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-200">Admin command centre</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.055em] sm:text-5xl">Live DGB fund operations</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
              Manage members, wallets, contributions and loan requests directly against Supabase. Financial movements are captured through server-side database functions so ledger rows remain immutable and auditable.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={loadData} className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-5 py-3 text-sm font-black text-slate-950">
                <RefreshCw className="h-4 w-4" /> Refresh live data
              </button>
              {loading ? <span className="rounded-full border border-white/10 bg-white/8 px-4 py-3 text-sm text-slate-300">Loading...</span> : null}
            </div>
          </div>

          <div className="rounded-[2rem] border border-yellow-300/20 bg-yellow-300/10 p-6 text-yellow-50">
            <div className="flex gap-3">
              <AlertTriangle className="mt-1 h-6 w-6 shrink-0 text-yellow-200" />
              <div>
                <h2 className="text-xl font-black">Compliance reminder</h2>
                <p className="mt-3 text-sm leading-6 text-yellow-50/85">
                  Before real-money use, confirm legal structure, written member agreements, credit-provider requirements, POPIA controls, tax/accounting treatment, banking controls and backup/export procedures.
                </p>
              </div>
            </div>
          </div>
        </section>

        {message ? <Notice tone="success" message={message} /> : null}
        {error ? <Notice tone="error" message={error} /> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={PiggyBank} label="Available cash" value={formatMoney(metrics.availableCash)} detail="Credits less debits in the ledger" />
          <MetricCard icon={UsersRound} label="Members" value={String(data.members.length)} detail="Active and pending DGB members" />
          <MetricCard icon={Landmark} label="Loans outstanding" value={formatMoney(metrics.outstanding)} detail="Schedule amount due less paid" />
          <MetricCard icon={ReceiptText} label="Arrears" value={formatMoney(metrics.arrears)} detail="Past-due unpaid schedule rows" />
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Panel title="Create member and wallet" subtitle="Creates a protected member row and linked DGB wallet account.">
            <form onSubmit={createMember} className="grid gap-3 sm:grid-cols-2">
              <Field name="member_number" label="Member number" placeholder="DGB-0001" />
              <Field name="account_number" label="Account number" placeholder="DGB-0001-WALLET" />
              <Field name="full_name" label="Full name" placeholder="Member full name" required />
              <Field name="email" label="Email" placeholder="member@example.com" type="email" required />
              <Field name="phone" label="Phone" placeholder="+27..." />
              <button className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-400 px-5 text-sm font-black text-slate-950 sm:mt-auto" type="submit">
                <Plus className="h-4 w-4" /> Create member
              </button>
            </form>
          </Panel>

          <Panel title="Capture contribution" subtitle="Posts an immutable contribution transaction and contribution record atomically.">
            <form onSubmit={captureContribution} className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-black text-slate-200 sm:col-span-2">
                Member wallet
                <select name="account_id" required className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none">
                  <option value="">Select account</option>
                  {data.accounts.map((account) => (
                    <option key={account.id} value={account.id} className="bg-slate-950">
                      {memberName(account.member_id, data.members)} · {account.account_number}
                    </option>
                  ))}
                </select>
              </label>
              <Field name="amount" label="Amount" placeholder="1500.00" required />
              <Field name="reference" label="Bank reference" placeholder="EFT-REF-001" required />
              <label className="block text-sm font-black text-slate-200 sm:col-span-2">
                Memo
                <textarea name="memo" placeholder="Optional note" className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none" />
              </label>
              <button className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-yellow-300 px-5 text-sm font-black text-slate-950 sm:col-span-2" type="submit">
                <Banknote className="h-4 w-4" /> Capture contribution
              </button>
            </form>
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Panel title="Members and balances" subtitle="Balances are calculated from member_account_balances, not typed manually.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Member</th>
                    <th className="px-3 py-3">Contact</th>
                    <th className="px-3 py-3">Account</th>
                    <th className="px-3 py-3">Balance</th>
                    <th className="px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {data.members.map((member) => {
                    const account = data.accounts.find((item) => item.member_id === member.id);
                    const balance = data.balances.find((item) => item.member_id === member.id)?.balance_cents ?? 0;
                    return (
                      <tr key={member.id}>
                        <td className="px-3 py-4 font-black text-white">{member.full_name}<br /><span className="text-xs font-bold text-slate-500">{member.member_number}</span></td>
                        <td className="px-3 py-4 text-slate-300">{member.email}<br />{member.phone ?? "—"}</td>
                        <td className="px-3 py-4 text-slate-300">{account?.account_number ?? "No wallet yet"}</td>
                        <td className="px-3 py-4 font-black text-emerald-200">{formatMoney(balance)}</td>
                        <td className="px-3 py-4"><Pill status={member.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Loan requests" subtitle="Members submit requests; finance admins review and process them.">
            <div className="space-y-3">
              {data.loanRequests.length === 0 ? <Empty label="No loan requests yet." /> : null}
              {data.loanRequests.map((request) => (
                <div key={request.id} className="rounded-3xl border border-white/10 bg-black/15 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-white">{memberName(request.member_id, data.members)}</p>
                      <p className="mt-1 text-sm text-slate-400">{formatMoney(request.requested_amount_cents)} over {request.requested_term_months} months</p>
                    </div>
                    <Pill status={request.status} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{request.purpose}</p>
                  <p className="mt-2 text-xs text-slate-500">Submitted {shortDate(request.submitted_at)}</p>
                  {request.status === "pending" ? (
                    <button type="button" onClick={() => rejectLoanRequest(request.id)} className="mt-3 rounded-full border border-rose-300/25 bg-rose-400/10 px-4 py-2 text-xs font-black text-rose-100">
                      Reject request
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <Panel title="Recent ledger transactions" subtitle="Immutable movement log. Corrections must be posted as reversing entries.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Member</th>
                  <th className="px-3 py-3">Kind</th>
                  <th className="px-3 py-3">Reference</th>
                  <th className="px-3 py-3">Direction</th>
                  <th className="px-3 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {data.transactions.length === 0 ? (
                  <tr><td className="px-3 py-6 text-slate-400" colSpan={6}>No ledger entries captured yet.</td></tr>
                ) : null}
                {data.transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="px-3 py-4 text-slate-400">{shortDate(transaction.captured_at)}</td>
                    <td className="px-3 py-4 text-white">{memberName(transaction.member_id, data.members)}</td>
                    <td className="px-3 py-4 capitalize text-slate-300">{transaction.kind.replace("_", " ")}</td>
                    <td className="px-3 py-4 text-slate-300">{transaction.reference}</td>
                    <td className="px-3 py-4"><Pill status={transaction.direction} /></td>
                    <td className="px-3 py-4 text-right font-black text-white">{formatMoney(transaction.amount_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function calculateAdminMetrics(data: AdminData) {
  const availableCash = data.transactions.reduce((total, transaction) => total + (transaction.direction === "credit" ? transaction.amount_cents : -transaction.amount_cents), 0);
  const outstanding = data.schedules.reduce((total, schedule) => total + Math.max(schedule.amount_due_cents - schedule.paid_cents, 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const arrears = data.schedules
    .filter((schedule) => schedule.due_date < today && schedule.paid_cents < schedule.amount_due_cents)
    .reduce((total, schedule) => total + (schedule.amount_due_cents - schedule.paid_cents), 0);
  return { availableCash, outstanding, arrears };
}

function memberName(memberId: string, members: MemberRow[]) {
  return members.find((member) => member.id === memberId)?.full_name ?? "Unknown member";
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/10">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-black tracking-[-0.03em] text-white">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, name, placeholder, type = "text", required = false }: { label: string; name: string; placeholder?: string; type?: string; required?: boolean }) {
  return (
    <label className="block text-sm font-black text-slate-200">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-300/30"
      />
    </label>
  );
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: typeof PiggyBank; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5">
      <Icon className="h-6 w-6 text-emerald-200" />
      <p className="mt-4 text-sm font-bold text-slate-400">{label}</p>
      <p className="mt-1 text-3xl font-black tracking-[-0.04em] text-white">{value}</p>
      <p className="mt-3 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function Notice({ tone, message }: { tone: "success" | "error"; message: string }) {
  const className = tone === "success" ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100" : "border-rose-300/20 bg-rose-400/10 text-rose-100";
  return <div className={`rounded-3xl border p-4 text-sm font-bold ${className}`}>{message}</div>;
}

function Pill({ status }: { status: string }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-black capitalize ring-1 ${statusClassName(status)}`}>{status.replace("_", " ")}</span>;
}

function Empty({ label }: { label: string }) {
  return <div className="rounded-3xl border border-dashed border-white/10 p-6 text-sm text-slate-400">{label}</div>;
}
