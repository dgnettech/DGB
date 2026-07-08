"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertTriangle, ArrowRight, Bell, FileUp, HandCoins, Percent, RefreshCw, UserCog, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/components/dgb/auth-gate";
import { DgbAppShell } from "@/components/dgb/app-shell";
import {
  type AccountRow,
  type BalanceRow,
  type DocumentRow,
  formatMoney,
  type InterestEarningRow,
  type LoanRequestRow,
  type LoanRow,
  type MemberRow,
  type NotificationRow,
  parseMoneyToCents,
  sanitizeFileName,
  type ScheduleRow,
  shortDate,
  statusClassName,
  type TransactionRow,
} from "@/lib/dgb-live";

type MemberData = {
  member: MemberRow | null;
  accounts: AccountRow[];
  balances: BalanceRow[];
  interestEarnings: InterestEarningRow[];
  transactions: TransactionRow[];
  loanRequests: LoanRequestRow[];
  loans: LoanRow[];
  schedules: ScheduleRow[];
  documents: DocumentRow[];
  notifications: NotificationRow[];
};

const emptyData: MemberData = {
  member: null,
  accounts: [],
  balances: [],
  interestEarnings: [],
  transactions: [],
  loanRequests: [],
  loans: [],
  schedules: [],
  documents: [],
  notifications: [],
};

export default function MemberPage() {
  return (
    <AuthGate>
      {({ supabase, profile }) => (
        <DgbAppShell supabase={supabase} profile={profile}>
          <MemberDashboard supabase={supabase} userId={profile.id} />
        </DgbAppShell>
      )}
    </AuthGate>
  );
}

function MemberDashboard({ supabase, userId }: { supabase: SupabaseClient; userId: string }) {
  const [data, setData] = useState<MemberData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const memberResult = await supabase.from("members").select("*").eq("user_id", userId).maybeSingle<MemberRow>();
    if (memberResult.error) {
      setError(memberResult.error.message);
      setLoading(false);
      return;
    }

    const member = memberResult.data ?? null;
    if (!member) {
      setData(emptyData);
      setLoading(false);
      return;
    }

    const [accounts, balances, interestEarnings, transactions, loanRequests, loans, documents, notifications] = await Promise.all([
      supabase.from("accounts").select("*").eq("member_id", member.id).returns<AccountRow[]>(),
      supabase.from("member_account_balances").select("*").eq("member_id", member.id).returns<BalanceRow[]>(),
      supabase.from("member_interest_earnings").select("*").eq("member_id", member.id).returns<InterestEarningRow[]>(),
      supabase.from("transactions").select("*").eq("member_id", member.id).order("captured_at", { ascending: false }).limit(50).returns<TransactionRow[]>(),
      supabase.from("loan_requests").select("*").eq("member_id", member.id).order("submitted_at", { ascending: false }).returns<LoanRequestRow[]>(),
      supabase.from("loans").select("*").eq("member_id", member.id).order("created_at", { ascending: false }).returns<LoanRow[]>(),
      supabase.from("documents").select("*").eq("member_id", member.id).order("uploaded_at", { ascending: false }).returns<DocumentRow[]>(),
      supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(20).returns<NotificationRow[]>(),
    ]);

    const failed = [accounts, balances, interestEarnings, transactions, loanRequests, loans, documents, notifications].find((result) => result.error);
    if (failed?.error) {
      setError(failed.error.message);
      setLoading(false);
      return;
    }

    const loanIds = loans.data?.map((loan) => loan.id) ?? [];
    const schedules = loanIds.length
      ? await supabase.from("repayment_schedules").select("*").in("loan_id", loanIds).order("due_date", { ascending: true }).returns<ScheduleRow[]>()
      : { data: [], error: null };

    if (schedules.error) {
      setError(schedules.error.message);
      setLoading(false);
      return;
    }

    setData({
      member,
      accounts: accounts.data ?? [],
      balances: balances.data ?? [],
      interestEarnings: interestEarnings.data ?? [],
      transactions: transactions.data ?? [],
      loanRequests: loanRequests.data ?? [],
      loans: loans.data ?? [],
      schedules: schedules.data ?? [],
      documents: documents.data ?? [],
      notifications: notifications.data ?? [],
    });
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const memberBalance = useMemo(() => data.balances.reduce((total, balance) => total + Number(balance.balance_cents ?? 0), 0), [data.balances]);
  const interestEarned = useMemo(() => data.interestEarnings.reduce((total, row) => total + Number(row.interest_earned_cents ?? 0), 0), [data.interestEarnings]);
  const outstanding = useMemo(() => data.schedules.reduce((total, row) => total + Math.max(row.amount_due_cents - row.paid_cents, 0), 0), [data.schedules]);
  const nextPayment = useMemo(() => data.schedules.find((row) => row.paid_cents < row.amount_due_cents), [data.schedules]);

  async function submitLoanRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (!data.member) {
      setError("A member profile must be linked before submitting loan requests.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const amountCents = parseMoneyToCents(form.get("amount"));
    const term = Number(form.get("term_months"));
    const purpose = String(form.get("purpose") ?? "").trim();

    if (!amountCents || !Number.isFinite(term) || term <= 0 || !purpose) {
      setError("Loan amount, repayment period and purpose are required.");
      return;
    }

    const { error: insertError } = await supabase.from("loan_requests").insert({
      member_id: data.member.id,
      loan_product_id: null,
      requested_amount_cents: amountCents,
      requested_term_months: term,
      purpose,
      external_lender: String(form.get("external_lender") ?? "").trim() || null,
      external_settlement_reference: String(form.get("external_reference") ?? "").trim() || null,
      status: "pending",
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    event.currentTarget.reset();
    setMessage("Loan request submitted. A finance admin will review it and send back an interest-rate offer for you to accept or decline.");
    await loadData();
  }

  async function acceptLoanOffer(requestId: string) {
    setMessage(null);
    setError(null);
    const { error: rpcError } = await supabase.rpc("accept_loan_offer", { p_request_id: requestId });

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setMessage("Loan offer accepted. Your loan and repayment schedule are now active.");
    await loadData();
  }

  async function declineLoanOffer(requestId: string) {
    setMessage(null);
    setError(null);
    const { error: rpcError } = await supabase.rpc("decline_loan_offer", {
      p_request_id: requestId,
      p_notes: "Declined from member portal.",
    });

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setMessage("Loan offer declined. You can submit a new request if you want different terms.");
    await loadData();
  }

  async function submitProfileChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (!data.member) {
      setError("A member profile must be linked before profile changes can be requested.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const requestedChanges = {
      phone: String(form.get("phone") ?? "").trim() || undefined,
      next_of_kin_name: String(form.get("next_of_kin_name") ?? "").trim() || undefined,
      next_of_kin_phone: String(form.get("next_of_kin_phone") ?? "").trim() || undefined,
      notes: String(form.get("notes") ?? "").trim() || undefined,
    };

    const { error: insertError } = await supabase.from("profile_change_requests").insert({
      member_id: data.member.id,
      requested_changes: requestedChanges,
      status: "pending",
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    event.currentTarget.reset();
    setMessage("Profile change request submitted for admin approval.");
    await loadData();
  }

  async function uploadDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (!data.member) {
      setError("A member profile must be linked before documents can be uploaded.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "other");
    const loanId = String(form.get("loan_id") ?? "") || null;

    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a document to upload.");
      return;
    }

    const storagePath = `${data.member.id}/${Date.now()}-${sanitizeFileName(file.name)}`;
    const upload = await supabase.storage.from("member-documents").upload(storagePath, file, { upsert: false });
    if (upload.error) {
      setError(upload.error.message);
      return;
    }

    const { error: insertError } = await supabase.from("documents").insert({
      member_id: data.member.id,
      loan_id: loanId,
      kind,
      storage_path: storagePath,
      file_name: file.name,
      uploaded_by: userId,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    event.currentTarget.reset();
    setMessage("Document uploaded securely.");
    await loadData();
  }

  if (!data.member && !loading) {
    return (
      <div className="px-5 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-yellow-300/20 bg-yellow-300/10 p-8 text-yellow-50">
          <AlertTriangle className="h-8 w-8 text-yellow-200" />
          <h1 className="mt-5 text-3xl font-black tracking-[-0.04em]">Member profile pending</h1>
          <p className="mt-4 text-sm leading-7">
            Your login exists, but it is not linked to a DGB member profile yet. Ask a finance admin to open Admin → Pending member logins, then create a member profile for this login or link it to an existing member.
          </p>
          <button type="button" onClick={loadData} className="mt-6 inline-flex items-center gap-2 rounded-full bg-yellow-300 px-5 py-3 text-sm font-black text-slate-950">
            <RefreshCw className="h-4 w-4" /> Check again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.07] p-6 shadow-2xl shadow-black/20">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-200">Member portal</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-4xl font-black tracking-[-0.055em] sm:text-5xl">Welcome{data.member ? `, ${data.member.full_name}` : ""}</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">View your own DGB balance, contributions, loan requests, repayment schedules, documents and notifications. All data is filtered by Supabase RLS.</p>
            </div>
            <button type="button" onClick={loadData} className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-5 py-3 text-sm font-black text-slate-950">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </section>

        {message ? <Notice tone="success" message={message} /> : null}
        {error ? <Notice tone="error" message={error} /> : null}
        {loading ? <Notice tone="success" message="Loading member data..." /> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={WalletCards} label="DGB balance" value={formatMoney(memberBalance)} detail="Calculated from wallet ledger" />
          <MetricCard icon={Percent} label="Interest earned" value={formatMoney(interestEarned)} detail="Your share of lending-pool interest" />
          <MetricCard icon={HandCoins} label="Outstanding" value={formatMoney(outstanding)} detail="Total unpaid schedule amount" />
          <MetricCard icon={Bell} label="Next payment" value={nextPayment ? formatMoney(nextPayment.amount_due_cents - nextPayment.paid_cents) : "—"} detail={nextPayment ? shortDate(nextPayment.due_date) : "No payment due"} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <Panel title="Submit loan request" subtitle="Tell finance how much you want and over what period. They will send back the interest-rate offer for you to accept or decline.">
            <form onSubmit={submitLoanRequest} className="grid gap-3 sm:grid-cols-2">
              <Field name="amount" label="How much do you want to borrow?" placeholder="10000.00" required />
              <Field name="term_months" label="Over how many months?" placeholder="12" type="number" required />
              <Field name="external_lender" label="External lender" placeholder="Optional" />
              <Field name="external_reference" label="Settlement reference" placeholder="Optional" />
              <label className="block text-sm font-black text-slate-200 sm:col-span-2">
                Purpose
                <textarea name="purpose" required placeholder="Explain what this loan is for" className="mt-2 min-h-28 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none" />
              </label>
              <button className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-400 px-5 text-sm font-black text-slate-950 sm:col-span-2" type="submit">
                Submit request <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </Panel>

          <Panel title="Repayment schedule" subtitle="Principal, interest, fees and paid amounts are transparent.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Due</th>
                    <th className="px-3 py-3">Principal</th>
                    <th className="px-3 py-3">Interest</th>
                    <th className="px-3 py-3">Total</th>
                    <th className="px-3 py-3">Paid</th>
                    <th className="px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {data.schedules.length === 0 ? <tr><td className="px-3 py-6 text-slate-400" colSpan={6}>No repayment schedule yet.</td></tr> : null}
                  {data.schedules.slice(0, 12).map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-4 text-slate-300">{shortDate(row.due_date)}</td>
                      <td className="px-3 py-4 text-slate-300">{formatMoney(row.principal_cents)}</td>
                      <td className="px-3 py-4 text-slate-300">{formatMoney(row.interest_cents)}</td>
                      <td className="px-3 py-4 font-black text-white">{formatMoney(row.amount_due_cents)}</td>
                      <td className="px-3 py-4 text-slate-300">{formatMoney(row.paid_cents)}</td>
                      <td className="px-3 py-4"><Pill status={row.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <Panel title="Loan requests" subtitle="Track requests and review finance-admin offers before accepting.">
            <div className="space-y-3">
              {data.loanRequests.length === 0 ? <Empty label="No loan requests yet." /> : null}
              {data.loanRequests.map((request) => {
                const offer = estimateOffer(request);
                return (
                  <div key={request.id} className="rounded-3xl border border-white/10 bg-black/15 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-white">{formatMoney(request.requested_amount_cents)}</p>
                        <p className="mt-1 text-xs text-slate-500">Requested over {request.requested_term_months} month{request.requested_term_months === 1 ? "" : "s"}</p>
                      </div>
                      <Pill status={request.status === "approved" ? "offer ready" : request.status} />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{request.purpose}</p>
                    {request.status === "pending" ? <p className="mt-3 text-sm text-yellow-100">Finance admin is reviewing your request and will choose the interest rate.</p> : null}
                    {request.status === "approved" && offer ? (
                      <div className="mt-4 rounded-3xl border border-emerald-300/20 bg-emerald-400/10 p-4">
                        <p className="text-sm font-black text-emerald-100">Finance approval offer</p>
                        <div className="mt-3 grid gap-2 text-xs text-slate-200">
                          <span>Interest rate: <strong className="text-white">{offer.rate}% annual</strong></span>
                          <span>Method: <strong className="text-white">{offer.method}</strong></span>
                          <span>Admin fee: <strong className="text-white">{formatMoney(request.offer_admin_fee_cents)}</strong></span>
                          <span>Estimated repayable: <strong className="text-white">{formatMoney(offer.totalRepayable)}</strong></span>
                          <span>Estimated monthly repayment: <strong className="text-white">{formatMoney(offer.estimatedMonthly)}</strong></span>
                        </div>
                        {request.review_notes ? <p className="mt-3 text-sm leading-6 text-emerald-50/80">{request.review_notes}</p> : null}
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button type="button" onClick={() => void acceptLoanOffer(request.id)} className="rounded-full bg-emerald-400 px-4 py-2 text-xs font-black text-slate-950">
                            Accept offer and continue
                          </button>
                          <button type="button" onClick={() => void declineLoanOffer(request.id)} className="rounded-full border border-rose-300/25 bg-rose-400/10 px-4 py-2 text-xs font-black text-rose-100">
                            Decline offer
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {request.status === "active" ? <p className="mt-3 text-sm text-emerald-100">Accepted. Your loan is active and the repayment schedule is shown above.</p> : null}
                    {request.member_decision_notes && request.status === "rejected" ? <p className="mt-3 text-sm text-slate-400">{request.member_decision_notes}</p> : null}
                    <p className="mt-2 text-xs text-slate-500">Submitted {shortDate(request.submitted_at)}</p>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Upload document" subtitle="ID, settlement letters, proof of payment and signed agreements.">
            <form onSubmit={uploadDocument} className="space-y-3">
              <label className="block text-sm font-black text-slate-200">
                Document type
                <select name="kind" required className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none">
                  {[
                    ["id_document", "ID / passport"],
                    ["proof_of_loan", "Proof of loan"],
                    ["settlement_letter", "Settlement letter"],
                    ["signed_agreement", "Signed agreement"],
                    ["proof_of_payment", "Proof of payment"],
                    ["other", "Other"],
                  ].map(([value, label]) => <option key={value} value={value} className="bg-slate-950">{label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-black text-slate-200">
                Related loan
                <select name="loan_id" className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none">
                  <option value="">General member document</option>
                  {data.loans.map((loan) => <option key={loan.id} value={loan.id} className="bg-slate-950">{shortDate(loan.start_date)} · {formatMoney(loan.principal_cents)}</option>)}
                </select>
              </label>
              <input name="file" type="file" required className="block w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300" />
              <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-yellow-300 px-5 text-sm font-black text-slate-950" type="submit">
                <FileUp className="h-4 w-4" /> Upload securely
              </button>
            </form>
          </Panel>

          <Panel title="Profile change request" subtitle="Sensitive profile edits are routed to admins for approval.">
            <form onSubmit={submitProfileChange} className="space-y-3">
              <Field name="phone" label="New phone" placeholder="+27..." />
              <Field name="next_of_kin_name" label="Next of kin" placeholder="Name" />
              <Field name="next_of_kin_phone" label="Next of kin phone" placeholder="+27..." />
              <label className="block text-sm font-black text-slate-200">
                Notes
                <textarea name="notes" placeholder="Explain the requested change" className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none" />
              </label>
              <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-black text-slate-950" type="submit">
                <UserCog className="h-4 w-4" /> Request update
              </button>
            </form>
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Panel title="Recent transactions" subtitle="Your contribution, repayment and account ledger history.">
            <List items={data.transactions.map((row) => ({ id: row.id, title: row.kind.replace("_", " "), detail: `${row.reference} · ${shortDate(row.captured_at)}`, value: formatMoney(row.amount_cents), status: row.direction }))} empty="No transactions yet." />
          </Panel>
          <Panel title="Documents and notifications" subtitle="Files and messages attached to your member account.">
            <div className="space-y-4">
              <List items={data.documents.map((row) => ({ id: row.id, title: row.file_name, detail: `${row.kind.replace("_", " ")} · ${shortDate(row.uploaded_at)}`, status: "stored" }))} empty="No documents uploaded yet." />
              <List items={data.notifications.map((row) => ({ id: row.id, title: row.title, detail: row.body, status: row.read_at ? "read" : "unread" }))} empty="No notifications yet." />
            </div>
          </Panel>
        </section>
      </div>
    </div>
  );
}

function estimateOffer(request: LoanRequestRow) {
  if (request.offer_annual_interest_rate === null || !request.offer_interest_method) return null;
  const rate = Number(request.offer_annual_interest_rate);
  const term = request.requested_term_months;
  if (!Number.isFinite(rate) || term <= 0) return null;

  let totalInterest = 0;
  if (request.offer_interest_method === "simple") {
    totalInterest = Math.round(request.requested_amount_cents * (rate / 100) * (term / 12));
  } else {
    const monthlyRate = rate / 100 / 12;
    const basePrincipal = Math.floor(request.requested_amount_cents / term);
    let principalRemainder = request.requested_amount_cents - basePrincipal * term;
    let remainingPrincipal = request.requested_amount_cents;

    for (let installment = 1; installment <= term; installment += 1) {
      let principal = basePrincipal + (principalRemainder > 0 ? 1 : 0);
      if (principalRemainder > 0) principalRemainder -= 1;
      if (installment === term) principal = remainingPrincipal;
      totalInterest += Math.round(remainingPrincipal * monthlyRate);
      remainingPrincipal = Math.max(0, remainingPrincipal - principal);
    }
  }

  const adminFee = request.offer_admin_fee_cents ?? 0;
  const totalRepayable = request.requested_amount_cents + totalInterest + adminFee;

  return {
    rate,
    method: request.offer_interest_method.replace("_", " "),
    totalInterest,
    totalRepayable,
    estimatedMonthly: Math.ceil(totalRepayable / term),
  };
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: typeof WalletCards; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5">
      <Icon className="h-6 w-6 text-emerald-200" />
      <p className="mt-4 text-sm font-bold text-slate-400">{label}</p>
      <p className="mt-1 text-3xl font-black tracking-[-0.04em] text-white">{value}</p>
      <p className="mt-3 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/10">
      <h2 className="text-xl font-black tracking-[-0.03em] text-white">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-400">{subtitle}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field({ label, name, placeholder, type = "text", required = false }: { label: string; name: string; placeholder?: string; type?: string; required?: boolean }) {
  return (
    <label className="block text-sm font-black text-slate-200">
      {label}
      <input name={name} type={type} required={required} placeholder={placeholder} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-300/30" />
    </label>
  );
}

function List({ items, empty }: { items: { id: string; title: string; detail: string; value?: string; status: string }[]; empty: string }) {
  if (items.length === 0) return <Empty label={empty} />;
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="flex items-start justify-between gap-4 rounded-3xl border border-white/10 bg-black/15 p-4">
          <div>
            <p className="font-black capitalize text-white">{item.title}</p>
            <p className="mt-1 text-sm leading-6 text-slate-400">{item.detail}</p>
          </div>
          <div className="text-right">
            {item.value ? <p className="mb-2 font-black text-white">{item.value}</p> : null}
            <Pill status={item.status} />
          </div>
        </div>
      ))}
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
