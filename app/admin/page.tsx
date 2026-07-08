"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  FileDown,
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
  type DocumentRow,
  downloadCsv,
  formatMoney,
  type InterestEarningRow,
  type LoanInterestMethod,
  type LoanRequestRow,
  type LoanRow,
  type MemberRow,
  parseMoneyToCents,
  parsePercent,
  type ProfileChangeRequestRow,
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
  loans: LoanRow[];
  schedules: ScheduleRow[];
  documents: DocumentRow[];
  profileChangeRequests: ProfileChangeRequestRow[];
};

const emptyData: AdminData = {
  users: [],
  members: [],
  accounts: [],
  balances: [],
  interestEarnings: [],
  transactions: [],
  loanRequests: [],
  loans: [],
  schedules: [],
  documents: [],
  profileChangeRequests: [],
};

type AdminSection = "overview" | "members" | "money" | "loans" | "ledger" | "controls";
type ReconciliationSeverity = "clear" | "attention" | "critical";
type ReconciliationCheck = {
  id: string;
  label: string;
  value: string;
  detail: string;
  severity: ReconciliationSeverity;
  actionSection: AdminSection;
};

const adminSections: { id: AdminSection; label: string; hint: string }[] = [
  { id: "overview", label: "Overview", hint: "What needs attention" },
  { id: "members", label: "Members", hint: "Create, link and roles" },
  { id: "money", label: "Money", hint: "Contributions and repayments" },
  { id: "loans", label: "Loans", hint: "Requests and custom offers" },
  { id: "ledger", label: "Ledger", hint: "Recent transactions" },
  { id: "controls", label: "Controls", hint: "Reconciliation checks" },
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

    const [users, members, accounts, balances, interestEarnings, transactions, loanRequests, loans, schedules, documents, profileChangeRequests] = await Promise.all([
      supabase.from("users").select("id,email,full_name,role,mfa_enabled").order("created_at", { ascending: true }).returns<DgbProfile[]>(),
      supabase.from("members").select("*").order("created_at", { ascending: false }).returns<MemberRow[]>(),
      supabase.from("accounts").select("*").order("created_at", { ascending: false }).returns<AccountRow[]>(),
      supabase.from("member_account_balances").select("*").returns<BalanceRow[]>(),
      supabase.from("member_interest_earnings").select("*").returns<InterestEarningRow[]>(),
      supabase.from("transactions").select("*").order("captured_at", { ascending: false }).limit(75).returns<TransactionRow[]>(),
      supabase.from("loan_requests").select("*").order("submitted_at", { ascending: false }).limit(75).returns<LoanRequestRow[]>(),
      supabase.from("loans").select("*").order("created_at", { ascending: false }).limit(75).returns<LoanRow[]>(),
      supabase.from("repayment_schedules").select("*").order("due_date", { ascending: true }).limit(250).returns<ScheduleRow[]>(),
      supabase.from("documents").select("*").order("uploaded_at", { ascending: false }).limit(150).returns<DocumentRow[]>(),
      supabase.from("profile_change_requests").select("*").order("submitted_at", { ascending: false }).limit(75).returns<ProfileChangeRequestRow[]>(),
    ]);

    const failed = [users, members, accounts, balances, interestEarnings, transactions, loanRequests, loans, schedules, documents, profileChangeRequests].find((result) => result.error);
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
      loans: loans.data ?? [],
      schedules: schedules.data ?? [],
      documents: documents.data ?? [],
      profileChangeRequests: profileChangeRequests.data ?? [],
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

  async function reviewProfileChange(requestId: string, decision: "approved" | "rejected") {
    setMessage(null);
    setError(null);

    const { error: rpcError } = await supabase.rpc("review_profile_change_request", {
      p_request_id: requestId,
      p_decision: decision,
      p_notes: decision === "approved" ? "Approved from DGB admin control room." : "Rejected from DGB admin control room.",
    });

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setMessage(decision === "approved" ? "Profile change approved and applied." : "Profile change rejected and audited.");
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

  async function approveLoanRequest(event: React.FormEvent<HTMLFormElement>, request: LoanRequestRow) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const form = new FormData(event.currentTarget);
    const account = data.accounts.find((item) => item.member_id === request.member_id && item.status === "active");
    const annualRate = parsePercent(form.get("annual_interest_rate"));
    const interestMethod = String(form.get("interest_method") ?? "reducing_balance") as LoanInterestMethod;
    const adminFeeCents = parseMoneyToCents(form.get("admin_fee")) ?? 0;
    const notes = String(form.get("notes") ?? "").trim();

    if (!account) {
      setError("This member needs an active wallet account before the loan can be approved.");
      return;
    }

    if (annualRate === null) {
      setError("Enter the annual interest rate you want to offer this member.");
      return;
    }

    const { error: rpcError } = await supabase.rpc("approve_loan_request", {
      p_request_id: request.id,
      p_account_id: account.id,
      p_reference: `DGB-LOAN-${request.id.slice(0, 8).toUpperCase()}`,
      p_start_date: new Date().toISOString().slice(0, 10),
      p_notes: notes || "Finance admin approved a custom loan offer.",
      p_annual_interest_rate: annualRate,
      p_interest_method: interestMethod,
      p_admin_fee_cents: adminFeeCents,
    });

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setMessage(`Loan offer sent at ${annualRate}% annual interest. No money leaves the pool until the member accepts it.`);
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

  function downloadLedgerCsv() {
    downloadCsv(
      `DGB-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Date", "Member", "Kind", "Reference", "Direction", "Amount", "Memo"],
      data.transactions.map((transaction) => [
        transaction.captured_at,
        memberName(transaction.member_id, data.members),
        transaction.kind.replace("_", " "),
        transaction.reference,
        transaction.direction,
        formatMoney(transaction.amount_cents),
        transaction.memo,
      ]),
    );
    setMessage("Downloaded the recent ledger review file.");
  }

  const openLoans = data.loans.filter((loan) => ["active", "overdue", "approved"].includes(loan.status));
  const pendingLoanRequests = data.loanRequests.filter((request) => request.status === "pending");
  const offersAwaitingAcceptance = data.loanRequests.filter((request) => request.status === "approved");
  const pendingOfferExposure = offersAwaitingAcceptance.reduce((total, request) => total + request.requested_amount_cents, 0);
  const pendingProfileChanges = data.profileChangeRequests.filter((request) => request.status === "pending");
  const membersMissingIdentity = data.members.filter((member) => !member.id_passport_number || !member.next_of_kin_name || !member.next_of_kin_phone);
  const membersWithoutIdDocument = data.members.filter((member) => !data.documents.some((document) => document.member_id === member.id && document.kind === "id_document"));
  const reconciliationChecks = buildReconciliationChecks(data);
  const reconciliationExceptionCount = reconciliationChecks.filter((check) => check.severity !== "clear").length;
  const criticalReconciliationCount = reconciliationChecks.filter((check) => check.severity === "critical").length;
  const linkedMemberCount = data.members.filter((member) => member.user_id).length;
  const pendingActionCount = pendingMemberLogins.length + pendingLoanRequests.length + pendingProfileChanges.length + metrics.arrearsCount + reconciliationExceptionCount;
  const liquidityAfterOffers = metrics.availableCash - pendingOfferExposure;
  const controlChecks = [
    {
      label: "Daily cash position",
      value: formatMoney(metrics.availableCash),
      detail: "Uses the full account-balance view, not only recent transactions.",
      tone: metrics.availableCash >= 0 ? "clear" : "critical",
    },
    {
      label: "Offers waiting for member acceptance",
      value: `${offersAwaitingAcceptance.length} · ${formatMoney(pendingOfferExposure)}`,
      detail: `Cash after all open offers would be ${formatMoney(liquidityAfterOffers)}.`,
      tone: liquidityAfterOffers >= 0 ? "clear" : "critical",
    },
    {
      label: "Repayment arrears",
      value: `${metrics.arrearsCount} schedule${metrics.arrearsCount === 1 ? "" : "s"} · ${formatMoney(metrics.arrears)}`,
      detail: "Overdue unpaid instalments for finance follow-up.",
      tone: metrics.arrearsCount === 0 ? "clear" : "critical",
    },
    {
      label: "Member KYC/document readiness",
      value: `${membersMissingIdentity.length} profile gap${membersMissingIdentity.length === 1 ? "" : "s"} · ${membersWithoutIdDocument.length} ID file gap${membersWithoutIdDocument.length === 1 ? "" : "s"}`,
      detail: "Mimics bank onboarding checks before larger lending exposure.",
      tone: membersMissingIdentity.length === 0 && membersWithoutIdDocument.length === 0 ? "clear" : "attention",
    },
    {
      label: "Reconciliation exceptions",
      value: reconciliationExceptionCount === 0 ? "Clear" : `${reconciliationExceptionCount} open`,
      detail: criticalReconciliationCount > 0 ? `${criticalReconciliationCount} critical control issue${criticalReconciliationCount === 1 ? "" : "s"} need review.` : "Ledger, account and member control checks are clean.",
      tone: criticalReconciliationCount > 0 ? "critical" : reconciliationExceptionCount > 0 ? "attention" : "clear",
    },
  ] as const;
  const sectionAlertCounts: Record<AdminSection, number> = {
    overview: pendingActionCount,
    members: pendingMemberLogins.length + membersMissingIdentity.length,
    money: 0,
    loans: pendingLoanRequests.length + offersAwaitingAcceptance.length,
    ledger: metrics.arrearsCount,
    controls: reconciliationExceptionCount,
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
          <MetricCard icon={PiggyBank} label="Available cash" value={formatMoney(metrics.availableCash)} detail="Full wallet-balance view" />
          <MetricCard icon={UsersRound} label="Members linked" value={`${linkedMemberCount}/${data.members.length}`} detail={`${pendingMemberLogins.length} pending login${pendingMemberLogins.length === 1 ? "" : "s"}`} />
          <MetricCard icon={Landmark} label="Loans outstanding" value={formatMoney(metrics.outstanding)} detail={`${openLoans.length} open loan${openLoans.length === 1 ? "" : "s"}`} />
          <MetricCard icon={Percent} label="Interest distributed" value={formatMoney(metrics.interestDistributed)} detail="Credited to funding members" />
        </section>

        <nav className="sticky top-[5.5rem] z-20 rounded-[1.6rem] border border-white/10 bg-[#06111f]/92 p-2 shadow-xl shadow-black/20 backdrop-blur-xl">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
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
          <div className="space-y-5">
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
                      <span className="mt-1 block text-sm text-slate-400">Send a custom offer, or reject with an audit trail.</span>
                    </span>
                    <span className="rounded-full bg-yellow-300 px-3 py-1 text-sm font-black text-slate-950">{pendingLoanRequests.length}</span>
                  </button>
                  <button type="button" onClick={() => setActiveSection("loans")} className="flex w-full items-center justify-between gap-4 rounded-3xl border border-white/10 bg-black/15 p-4 text-left">
                    <span>
                      <span className="block font-black text-white">Offers waiting for members</span>
                      <span className="mt-1 block text-sm text-slate-400">Approved offers are not disbursed until accepted.</span>
                    </span>
                    <span className="rounded-full bg-yellow-300 px-3 py-1 text-sm font-black text-slate-950">{offersAwaitingAcceptance.length}</span>
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

            <Panel title="Banking operations cockpit" subtitle="Inspired by bank back-office close routines: liquidity, exceptions, onboarding readiness and ledger review.">
              <div className="grid gap-3 lg:grid-cols-2">
                {controlChecks.map((check) => (
                  <ControlCheck key={check.label} label={check.label} value={check.value} detail={check.detail} tone={check.tone} />
                ))}
              </div>
              <div className="mt-4 grid gap-3 text-sm text-slate-300 lg:grid-cols-4">
                <button type="button" onClick={() => setActiveSection("members")} className="rounded-3xl border border-white/10 bg-black/15 p-4 text-left hover:bg-white/[0.08]">
                  <ClipboardCheck className="h-5 w-5 text-yellow-100" />
                  <p className="mt-3 font-black text-white">Onboarding queue</p>
                  <p className="mt-1">{pendingMemberLogins.length} login link{pendingMemberLogins.length === 1 ? "" : "s"}, {pendingProfileChanges.length} profile approval{pendingProfileChanges.length === 1 ? "" : "s"}.</p>
                </button>
                <button type="button" onClick={() => setActiveSection("loans")} className="rounded-3xl border border-white/10 bg-black/15 p-4 text-left hover:bg-white/[0.08]">
                  <Landmark className="h-5 w-5 text-emerald-200" />
                  <p className="mt-3 font-black text-white">Credit pipeline</p>
                  <p className="mt-1">{pendingLoanRequests.length} request{pendingLoanRequests.length === 1 ? "" : "s"} to price and {offersAwaitingAcceptance.length} offer{offersAwaitingAcceptance.length === 1 ? "" : "s"} awaiting acceptance.</p>
                </button>
                <button type="button" onClick={() => setActiveSection("ledger")} className="rounded-3xl border border-white/10 bg-black/15 p-4 text-left hover:bg-white/[0.08]">
                  <FileDown className="h-5 w-5 text-emerald-200" />
                  <p className="mt-3 font-black text-white">Ledger review pack</p>
                  <p className="mt-1">Export the recent immutable transaction window for a daily close/reconciliation file.</p>
                </button>
                <button type="button" onClick={() => setActiveSection("controls")} className="rounded-3xl border border-white/10 bg-black/15 p-4 text-left hover:bg-white/[0.08]">
                  <AlertTriangle className="h-5 w-5 text-yellow-100" />
                  <p className="mt-3 font-black text-white">Control exceptions</p>
                  <p className="mt-1">Review {reconciliationExceptionCount} open reconciliation exception{reconciliationExceptionCount === 1 ? "" : "s"} before daily close.</p>
                </button>
              </div>
            </Panel>
          </div>
        ) : null}

        {activeSection === "members" ? (
          <div className="space-y-5">
            <Panel title="Profile change approvals" subtitle="Bank-style maker-checker review for sensitive member contact details.">
              <div className="space-y-3">
                {pendingProfileChanges.length === 0 ? <Empty label="No profile changes are waiting for review." /> : null}
                {pendingProfileChanges.map((request) => (
                  <div key={request.id} className="rounded-3xl border border-yellow-300/20 bg-yellow-300/10 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-yellow-100">Profile change request</p>
                        <h3 className="mt-2 text-xl font-black text-white">{memberName(request.member_id, data.members)}</h3>
                        <p className="mt-1 text-sm text-yellow-50/80">Submitted {shortDate(request.submitted_at)}</p>
                      </div>
                      <Pill status={request.status} />
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-slate-200 sm:grid-cols-3">
                      {profileChangeItems(request).map((item) => (
                        <div key={item.label} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                          <p className="mt-1 font-bold text-white">{item.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void reviewProfileChange(request.id, "approved")} className="rounded-full bg-emerald-400 px-4 py-2 text-xs font-black text-slate-950">
                        Approve and apply
                      </button>
                      <button type="button" onClick={() => void reviewProfileChange(request.id, "rejected")} className="rounded-full border border-rose-300/25 bg-rose-400/10 px-4 py-2 text-xs font-black text-rose-100">
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

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
            <Panel title="Loan requests" subtitle="Members request only amount and repayment period. You choose the custom interest offer; money moves only after the member accepts.">
              <div className="space-y-3">
                {data.loanRequests.length === 0 ? <Empty label="No loan requests yet." /> : null}
                {data.loanRequests.map((request) => (
                  <div key={request.id} className="rounded-3xl border border-white/10 bg-black/15 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-white">{memberName(request.member_id, data.members)}</p>
                        <p className="mt-1 text-sm text-slate-400">
                          Wants {formatMoney(request.requested_amount_cents)} over {request.requested_term_months} month{request.requested_term_months === 1 ? "" : "s"}
                        </p>
                      </div>
                      <Pill status={request.status === "approved" ? "offer sent" : request.status} />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{request.purpose}</p>
                    <p className="mt-2 text-xs text-slate-500">Submitted {shortDate(request.submitted_at)}</p>
                    {request.status === "pending" ? (
                      <div className="mt-4 space-y-3">
                        <form onSubmit={(event) => approveLoanRequest(event, request)} className="grid gap-3 rounded-3xl border border-emerald-300/15 bg-emerald-400/5 p-3 sm:grid-cols-2">
                          <label className="block text-xs font-black uppercase tracking-[0.16em] text-emerald-100">
                            Offer annual rate %
                            <input
                              name="annual_interest_rate"
                              type="number"
                              min="0"
                              step="0.01"
                              required
                              placeholder="12"
                              className="mt-2 h-10 w-full rounded-2xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none"
                            />
                          </label>
                          <label className="block text-xs font-black uppercase tracking-[0.16em] text-emerald-100">
                            Interest method
                            <select name="interest_method" required defaultValue="reducing_balance" className="mt-2 h-10 w-full rounded-2xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none">
                              <option value="reducing_balance" className="bg-slate-950">Reducing balance</option>
                              <option value="simple" className="bg-slate-950">Simple</option>
                            </select>
                          </label>
                          <label className="block text-xs font-black uppercase tracking-[0.16em] text-emerald-100">
                            Admin fee
                            <input
                              name="admin_fee"
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              className="mt-2 h-10 w-full rounded-2xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none"
                            />
                          </label>
                          <label className="block text-xs font-black uppercase tracking-[0.16em] text-emerald-100 sm:col-span-2">
                            Notes shown to member
                            <textarea name="notes" placeholder="Explain the approved interest rate or any conditions" className="mt-2 min-h-20 w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none" />
                          </label>
                          <button type="submit" className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-xs font-black text-emerald-100 sm:col-span-2">
                            Send approval offer
                          </button>
                        </form>
                        <button type="button" onClick={() => rejectLoanRequest(request.id)} className="rounded-full border border-rose-300/25 bg-rose-400/10 px-4 py-2 text-xs font-black text-rose-100">
                          Reject request
                        </button>
                      </div>
                    ) : null}
                    {request.status === "approved" ? (
                      <div className="mt-4 rounded-3xl border border-yellow-300/20 bg-yellow-300/10 p-4 text-sm text-yellow-50">
                        <p className="font-black">Offer sent — waiting for member acceptance</p>
                        <p className="mt-2">
                          {request.offer_annual_interest_rate}% annual · {request.offer_interest_method?.replace("_", " ") ?? "method pending"} · admin fee {formatMoney(request.offer_admin_fee_cents)}
                        </p>
                        {request.review_notes ? <p className="mt-2 text-yellow-50/80">{request.review_notes}</p> : null}
                      </div>
                    ) : null}
                    {request.status === "active" ? <p className="mt-3 text-sm text-emerald-100">Accepted by member. Loan and repayment schedule are active.</p> : null}
                    {request.member_decision_notes && request.status === "rejected" ? <p className="mt-3 text-sm text-slate-400">{request.member_decision_notes}</p> : null}
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        ) : null}

        {activeSection === "controls" ? (
          <div className="space-y-5">
            <Panel title="Reconciliation controls" subtitle="Daily close checks for member/account/ledger consistency before anyone relies on the numbers.">
              <div className="grid gap-3 lg:grid-cols-2">
                {reconciliationChecks.map((check) => (
                  <ReconciliationCard key={check.id} check={check} onOpen={() => setActiveSection(check.actionSection)} />
                ))}
              </div>
            </Panel>

            <Panel title="Daily close routine" subtitle="Keep this short and repeatable so finance admin can spot trouble fast.">
              <div className="grid gap-3 text-sm leading-6 text-slate-300 md:grid-cols-3">
                <div className="rounded-3xl border border-white/10 bg-black/15 p-4">
                  <p className="font-black text-white">1. Clear exceptions</p>
                  <p className="mt-1">Review critical controls before approving new lending or exporting the day.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-black/15 p-4">
                  <p className="font-black text-white">2. Export ledger</p>
                  <p className="mt-1">Use the Ledger tab CSV as the immutable movement window for reconciliation.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-black/15 p-4">
                  <p className="font-black text-white">3. Recheck cash</p>
                  <p className="mt-1">Refresh after corrections so available cash and offer exposure are current.</p>
                </div>
              </div>
            </Panel>
          </div>
        ) : null}

        {activeSection === "ledger" ? (
          <Panel title="Recent ledger transactions" subtitle="Immutable movement log. Corrections must be posted as reversing entries.">
            <div className="mb-4 flex flex-col gap-3 rounded-3xl border border-emerald-300/15 bg-emerald-400/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-black text-emerald-100">Daily close export</p>
                <p className="mt-1 text-sm text-slate-300">Download the recent ledger window for reconciliation review.</p>
              </div>
              <button type="button" onClick={downloadLedgerCsv} className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-400 px-4 py-2 text-sm font-black text-slate-950">
                <FileDown className="h-4 w-4" /> Export CSV
              </button>
            </div>
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
  const availableCash = data.balances.reduce((total, balance) => total + Number(balance.balance_cents ?? 0), 0);
  const outstanding = data.schedules.reduce((total, schedule) => total + Math.max(schedule.amount_due_cents - schedule.paid_cents, 0), 0);
  const interestDistributed = data.interestEarnings.reduce((total, row) => total + Number(row.interest_earned_cents ?? 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const overdueSchedules = data.schedules.filter((schedule) => schedule.due_date < today && schedule.paid_cents < schedule.amount_due_cents);
  const arrears = overdueSchedules.reduce((total, schedule) => total + (schedule.amount_due_cents - schedule.paid_cents), 0);
  return { availableCash, outstanding, arrears, arrearsCount: overdueSchedules.length, interestDistributed };
}

function buildReconciliationChecks(data: AdminData): ReconciliationCheck[] {
  const membersById = new Map(data.members.map((member) => [member.id, member]));
  const accountsById = new Map(data.accounts.map((account) => [account.id, account]));
  const accountsByMember = new Map<string, AccountRow[]>();
  const balancesByMember = new Map<string, number>();

  for (const account of data.accounts) {
    accountsByMember.set(account.member_id, [...(accountsByMember.get(account.member_id) ?? []), account]);
  }

  for (const balance of data.balances) {
    balancesByMember.set(balance.member_id, (balancesByMember.get(balance.member_id) ?? 0) + Number(balance.balance_cents ?? 0));
  }

  const activeMembersWithoutWallet = data.members.filter((member) => member.status === "active" && !(accountsByMember.get(member.id) ?? []).some((account) => account.status === "active"));
  const inactiveMembersWithBalance = data.members.filter((member) => member.status !== "active" && Math.abs(balancesByMember.get(member.id) ?? 0) > 0);
  const activeAccountsForInactiveMembers = data.accounts.filter((account) => account.status === "active" && membersById.get(account.member_id)?.status !== "active");
  const transactionsWithMissingLinks = data.transactions.filter((transaction) => !membersById.has(transaction.member_id) || !accountsById.has(transaction.account_id));
  const interestOnInactiveAccounts = data.interestEarnings.filter((earning) => {
    const member = membersById.get(earning.member_id);
    const account = accountsById.get(earning.account_id);
    return Number(earning.interest_earned_cents ?? 0) > 0 && (member?.status !== "active" || account?.status !== "active");
  });
  const openLoansForInactiveMembers = data.loans.filter((loan) => ["active", "approved", "overdue"].includes(loan.status) && membersById.get(loan.member_id)?.status !== "active");
  const referenceGroups = new Map<string, TransactionRow[]>();

  for (const transaction of data.transactions) {
    if (!transaction.reference || transaction.kind === "reversal") continue;
    referenceGroups.set(transaction.reference, [...(referenceGroups.get(transaction.reference) ?? []), transaction]);
  }

  const duplicateReferences = [...referenceGroups.entries()].filter(([, transactions]) => transactions.length > 1);
  const summarize = (items: string[], empty: string) => (items.length === 0 ? empty : `${items.slice(0, 3).join(", ")}${items.length > 3 ? ` +${items.length - 3} more` : ""}`);

  return [
    {
      id: "active-wallet-coverage",
      label: "Active members have active wallets",
      value: activeMembersWithoutWallet.length === 0 ? "Clear" : `${activeMembersWithoutWallet.length} gap${activeMembersWithoutWallet.length === 1 ? "" : "s"}`,
      detail: summarize(activeMembersWithoutWallet.map((member) => member.member_number), "Every active member has an active wallet account."),
      severity: activeMembersWithoutWallet.length === 0 ? "clear" : "critical",
      actionSection: "members",
    },
    {
      id: "inactive-zero-balance",
      label: "Closed/suspended members have zero balance",
      value: inactiveMembersWithBalance.length === 0 ? "Clear" : `${inactiveMembersWithBalance.length} mismatch${inactiveMembersWithBalance.length === 1 ? "" : "es"}`,
      detail: summarize(inactiveMembersWithBalance.map((member) => `${member.member_number} ${formatMoney(balancesByMember.get(member.id) ?? 0)}`), "No inactive member is carrying a wallet balance."),
      severity: inactiveMembersWithBalance.length === 0 ? "clear" : "critical",
      actionSection: "members",
    },
    {
      id: "inactive-account-status",
      label: "Inactive members do not have active accounts",
      value: activeAccountsForInactiveMembers.length === 0 ? "Clear" : `${activeAccountsForInactiveMembers.length} active`,
      detail: summarize(activeAccountsForInactiveMembers.map((account) => `${account.account_number} (${memberName(account.member_id, data.members)})`), "Closed/suspended members have no active wallet accounts."),
      severity: activeAccountsForInactiveMembers.length === 0 ? "clear" : "critical",
      actionSection: "members",
    },
    {
      id: "ledger-links",
      label: "Recent ledger rows link to live member/account records",
      value: transactionsWithMissingLinks.length === 0 ? "Clear" : `${transactionsWithMissingLinks.length} row${transactionsWithMissingLinks.length === 1 ? "" : "s"}`,
      detail: summarize(transactionsWithMissingLinks.map((transaction) => transaction.reference), "Recent transactions all link to known members and accounts."),
      severity: transactionsWithMissingLinks.length === 0 ? "clear" : "critical",
      actionSection: "ledger",
    },
    {
      id: "interest-active-only",
      label: "Interest earnings belong only to active accounts",
      value: interestOnInactiveAccounts.length === 0 ? "Clear" : `${interestOnInactiveAccounts.length} earning${interestOnInactiveAccounts.length === 1 ? "" : "s"}`,
      detail: summarize(interestOnInactiveAccounts.map((earning) => `${memberName(earning.member_id, data.members)} ${formatMoney(earning.interest_earned_cents)}`), "No closed/suspended wallet is showing earned interest."),
      severity: interestOnInactiveAccounts.length === 0 ? "clear" : "critical",
      actionSection: "ledger",
    },
    {
      id: "open-loans-active-members",
      label: "Open loans belong to active members",
      value: openLoansForInactiveMembers.length === 0 ? "Clear" : `${openLoansForInactiveMembers.length} loan${openLoansForInactiveMembers.length === 1 ? "" : "s"}`,
      detail: summarize(openLoansForInactiveMembers.map((loan) => memberName(loan.member_id, data.members)), "No open loan is assigned to an inactive member."),
      severity: openLoansForInactiveMembers.length === 0 ? "clear" : "critical",
      actionSection: "loans",
    },
    {
      id: "duplicate-references",
      label: "Recent non-reversal references are unique",
      value: duplicateReferences.length === 0 ? "Clear" : `${duplicateReferences.length} duplicate${duplicateReferences.length === 1 ? "" : "s"}`,
      detail: summarize(duplicateReferences.map(([reference, transactions]) => `${reference} ×${transactions.length}`), "No duplicate non-reversal references in the recent ledger window."),
      severity: duplicateReferences.length === 0 ? "clear" : "attention",
      actionSection: "ledger",
    },
  ];
}

function memberName(memberId: string, members: MemberRow[]) {
  return members.find((member) => member.id === memberId)?.full_name ?? "Unknown member";
}

function profileChangeItems(request: ProfileChangeRequestRow) {
  const changes = request.requested_changes;
  const items = [
    ["Phone", changes.phone],
    ["Next of kin", changes.next_of_kin_name],
    ["Next of kin phone", changes.next_of_kin_phone],
    ["Notes", changes.notes],
  ];

  return items
    .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
    .map(([label, value]) => ({ label: String(label), value: String(value) }));
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

function ControlCheck({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "clear" | "attention" | "critical" }) {
  const toneClass = tone === "clear"
    ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
    : tone === "attention"
      ? "border-yellow-300/20 bg-yellow-300/10 text-yellow-100"
      : "border-rose-300/20 bg-rose-400/10 text-rose-100";

  return (
    <div className={`rounded-3xl border p-4 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] opacity-75">{tone === "clear" ? "Clear" : tone === "attention" ? "Watch" : "Action"}</p>
          <p className="mt-2 font-black text-white">{label}</p>
        </div>
        <span className="rounded-full bg-black/20 px-3 py-1 text-xs font-black text-white">{value}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-200">{detail}</p>
    </div>
  );
}

function ReconciliationCard({ check, onOpen }: { check: ReconciliationCheck; onOpen: () => void }) {
  const toneClass = check.severity === "clear"
    ? "border-emerald-300/20 bg-emerald-400/10"
    : check.severity === "attention"
      ? "border-yellow-300/20 bg-yellow-300/10"
      : "border-rose-300/20 bg-rose-400/10";
  const badgeClass = check.severity === "clear"
    ? "bg-emerald-400/15 text-emerald-100"
    : check.severity === "attention"
      ? "bg-yellow-300/15 text-yellow-100"
      : "bg-rose-400/15 text-rose-100";

  return (
    <div className={`rounded-3xl border p-4 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className={`mt-0.5 h-5 w-5 ${check.severity === "clear" ? "text-emerald-200" : check.severity === "attention" ? "text-yellow-100" : "text-rose-100"}`} />
          <div>
            <p className="font-black text-white">{check.label}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{check.detail}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${badgeClass}`}>{check.value}</span>
      </div>
      <button type="button" onClick={onOpen} className="mt-4 rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-black text-white hover:bg-white/[0.08]">
        Review source area
      </button>
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
