"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Landmark,
  Link2,
  type LucideIcon,
  PiggyBank,
  Plus,
  ReceiptText,
  RefreshCw,
  UserCheck,
  UsersRound,
} from "lucide-react";
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
  users: DgbProfile[];
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
  users: [],
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

    const [users, members, accounts, balances, transactions, loanRequests, loanProducts, loans, schedules] = await Promise.all([
      supabase.from("users").select("id,email,full_name,role,mfa_enabled").order("created_at", { ascending: true }).returns<DgbProfile[]>(),
      supabase.from("members").select("*").order("created_at", { ascending: false }).returns<MemberRow[]>(),
      supabase.from("accounts").select("*").order("created_at", { ascending: false }).returns<AccountRow[]>(),
      supabase.from("member_account_balances").select("*").returns<BalanceRow[]>(),
      supabase.from("transactions").select("*").order("captured_at", { ascending: false }).limit(75).returns<TransactionRow[]>(),
      supabase.from("loan_requests").select("*").order("submitted_at", { ascending: false }).limit(75).returns<LoanRequestRow[]>(),
      supabase.from("loan_products").select("*").order("name").returns<LoanProductRow[]>(),
      supabase.from("loans").select("*").order("created_at", { ascending: false }).limit(75).returns<LoanRow[]>(),
      supabase.from("repayment_schedules").select("*").order("due_date", { ascending: true }).limit(250).returns<ScheduleRow[]>(),
    ]);

    const failed = [users, members, accounts, balances, transactions, loanRequests, loanProducts, loans, schedules].find((result) => result.error);
    if (failed?.error) {
      setError(failed.error.message);
      setLoading(false);
      return;
    }

    setData({
      users: users.data ?? [],
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
    setMessage(`Created ${fullName} and wallet account ${accountNumber}. If a login exists with that email, it was linked automatically.`);
    await loadData();
  }

  async function linkMemberToUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const form = new FormData(event.currentTarget);
    const memberId = String(form.get("member_id") ?? "");
    const email = String(form.get("user_email") ?? "").trim();

    if (!memberId || !email) {
      setError("Select a member and enter the registered login email.");
      return;
    }

    const { error: rpcError } = await supabase.rpc("link_member_to_user", {
      p_member_id: memberId,
      p_user_email: email,
    });

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    event.currentTarget.reset();
    setMessage("Member profile linked to login user.");
    await loadData();
  }

  async function setUserRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const form = new FormData(event.currentTarget);
    const userId = String(form.get("user_id") ?? "");
    const role = String(form.get("role") ?? "member");

    const { error: rpcError } = await supabase.rpc("set_user_role", {
      p_user_id: userId,
      p_role: role,
    });

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    event.currentTarget.reset();
    setMessage("User role updated.");
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

  async function approveLoanRequest(request: LoanRequestRow) {
    setMessage(null);
    setError(null);
    const account = data.accounts.find((item) => item.member_id === request.member_id && item.status === "active");
    if (!account) {
      setError("This member needs an active wallet account before the loan can be approved.");
      return;
    }

    const { error: rpcError } = await supabase.rpc("approve_loan_request", {
      p_request_id: request.id,
      p_account_id: account.id,
      p_reference: `DGB-LOAN-${request.id.slice(0, 8).toUpperCase()}`,
      p_start_date: new Date().toISOString().slice(0, 10),
      p_notes: "Approved from DGB admin dashboard.",
    });

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setMessage("Loan request approved. Loan, disbursement transaction and repayment schedule were created.");
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

  async function captureRepayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const form = new FormData(event.currentTarget);
    const loanId = String(form.get("loan_id") ?? "");
    const amountCents = parseMoneyToCents(form.get("amount"));
    const reference = String(form.get("reference") ?? "").trim();
    const memo = String(form.get("memo") ?? "").trim();
    const loan = data.loans.find((item) => item.id === loanId);
    const account = loan ? data.accounts.find((item) => item.member_id === loan.member_id && item.status === "active") : null;

    if (!loan || !account || !amountCents || !reference) {
      setError("Select an open loan, enter a positive repayment amount, and add a reference.");
      return;
    }

    const { error: rpcError } = await supabase.rpc("capture_repayment", {
      p_loan_id: loan.id,
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
    setMessage(`Captured repayment of ${formatMoney(amountCents)}.`);
    await loadData();
  }

  const openLoans = data.loans.filter((loan) => ["active", "overdue", "approved"].includes(loan.status));

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="grid gap-5 lg:grid-cols-[1fr_0.72fr] lg:items-stretch">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.07] p-6 shadow-2xl shadow-black/20">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-200">Admin command centre</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.055em] sm:text-5xl">Live DGB fund operations</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
              Manage members, logins, wallets, contributions, loan approvals and repayments directly against Supabase. Financial movements are captured through server-side database functions so ledger rows remain immutable and auditable.
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
          <MetricCard icon={UsersRound} label="Members" value={String(data.members.length)} detail={`${data.users.length} registered login users`} />
          <MetricCard icon={Landmark} label="Loans outstanding" value={formatMoney(metrics.outstanding)} detail="Schedule amount due less paid" />
          <MetricCard icon={ReceiptText} label="Arrears" value={formatMoney(metrics.arrears)} detail="Past-due unpaid schedule rows" />
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <Panel title="Create member and wallet" subtitle="Creates a protected member row and linked DGB wallet account.">
            <form onSubmit={createMember} className="grid gap-3">
              <Field name="member_number" label="Member number" placeholder="DGB-0001" />
              <Field name="account_number" label="Account number" placeholder="DGB-0001-WALLET" />
              <Field name="full_name" label="Full name" placeholder="Member full name" required />
              <Field name="email" label="Email" placeholder="member@example.com" type="email" required />
              <Field name="phone" label="Phone" placeholder="+27..." />
              <button className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-400 px-5 text-sm font-black text-slate-950" type="submit">
                <Plus className="h-4 w-4" /> Create member
              </button>
            </form>
          </Panel>

          <Panel title="Link member login" subtitle="Connects a registered login email to an existing member profile.">
            <form onSubmit={linkMemberToUser} className="grid gap-3">
              <label className="block text-sm font-black text-slate-200">
                Member
                <select name="member_id" required className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none">
                  <option value="">Select member</option>
                  {data.members.map((member) => (
                    <option key={member.id} value={member.id} className="bg-slate-950">
                      {member.full_name} · {member.user_id ? "linked" : "not linked"}
                    </option>
                  ))}
                </select>
              </label>
              <Field name="user_email" label="Registered login email" placeholder="member@example.com" type="email" required />
              <button className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-black text-slate-950" type="submit">
                <Link2 className="h-4 w-4" /> Link login
              </button>
            </form>
          </Panel>

          <Panel title="Set user role" subtitle="Only super admins can promote finance admins or viewers.">
            <form onSubmit={setUserRole} className="grid gap-3">
              <label className="block text-sm font-black text-slate-200">
                Login user
                <select name="user_id" required className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none">
                  <option value="">Select user</option>
                  {data.users.map((user) => (
                    <option key={user.id} value={user.id} className="bg-slate-950">
                      {user.full_name} · {user.email} · {user.role.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-black text-slate-200">
                Role
                <select name="role" required className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none">
                  <option value="member" className="bg-slate-950">Member</option>
                  <option value="viewer" className="bg-slate-950">Viewer</option>
                  <option value="finance_admin" className="bg-slate-950">Finance admin</option>
                  <option value="super_admin" className="bg-slate-950">Super admin</option>
                </select>
              </label>
              <button className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-yellow-300 px-5 text-sm font-black text-slate-950" type="submit">
                <UserCheck className="h-4 w-4" /> Update role
              </button>
            </form>
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
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

          <Panel title="Capture repayment" subtitle="Applies payment to the oldest unpaid schedule rows and posts repayment ledger entries.">
            <form onSubmit={captureRepayment} className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-black text-slate-200 sm:col-span-2">
                Open loan
                <select name="loan_id" required className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none">
                  <option value="">Select loan</option>
                  {openLoans.map((loan) => (
                    <option key={loan.id} value={loan.id} className="bg-slate-950">
                      {memberName(loan.member_id, data.members)} · {formatMoney(loan.principal_cents)} · {loan.status}
                    </option>
                  ))}
                </select>
              </label>
              <Field name="amount" label="Amount" placeholder="1000.00" required />
              <Field name="reference" label="Payment reference" placeholder="EFT-REPAY-001" required />
              <label className="block text-sm font-black text-slate-200 sm:col-span-2">
                Memo
                <textarea name="memo" placeholder="Optional note" className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none" />
              </label>
              <button className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-400 px-5 text-sm font-black text-slate-950 sm:col-span-2" type="submit">
                <CheckCircle2 className="h-4 w-4" /> Capture repayment
              </button>
            </form>
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Panel title="Members and balances" subtitle="Balances are calculated from member_account_balances, not typed manually.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Member</th>
                    <th className="px-3 py-3">Contact</th>
                    <th className="px-3 py-3">Login</th>
                    <th className="px-3 py-3">Account</th>
                    <th className="px-3 py-3">Balance</th>
                    <th className="px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {data.members.map((member) => {
                    const account = data.accounts.find((item) => item.member_id === member.id);
                    const balance = data.balances.find((item) => item.member_id === member.id)?.balance_cents ?? 0;
                    const linkedUser = data.users.find((user) => user.id === member.user_id);
                    return (
                      <tr key={member.id}>
                        <td className="px-3 py-4 font-black text-white">{member.full_name}<br /><span className="text-xs font-bold text-slate-500">{member.member_number}</span></td>
                        <td className="px-3 py-4 text-slate-300">{member.email}<br />{member.phone ?? "—"}</td>
                        <td className="px-3 py-4 text-slate-300">{linkedUser ? <Pill status={linkedUser.role} /> : <span className="text-slate-500">Not linked</span>}</td>
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

          <Panel title="Loan requests" subtitle="Approve creates a loan, disbursement transaction and schedule.">
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
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => approveLoanRequest(request)} className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-xs font-black text-emerald-100">
                        Approve + generate schedule
                      </button>
                      <button type="button" onClick={() => rejectLoanRequest(request.id)} className="rounded-full border border-rose-300/25 bg-rose-400/10 px-4 py-2 text-xs font-black text-rose-100">
                        Reject request
                      </button>
                    </div>
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

function MetricCard({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
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
