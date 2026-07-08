"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Banknote,
  CheckCircle2,
  Landmark,
  Link2,
  type LucideIcon,
  Percent,
  PiggyBank,
  Plus,
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
  type InterestEarningRow,
  type LoanInterestMethod,
  type LoanProductRow,
  type LoanRequestRow,
  type LoanRow,
  type MemberRow,
  parseMoneyToCents,
  parsePercent,
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
  interestEarnings: InterestEarningRow[];
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
  interestEarnings: [],
  transactions: [],
  loanRequests: [],
  loanProducts: [],
  loans: [],
  schedules: [],
};

type AdminSection = "overview" | "members" | "money" | "loans" | "ledger";

const adminSections: { id: AdminSection; label: string; hint: string }[] = [
  { id: "overview", label: "Overview", hint: "What needs attention" },
  { id: "members", label: "Members", hint: "Create, link and roles" },
  { id: "money", label: "Money", hint: "Contributions and repayments" },
  { id: "loans", label: "Loans", hint: "Requests, rates and products" },
  { id: "ledger", label: "Ledger", hint: "Recent transactions" },
];

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
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [users, members, accounts, balances, interestEarnings, transactions, loanRequests, loanProducts, loans, schedules] = await Promise.all([
      supabase.from("users").select("id,email,full_name,role,mfa_enabled").order("created_at", { ascending: true }).returns<DgbProfile[]>(),
      supabase.from("members").select("*").order("created_at", { ascending: false }).returns<MemberRow[]>(),
      supabase.from("accounts").select("*").order("created_at", { ascending: false }).returns<AccountRow[]>(),
      supabase.from("member_account_balances").select("*").returns<BalanceRow[]>(),
      supabase.from("member_interest_earnings").select("*").returns<InterestEarningRow[]>(),
      supabase.from("transactions").select("*").order("captured_at", { ascending: false }).limit(75).returns<TransactionRow[]>(),
      supabase.from("loan_requests").select("*").order("submitted_at", { ascending: false }).limit(75).returns<LoanRequestRow[]>(),
      supabase.from("loan_products").select("*").order("name").returns<LoanProductRow[]>(),
      supabase.from("loans").select("*").order("created_at", { ascending: false }).limit(75).returns<LoanRow[]>(),
      supabase.from("repayment_schedules").select("*").order("due_date", { ascending: true }).limit(250).returns<ScheduleRow[]>(),
    ]);

    const failed = [users, members, accounts, balances, interestEarnings, transactions, loanRequests, loanProducts, loans, schedules].find((result) => result.error);
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
      interestEarnings: interestEarnings.data ?? [],
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
  const unlinkedMembers = useMemo(() => data.members.filter((member) => !member.user_id), [data.members]);
  const pendingMemberLogins = useMemo(
    () => data.users.filter((user) => user.role === "member" && !data.members.some((member) => member.user_id === user.id)),
    [data.members, data.users],
  );

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

  async function createMemberFromLogin(event: React.FormEvent<HTMLFormElement>, user: DgbProfile) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const form = new FormData(event.currentTarget);
    const memberNumber = String(form.get("member_number") ?? "").trim() || `DGB-${user.id.slice(0, 8).toUpperCase()}`;
    const fullName = String(form.get("full_name") ?? "").trim() || user.full_name || user.email;
    const phone = String(form.get("phone") ?? "").trim();
    const accountNumber = `${memberNumber}-WALLET`;

    const { error: rpcError } = await supabase.rpc("create_member_with_account", {
      p_member_number: memberNumber,
      p_full_name: fullName,
      p_email: user.email,
      p_phone: phone || null,
      p_account_number: accountNumber,
      p_created_by: profile.id,
    });

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    event.currentTarget.reset();
    setMessage(`Created and linked member profile for ${user.email}. They can now open the member portal.`);
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

  async function upsertLoanProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const form = new FormData(event.currentTarget);
    const productId = String(form.get("product_id") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const annualRate = parsePercent(form.get("annual_interest_rate"));
    const interestMethod = String(form.get("interest_method") ?? "reducing_balance") as LoanInterestMethod;
    const maxTermMonths = Number(form.get("max_term_months"));
    const adminFeeCents = parseMoneyToCents(form.get("admin_fee")) ?? 0;
    const penaltyRate = parsePercent(form.get("penalty_rate")) ?? 0;
    const active = form.get("active") === "on";

    if (!name || annualRate === null || !Number.isFinite(maxTermMonths) || maxTermMonths <= 0) {
      setError("Product name, annual interest rate and maximum term are required.");
      return;
    }

    const { error: rpcError } = await supabase.rpc("upsert_loan_product", {
      p_product_id: productId || null,
      p_name: name,
      p_annual_interest_rate: annualRate,
      p_interest_method: interestMethod,
      p_max_term_months: maxTermMonths,
      p_admin_fee_cents: adminFeeCents,
      p_penalty_rate: penaltyRate,
      p_active: active,
    });

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    event.currentTarget.reset();
    setMessage(productId ? "Loan product and rate updated." : "Loan product and rate created.");
    await loadData();
  }

  async function approveLoanRequest(event: React.FormEvent<HTMLFormElement>, request: LoanRequestRow) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const form = new FormData(event.currentTarget);
    const account = data.accounts.find((item) => item.member_id === request.member_id && item.status === "active");
    const product = data.loanProducts.find((item) => item.id === request.loan_product_id);
    const annualRate = parsePercent(form.get("annual_interest_rate"));
    const adminFeeCents = parseMoneyToCents(form.get("admin_fee")) ?? 0;

    if (!account) {
      setError("This member needs an active wallet account before the loan can be approved.");
      return;
    }

    if (!product || annualRate === null) {
      setError("Choose a valid loan product and interest rate before approval.");
      return;
    }

    const { error: rpcError } = await supabase.rpc("approve_loan_request", {
      p_request_id: request.id,
      p_account_id: account.id,
      p_reference: `DGB-LOAN-${request.id.slice(0, 8).toUpperCase()}`,
      p_start_date: new Date().toISOString().slice(0, 10),
      p_notes: "Approved from DGB admin dashboard.",
      p_annual_interest_rate: annualRate,
      p_interest_method: product.interest_method,
      p_admin_fee_cents: adminFeeCents,
    });

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setMessage(`Loan request approved at ${annualRate}% annual interest. Principal left the pooled cash and future interest will be distributed by member pool share.`);
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
  const pendingLoanRequests = data.loanRequests.filter((request) => request.status === "pending");
  const linkedMemberCount = data.members.filter((member) => member.user_id).length;
  const pendingActionCount = pendingMemberLogins.length + pendingLoanRequests.length;
  const sectionAlertCounts: Record<AdminSection, number> = {
    overview: pendingActionCount,
    members: pendingMemberLogins.length,
    money: 0,
    loans: pendingLoanRequests.length,
    ledger: 0,
  };

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.07] p-5 shadow-2xl shadow-black/20 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-200">DGB admin</p>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.045em] text-white sm:text-4xl">Simple finance control panel</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                Choose a task area below. Member setup, money movements, loan approvals and ledger review are now separated so the screen stays focused.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {pendingActionCount > 0 ? (
                <span className="rounded-full border border-yellow-300/25 bg-yellow-300/10 px-4 py-3 text-sm font-black text-yellow-100">
                  {pendingActionCount} item{pendingActionCount === 1 ? "" : "s"} need attention
                </span>
              ) : (
                <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm font-black text-emerald-100">No urgent admin tasks</span>
              )}
              <button type="button" onClick={() => void loadData()} className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-5 py-3 text-sm font-black text-slate-950">
                <RefreshCw className="h-4 w-4" /> {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
        </section>

        {message ? <Notice tone="success" message={message} /> : null}
        {error ? <Notice tone="error" message={error} /> : null}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={PiggyBank} label="Available cash" value={formatMoney(metrics.availableCash)} detail="Ledger credits less debits" />
          <MetricCard icon={UsersRound} label="Members linked" value={`${linkedMemberCount}/${data.members.length}`} detail={`${pendingMemberLogins.length} pending login${pendingMemberLogins.length === 1 ? "" : "s"}`} />
          <MetricCard icon={Landmark} label="Loans outstanding" value={formatMoney(metrics.outstanding)} detail={`${openLoans.length} open loan${openLoans.length === 1 ? "" : "s"}`} />
          <MetricCard icon={Percent} label="Interest distributed" value={formatMoney(metrics.interestDistributed)} detail="Credited to funding members" />
        </section>

        <nav className="sticky top-[5.5rem] z-20 rounded-[1.6rem] border border-white/10 bg-[#06111f]/92 p-2 shadow-xl shadow-black/20 backdrop-blur-xl">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {adminSections.map((section) => {
              const isActive = activeSection === section.id;
              const count = sectionAlertCounts[section.id];
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={`rounded-[1.2rem] border px-4 py-3 text-left transition ${
                    isActive
                      ? "border-emerald-300/35 bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/15"
                      : "border-white/10 bg-white/[0.06] text-slate-200 hover:bg-white/[0.1]"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-black">
                    {section.label}
                    {count > 0 ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs ${isActive ? "bg-slate-950/15 text-slate-950" : "bg-yellow-300/15 text-yellow-100"}`}>{count}</span>
                    ) : null}
                  </span>
                  <span className={`mt-1 block text-xs ${isActive ? "text-slate-800" : "text-slate-500"}`}>{section.hint}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {activeSection === "overview" ? (
          <section className="grid gap-5 xl:grid-cols-[1fr_0.78fr]">
            <Panel title="Start here" subtitle="The admin panel now shows the next actions first. Choose a row to jump to the right workspace.">
              <div className="space-y-3">
                <button type="button" onClick={() => setActiveSection("members")} className="flex w-full items-center justify-between gap-4 rounded-3xl border border-white/10 bg-black/15 p-4 text-left">
                  <span>
                    <span className="block font-black text-white">Pending member logins</span>
                    <span className="mt-1 block text-sm text-slate-400">Create a member profile or link a login to an existing member.</span>
                  </span>
                  <span className="rounded-full bg-yellow-300 px-3 py-1 text-sm font-black text-slate-950">{pendingMemberLogins.length}</span>
                </button>
                <button type="button" onClick={() => setActiveSection("loans")} className="flex w-full items-center justify-between gap-4 rounded-3xl border border-white/10 bg-black/15 p-4 text-left">
                  <span>
                    <span className="block font-black text-white">Loan requests awaiting review</span>
                    <span className="mt-1 block text-sm text-slate-400">Approve with a rate, or reject with an audit trail.</span>
                  </span>
                  <span className="rounded-full bg-yellow-300 px-3 py-1 text-sm font-black text-slate-950">{pendingLoanRequests.length}</span>
                </button>
                <button type="button" onClick={() => setActiveSection("money")} className="flex w-full items-center justify-between gap-4 rounded-3xl border border-white/10 bg-black/15 p-4 text-left">
                  <span>
                    <span className="block font-black text-white">Capture money movement</span>
                    <span className="mt-1 block text-sm text-slate-400">Post contributions and loan repayments through protected RPCs.</span>
                  </span>
                  <Banknote className="h-5 w-5 text-emerald-200" />
                </button>
              </div>
            </Panel>

            <Panel title="Operating rules" subtitle="Plain-English guardrails for the finance admin.">
              <div className="space-y-3 text-sm leading-6 text-slate-300">
                <div className="rounded-3xl border border-emerald-300/15 bg-emerald-400/5 p-4">
                  <p className="font-black text-emerald-100">Ledger-first</p>
                  <p className="mt-1">Balances are calculated from transactions. Do not edit balances directly.</p>
                </div>
                <div className="rounded-3xl border border-yellow-300/20 bg-yellow-300/10 p-4 text-yellow-50">
                  <p className="font-black">Before real-money use</p>
                  <p className="mt-1">Confirm member agreements, POPIA controls, accounting/tax treatment and lending compliance.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-black/15 p-4">
                  <p className="font-black text-white">Arrears watch</p>
                  <p className="mt-1">Current overdue scheduled amount: <span className="font-black text-rose-100">{formatMoney(metrics.arrears)}</span></p>
                </div>
              </div>
            </Panel>
          </section>
        ) : null}

        {activeSection === "members" ? (
          <div className="space-y-5">
            <Panel title="Pending member logins" subtitle="People who can sign in but still need a DGB member profile.">
              <div className="space-y-4">
                {pendingMemberLogins.length === 0 ? <Empty label="No member logins are waiting to be linked." /> : null}
                {pendingMemberLogins.map((user) => {
                  const matchingMember = unlinkedMembers.find((member) => member.email.toLowerCase() === user.email.toLowerCase());
                  const defaultMemberNumber = `DGB-${user.id.slice(0, 8).toUpperCase()}`;
                  const defaultName = user.full_name || user.email.split("@")[0];

                  return (
                    <div key={user.id} className="rounded-3xl border border-yellow-300/20 bg-yellow-300/10 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.18em] text-yellow-100">Waiting for profile</p>
                          <h3 className="mt-2 text-xl font-black text-white">{defaultName}</h3>
                          <p className="mt-1 text-sm text-yellow-50/80">{user.email}</p>
                        </div>
                        <Pill status="pending" />
                      </div>

                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <form onSubmit={(event) => createMemberFromLogin(event, user)} className="grid gap-3 rounded-3xl border border-white/10 bg-black/15 p-4 sm:grid-cols-2">
                          <p className="text-sm font-black text-white sm:col-span-2">Create a new member for this login</p>
                          <Field name="member_number" label="Member number" placeholder={defaultMemberNumber} />
                          <Field name="full_name" label="Full name" placeholder={defaultName} />
                          <Field name="phone" label="Phone" placeholder="+27..." />
                          <button className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-400 px-5 text-sm font-black text-slate-950 sm:col-span-2" type="submit">
                            <Plus className="h-4 w-4" /> Create member + wallet
                          </button>
                        </form>

                        <form onSubmit={linkMemberToUser} className="grid gap-3 rounded-3xl border border-white/10 bg-black/15 p-4">
                          <input type="hidden" name="user_email" value={user.email} />
                          <p className="text-sm font-black text-white">Or link to an existing member</p>
                          <label className="block text-sm font-black text-slate-200">
                            Existing unlinked member
                            <select name="member_id" required defaultValue={matchingMember?.id ?? ""} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none">
                              <option value="">Select member</option>
                              {unlinkedMembers.map((member) => (
                                <option key={member.id} value={member.id} className="bg-slate-950">
                                  {member.full_name} · {member.email}{member.email.toLowerCase() === user.email.toLowerCase() ? " · email match" : ""}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-black text-slate-950" type="submit">
                            <Link2 className="h-4 w-4" /> Link selected member
                          </button>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <section className="grid gap-5 xl:grid-cols-3">
              <Panel title="Create member" subtitle="Use this when the member profile should exist before they register a login.">
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

              <Panel title="Link login" subtitle="Connect a registered email to an existing member profile.">
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

              <Panel title="User role" subtitle="Promote finance admins or viewers. Super admin only.">
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

            <Panel title="Members and balances" subtitle="One clean list of every member, login status, wallet and earned interest.">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Member</th>
                      <th className="px-3 py-3">Contact</th>
                      <th className="px-3 py-3">Login</th>
                      <th className="px-3 py-3">Account</th>
                      <th className="px-3 py-3">Balance</th>
                      <th className="px-3 py-3">Interest earned</th>
                      <th className="px-3 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {data.members.map((member) => {
                      const account = data.accounts.find((item) => item.member_id === member.id);
                      const balance = data.balances.find((item) => item.member_id === member.id)?.balance_cents ?? 0;
                      const interestEarned = data.interestEarnings.find((item) => item.member_id === member.id)?.interest_earned_cents ?? 0;
                      const linkedUser = data.users.find((user) => user.id === member.user_id);
                      return (
                        <tr key={member.id}>
                          <td className="px-3 py-4 font-black text-white">{member.full_name}<br /><span className="text-xs font-bold text-slate-500">{member.member_number}</span></td>
                          <td className="px-3 py-4 text-slate-300">{member.email}<br />{member.phone ?? "—"}</td>
                          <td className="px-3 py-4 text-slate-300">{linkedUser ? <Pill status={linkedUser.role} /> : <span className="text-slate-500">Not linked</span>}</td>
                          <td className="px-3 py-4 text-slate-300">{account?.account_number ?? "No wallet yet"}</td>
                          <td className="px-3 py-4 font-black text-emerald-200">{formatMoney(balance)}</td>
                          <td className="px-3 py-4 font-black text-yellow-100">{formatMoney(interestEarned)}</td>
                          <td className="px-3 py-4"><Pill status={member.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        ) : null}

        {activeSection === "money" ? (
          <section className="grid gap-5 xl:grid-cols-[1fr_1fr_0.7fr]">
            <Panel title="Capture contribution" subtitle="Money received from a member into the DGB pool.">
              <form onSubmit={captureContribution} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <label className="block text-sm font-black text-slate-200 sm:col-span-2 xl:col-span-1 2xl:col-span-2">
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
                <label className="block text-sm font-black text-slate-200 sm:col-span-2 xl:col-span-1 2xl:col-span-2">
                  Memo
                  <textarea name="memo" placeholder="Optional note" className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none" />
                </label>
                <button className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-yellow-300 px-5 text-sm font-black text-slate-950 sm:col-span-2 xl:col-span-1 2xl:col-span-2" type="submit">
                  <Banknote className="h-4 w-4" /> Capture contribution
                </button>
              </form>
            </Panel>

            <Panel title="Capture repayment" subtitle="Loan payment received from a borrower.">
              <form onSubmit={captureRepayment} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <label className="block text-sm font-black text-slate-200 sm:col-span-2 xl:col-span-1 2xl:col-span-2">
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
                <label className="block text-sm font-black text-slate-200 sm:col-span-2 xl:col-span-1 2xl:col-span-2">
                  Memo
                  <textarea name="memo" placeholder="Optional note" className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none" />
                </label>
                <button className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-400 px-5 text-sm font-black text-slate-950 sm:col-span-2 xl:col-span-1 2xl:col-span-2" type="submit">
                  <CheckCircle2 className="h-4 w-4" /> Capture repayment
                </button>
              </form>
            </Panel>

            <Panel title="Money summary" subtitle="Use this as a quick sanity check before posting transactions.">
              <div className="space-y-3">
                <div className="rounded-3xl border border-white/10 bg-black/15 p-4">
                  <p className="text-sm text-slate-400">Available cash</p>
                  <p className="mt-1 text-2xl font-black text-emerald-200">{formatMoney(metrics.availableCash)}</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-black/15 p-4">
                  <p className="text-sm text-slate-400">Open loans</p>
                  <p className="mt-1 text-2xl font-black text-white">{openLoans.length}</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-black/15 p-4">
                  <p className="text-sm text-slate-400">Interest already shared</p>
                  <p className="mt-1 text-2xl font-black text-yellow-100">{formatMoney(metrics.interestDistributed)}</p>
                </div>
              </div>
            </Panel>
          </section>
        ) : null}

        {activeSection === "loans" ? (
          <div className="space-y-5">
            <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
              <Panel title="Loan requests" subtitle="Review borrower requests. Approval takes principal from pooled cash and shares future interest.">
                <div className="space-y-3">
                  {data.loanRequests.length === 0 ? <Empty label="No loan requests yet." /> : null}
                  {data.loanRequests.map((request) => {
                    const product = data.loanProducts.find((item) => item.id === request.loan_product_id);
                    return (
                      <div key={request.id} className="rounded-3xl border border-white/10 bg-black/15 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-white">{memberName(request.member_id, data.members)}</p>
                            <p className="mt-1 text-sm text-slate-400">
                              {formatMoney(request.requested_amount_cents)} over {request.requested_term_months} months
                              {product ? ` · ${product.name} @ ${product.annual_interest_rate}%` : ""}
                            </p>
                          </div>
                          <Pill status={request.status} />
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-300">{request.purpose}</p>
                        <p className="mt-2 text-xs text-slate-500">Submitted {shortDate(request.submitted_at)}</p>
                        {request.status === "pending" ? (
                          <div className="mt-4 space-y-3">
                            <form onSubmit={(event) => approveLoanRequest(event, request)} className="grid gap-3 rounded-3xl border border-emerald-300/15 bg-emerald-400/5 p-3 sm:grid-cols-2">
                              <label className="block text-xs font-black uppercase tracking-[0.16em] text-emerald-100">
                                Annual rate %
                                <input
                                  name="annual_interest_rate"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  required
                                  defaultValue={product?.annual_interest_rate ?? 0}
                                  className="mt-2 h-10 w-full rounded-2xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none"
                                />
                              </label>
                              <label className="block text-xs font-black uppercase tracking-[0.16em] text-emerald-100">
                                Admin fee
                                <input
                                  name="admin_fee"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  defaultValue={product ? Number(product.admin_fee_cents) / 100 : 0}
                                  className="mt-2 h-10 w-full rounded-2xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none"
                                />
                              </label>
                              <button type="submit" className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-xs font-black text-emerald-100 sm:col-span-2">
                                Approve loan
                              </button>
                            </form>
                            <button type="button" onClick={() => rejectLoanRequest(request.id)} className="rounded-full border border-rose-300/25 bg-rose-400/10 px-4 py-2 text-xs font-black text-rose-100">
                              Reject request
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Panel title="Loan products and rates" subtitle="Set default loan rates, fees and terms.">
                <form onSubmit={upsertLoanProduct} className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-black text-slate-200 sm:col-span-2">
                    Existing product
                    <select name="product_id" className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none">
                      <option value="">Create new product / update by name</option>
                      {data.loanProducts.map((product) => (
                        <option key={product.id} value={product.id} className="bg-slate-950">
                          {product.name} · {product.annual_interest_rate}% · {product.max_term_months} months · {product.active ? "active" : "inactive"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field name="name" label="Product name" placeholder="Family Relief" required />
                  <Field name="annual_interest_rate" label="Annual interest rate %" placeholder="12" required />
                  <label className="block text-sm font-black text-slate-200">
                    Interest method
                    <select name="interest_method" required defaultValue="reducing_balance" className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none">
                      <option value="reducing_balance" className="bg-slate-950">Reducing balance</option>
                      <option value="simple" className="bg-slate-950">Simple</option>
                    </select>
                  </label>
                  <Field name="max_term_months" label="Max term months" placeholder="24" type="number" required />
                  <Field name="admin_fee" label="Admin fee" placeholder="250.00" />
                  <Field name="penalty_rate" label="Penalty rate %" placeholder="2" />
                  <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-black text-slate-200">
                    <input name="active" type="checkbox" defaultChecked className="h-4 w-4 accent-emerald-400" /> Active product
                  </label>
                  <button className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-400 px-5 text-sm font-black text-slate-950 sm:col-span-2" type="submit">
                    <Percent className="h-4 w-4" /> Save product rate
                  </button>
                </form>
              </Panel>
            </section>

            <Panel title="Current lending products" subtitle="These are the loan options members see when requesting finance.">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.loanProducts.map((product) => (
                  <div key={product.id} className="rounded-3xl border border-white/10 bg-black/15 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-white">{product.name}</p>
                        <p className="mt-1 text-sm text-slate-400">{product.interest_method.replace("_", " ")} · max {product.max_term_months} months</p>
                      </div>
                      <Pill status={product.active ? "active" : "inactive"} />
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-400">
                      <div className="rounded-2xl bg-white/[0.06] p-3"><span className="block font-black text-white">{product.annual_interest_rate}%</span>Interest</div>
                      <div className="rounded-2xl bg-white/[0.06] p-3"><span className="block font-black text-white">{formatMoney(product.admin_fee_cents)}</span>Admin fee</div>
                      <div className="rounded-2xl bg-white/[0.06] p-3"><span className="block font-black text-white">{product.penalty_rate}%</span>Penalty</div>
                    </div>
                  </div>
                ))}
                {data.loanProducts.length === 0 ? <Empty label="No loan products yet." /> : null}
              </div>
            </Panel>
          </div>
        ) : null}

        {activeSection === "ledger" ? (
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
        ) : null}
      </div>
    </div>
  );
}

function calculateAdminMetrics(data: AdminData) {
  const availableCash = data.transactions.reduce((total, transaction) => total + (transaction.direction === "credit" ? transaction.amount_cents : -transaction.amount_cents), 0);
  const outstanding = data.schedules.reduce((total, schedule) => total + Math.max(schedule.amount_due_cents - schedule.paid_cents, 0), 0);
  const interestDistributed = data.interestEarnings.reduce((total, row) => total + Number(row.interest_earned_cents ?? 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const arrears = data.schedules
    .filter((schedule) => schedule.due_date < today && schedule.paid_cents < schedule.amount_due_cents)
    .reduce((total, schedule) => total + (schedule.amount_due_cents - schedule.paid_cents), 0);
  return { availableCash, outstanding, arrears, interestDistributed };
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
