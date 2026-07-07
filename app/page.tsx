import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Calculator,
  CheckCircle2,
  CreditCard,
  DatabaseZap,
  Download,
  FileCheck2,
  FileText,
  FolderLock,
  Gauge,
  HandCoins,
  Landmark,
  LayoutDashboard,
  LockKeyhole,
  PiggyBank,
  ReceiptText,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  auditLogs,
  calculateSchedule,
  documents,
  fundSummary,
  loanProducts,
  loans,
  loanTotals,
  memberBalance,
  members,
  money,
  notifications,
  transactions,
} from "@/lib/dgb-platform";

const summary = fundSummary();
const focusMember = members[0];
const focusLoan = loans[0];
const focusLoanTotals = loanTotals(focusLoan);
const focusSchedule = calculateSchedule(focusLoan).slice(0, 5);

const statCards = [
  { label: "Available cash", value: money(summary.availableCash), detail: "Contributions + repayments less issued loans", icon: PiggyBank, tone: "text-emerald-300" },
  { label: "Total contributed", value: money(summary.totalContributions), detail: "Manual bank deposits captured", icon: HandCoins, tone: "text-yellow-300" },
  { label: "Loans issued", value: money(summary.totalLoansIssued), detail: "Internal settlement and bridge loans", icon: Landmark, tone: "text-sky-300" },
  { label: "Outstanding", value: money(summary.totalOutstanding), detail: "Principal + transparent interest less paid", icon: ReceiptText, tone: "text-orange-300" },
  { label: "Interest earned", value: money(summary.totalInterestEarned), detail: "Recognised from captured repayments", icon: Calculator, tone: "text-lime-300" },
  { label: "Arrears", value: money(summary.arrears), detail: "Overdue schedule rows requiring follow-up", icon: AlertTriangle, tone: "text-red-300" },
];

const adminWorkflows = [
  "Create members with personal, contact, ID/passport, next-of-kin, banking and employment notes.",
  "Record contributions, withdrawals, loan disbursements and repayments as immutable ledger entries.",
  "Approve or reject loan requests, capture external settlement details and generate schedules.",
  "Upload ID, proof of loan, settlement letters, signed agreements and proof of payment.",
  "Export statements, loan agreements, member reports and audit logs for accounting records.",
];

const securityControls = [
  "Supabase Auth roles: Super Admin, Finance Admin, Viewer and Member.",
  "Row Level Security so members can only read their own accounts, loans, documents and notifications.",
  "Members may submit requests and documents, but approvals and financial postings remain admin-only.",
  "Financial records are append-only; corrections use reversing entries instead of edits or deletes.",
  "Admin actions, document access, approvals and exports are written to audit_logs.",
  "Secure document buckets, strong passwords, optional MFA and backup/export procedures.",
];

const phases = [
  ["Phase 1", "Foundation", "Auth, roles, member creation, account balances, contributions, ledger and audit trail."],
  ["Phase 2", "Loan management", "Requests, approvals, settlements, interest methods, schedules and repayment capture."],
  ["Phase 3", "Documents & reporting", "PDF agreements, statements, document uploads, fund reports and CSV/XLSX exports."],
  ["Phase 4", "Notifications & polish", "Email reminders, overdue alerts, charts, responsive UX and backup tools."],
  ["Phase 5", "Advanced", "Multi-admin permissions, SMS/WhatsApp, bank import, reconciliation, voting and mobile app."],
];

const memberActions = [
  "Submit a new loan request for admin review",
  "Upload supporting documents securely",
  "Download statements and signed agreements",
  "Request profile changes for approval",
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#06111f] text-white">
      <section className="relative border-b border-white/10 px-5 py-6 sm:px-8 lg:px-10">
        <div className="absolute inset-0 -z-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.22),transparent_35rem),radial-gradient(circle_at_top_right,rgba(234,179,8,0.18),transparent_32rem)]" />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-yellow-300/35 bg-yellow-300/15 shadow-2xl shadow-yellow-500/10">
              <Landmark className="h-7 w-7 text-yellow-200" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.34em] text-emerald-200">DGB secure internal platform</p>
              <h1 className="text-2xl font-black tracking-[-0.04em] sm:text-3xl">Dunne Group Bank</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-sm font-bold">
            {['Admin Portal', 'Member Portal', 'Ledger-first MVP'].map((item) => (
              <span key={item} className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-white/85 backdrop-blur">{item}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="relative px-5 py-10 sm:px-8 lg:px-10 lg:py-16">
        <div className="absolute inset-x-0 top-0 -z-0 h-80 bg-gradient-to-b from-emerald-400/10 to-transparent" />
        <div className="relative mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-sm font-black text-emerald-100">
              <ShieldCheck className="h-4 w-4" /> Private family-and-friends financial pool
            </div>
            <h2 className="mt-7 max-w-4xl text-5xl font-black tracking-[-0.065em] text-white sm:text-6xl lg:text-7xl">
              A trustworthy internal banking system for contributions, loans and repayments.
            </h2>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">
              DGB helps administrators manage a shared fund that settles high-interest loans and replaces them with lower-interest internal repayment plans. Members get transparent access to their balances, loan schedules, documents and notifications.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/login" className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-6 py-3 text-sm font-black text-slate-950 shadow-2xl shadow-emerald-500/20 transition hover:-translate-y-0.5">
                Sign in to live portal <ArrowRight className="h-4 w-4" />
              </a>
              <a href="/admin" className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/10 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-white/15">
                Open admin dashboard
              </a>
            </div>
          </div>

          <Card className="border-white/10 bg-white/[0.07] p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="rounded-[1.65rem] border border-white/10 bg-[#091a2f] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Fund command centre</p>
                  <h3 className="mt-1 text-2xl font-black text-white">Live MVP snapshot</h3>
                </div>
                <div className="rounded-2xl bg-emerald-400/15 p-3 text-emerald-200"><LayoutDashboard className="h-6 w-6" /></div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {statCards.slice(0, 4).map((stat) => (
                  <div key={stat.label} className="rounded-3xl border border-white/10 bg-white/[0.06] p-4">
                    <stat.icon className={`h-5 w-5 ${stat.tone}`} />
                    <p className="mt-4 text-sm font-bold text-slate-400">{stat.label}</p>
                    <p className="mt-1 text-2xl font-black text-white">{stat.value}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{stat.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section id="admin" className="px-5 py-10 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.28em] text-emerald-200">Admin portal</p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">Fund-wide control with audit-safe operations</h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-slate-400">Every money movement is represented by an immutable transaction. Balances are calculated from the ledger, not manually typed.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {statCards.map((stat) => (
              <Card key={stat.label} className="border-white/10 bg-white/[0.06] p-5 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-400">{stat.label}</p>
                    <p className="mt-2 text-3xl font-black tracking-[-0.04em]">{stat.value}</p>
                  </div>
                  <span className="rounded-2xl bg-white/8 p-3"><stat.icon className={`h-6 w-6 ${stat.tone}`} /></span>
                </div>
                <p className="mt-5 text-sm leading-6 text-slate-400">{stat.detail}</p>
              </Card>
            ))}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
            <Card className="overflow-hidden border-white/10 bg-white/[0.06] text-white">
              <div className="border-b border-white/10 p-5">
                <h3 className="text-xl font-black">Member accounts and balances</h3>
                <p className="mt-1 text-sm text-slate-400">Personal details, role, risk status and calculated wallet balance.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="px-5 py-4">Member</th>
                      <th className="px-5 py-4">Contact</th>
                      <th className="px-5 py-4">Employment notes</th>
                      <th className="px-5 py-4">Balance</th>
                      <th className="px-5 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {members.map((member) => (
                      <tr key={member.id}>
                        <td className="px-5 py-4">
                          <p className="font-black text-white">{member.name}</p>
                          <p className="text-xs text-slate-500">ID {member.idNumber} • {member.nextOfKin}</p>
                        </td>
                        <td className="px-5 py-4 text-slate-300">{member.email}<br />{member.phone}</td>
                        <td className="px-5 py-4 text-slate-400">{member.employment}</td>
                        <td className="px-5 py-4 font-black text-emerald-200">{money(memberBalance(member.id))}</td>
                        <td className="px-5 py-4"><span className="rounded-full bg-white/8 px-3 py-1 text-xs font-black capitalize text-white">{member.risk}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="border-yellow-300/20 bg-yellow-300/10 p-5 text-yellow-50">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-1 h-6 w-6 shrink-0 text-yellow-200" />
                <div>
                  <h3 className="text-xl font-black">Compliance reminder before real-money use</h3>
                  <p className="mt-3 text-sm leading-7 text-yellow-50/85">
                    DGB is a private internal platform, but the owner should still obtain advice on legal structure, credit-provider registration, written member agreements, POPIA compliance, accounting records, tax treatment and banking controls. This reminder is non-blocking and remains visible to admins.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="px-5 py-10 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-3">
          <Card className="border-white/10 bg-white/[0.06] p-6 text-white lg:col-span-2">
            <div className="flex items-center gap-3"><CreditCard className="h-6 w-6 text-emerald-300" /><h3 className="text-2xl font-black">Loan products and transparent interest</h3></div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {loanProducts.map((product) => (
                <div key={product.name} className="rounded-3xl border border-white/10 bg-[#07182b] p-5">
                  <p className="text-lg font-black">{product.name}</p>
                  <p className="mt-3 text-3xl font-black text-emerald-200">{product.annualRate}%</p>
                  <p className="mt-1 text-sm text-slate-400">{product.method.replace('-', ' ')} interest • up to {product.maxMonths} months</p>
                  <p className="mt-4 text-xs leading-5 text-slate-500">Admin fee {money(product.adminFee)} • penalty rule {product.penaltyRate}% on overdue instalments</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="border-white/10 bg-white/[0.06] p-6 text-white">
            <div className="flex items-center gap-3"><FolderLock className="h-6 w-6 text-yellow-200" /><h3 className="text-2xl font-black">Secure documents</h3></div>
            <div className="mt-5 space-y-3">
              {documents.map((document) => (
                <div key={document} className="flex items-center gap-3 rounded-2xl bg-white/[0.05] p-3 text-sm font-bold text-slate-300"><FileCheck2 className="h-4 w-4 text-emerald-300" /> {document}</div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <section id="member" className="px-5 py-10 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[0.82fr_1.18fr]">
          <Card className="border-white/10 bg-white/[0.06] p-6 text-white">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.24em] text-emerald-200">Member portal</p>
                <h3 className="mt-2 text-3xl font-black">{focusMember.name}</h3>
              </div>
              <WalletCards className="h-8 w-8 text-yellow-200" />
            </div>
            <div className="mt-6 rounded-[1.5rem] bg-gradient-to-br from-emerald-300 to-yellow-200 p-5 text-slate-950">
              <p className="text-sm font-black uppercase tracking-[0.22em] opacity-70">DGB wallet balance</p>
              <p className="mt-4 text-4xl font-black tracking-[-0.05em]">{money(memberBalance(focusMember.id))}</p>
              <p className="mt-6 text-sm font-bold opacity-75">Calculated from contributions, loan disbursements, repayments, fees and reversals.</p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {memberActions.map((action) => (
                <div key={action} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-sm font-bold leading-6 text-slate-300">
                  {action}
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-3">
              {notifications.map((note) => (
                <div key={note} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-sm text-slate-300"><Bell className="mt-0.5 h-4 w-4 text-emerald-300" /> {note}</div>
              ))}
            </div>
          </Card>

          <Card className="border-white/10 bg-white/[0.06] text-white">
            <div className="border-b border-white/10 p-6">
              <p className="text-sm font-black uppercase tracking-[0.24em] text-emerald-200">Active loan</p>
              <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h3 className="text-3xl font-black tracking-[-0.04em]">{focusLoan.product}</h3>
                  <p className="mt-1 text-sm text-slate-400">{focusLoan.externalSettlement}</p>
                </div>
                <span className="rounded-full bg-emerald-300/15 px-4 py-2 text-sm font-black text-emerald-100">{focusLoan.method.replace('-', ' ')} interest</span>
              </div>
            </div>
            <div className="grid gap-4 p-6 md:grid-cols-4">
              {[
                ["Principal", money(focusLoan.principal)],
                ["Interest", money(focusLoanTotals.totalInterest)],
                ["Total repayable", money(focusLoanTotals.totalRepayable)],
                ["Outstanding", money(focusLoanTotals.outstanding)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-white/[0.05] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
                  <p className="mt-2 text-xl font-black">{value}</p>
                </div>
              ))}
            </div>
            <div className="px-6 pb-6">
              <div className="overflow-hidden rounded-3xl border border-white/10">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-slate-500">
                    <tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Due date</th><th className="px-4 py-3">Principal</th><th className="px-4 py-3">Interest</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {focusSchedule.map((row) => (
                      <tr key={row.installment}>
                        <td className="px-4 py-3 font-black">{row.installment}</td>
                        <td className="px-4 py-3 text-slate-300">{row.dueDate}</td>
                        <td className="px-4 py-3">{money(row.principal)}</td>
                        <td className="px-4 py-3">{money(row.interest)}</td>
                        <td className="px-4 py-3 font-black text-white">{money(row.amount)}</td>
                        <td className="px-4 py-3"><span className="rounded-full bg-white/8 px-3 py-1 text-xs font-black capitalize">{row.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section className="px-5 py-10 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-3">
          <Card className="border-white/10 bg-white/[0.06] p-6 text-white">
            <div className="flex items-center gap-3"><DatabaseZap className="h-6 w-6 text-emerald-300" /><h3 className="text-2xl font-black">MVP database model</h3></div>
            <p className="mt-4 text-sm leading-7 text-slate-400">users, members, accounts, contributions, transactions, loan_requests, profile_change_requests, loans, repayment_schedules, repayments, documents, notifications, audit_logs, settings and loan_products.</p>
          </Card>
          <Card className="border-white/10 bg-white/[0.06] p-6 text-white">
            <div className="flex items-center gap-3"><LockKeyhole className="h-6 w-6 text-yellow-200" /><h3 className="text-2xl font-black">Security posture</h3></div>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
              {securityControls.map((control) => <li key={control} className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />{control}</li>)}
            </ul>
          </Card>
          <Card className="border-white/10 bg-white/[0.06] p-6 text-white">
            <div className="flex items-center gap-3"><Gauge className="h-6 w-6 text-sky-300" /><h3 className="text-2xl font-black">Admin workflows</h3></div>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
              {adminWorkflows.map((workflow) => <li key={workflow} className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />{workflow}</li>)}
            </ul>
          </Card>
        </div>
      </section>

      <section className="px-5 py-10 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-white/10 bg-white/[0.06] p-6 text-white">
            <div className="flex items-center gap-3"><FileText className="h-6 w-6 text-yellow-200" /><h3 className="text-2xl font-black">Immutable ledger preview</h3></div>
            <div className="mt-5 space-y-3">
              {transactions.slice(0, 6).map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.05] p-3 text-sm">
                  <div><p className="font-black text-white">{transaction.memo}</p><p className="text-xs text-slate-500">{transaction.date} • {transaction.kind} • locked</p></div>
                  <p className={transaction.direction === 'credit' ? 'font-black text-emerald-200' : 'font-black text-red-200'}>{transaction.direction === 'credit' ? '+' : '-'}{money(transaction.amount)}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card className="border-white/10 bg-white/[0.06] p-6 text-white">
            <div className="flex items-center gap-3"><UsersRound className="h-6 w-6 text-emerald-300" /><h3 className="text-2xl font-black">Delivery phases</h3></div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {phases.map(([phase, title, copy]) => (
                <div key={phase} className="rounded-3xl border border-white/10 bg-[#07182b] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-200">{phase}</p>
                  <p className="mt-2 text-lg font-black">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{copy}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <section className="px-5 pb-16 pt-8 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
          <Card className="border-white/10 bg-white/[0.06] p-6 text-white">
            <div className="flex items-center gap-3"><ReceiptText className="h-6 w-6 text-sky-300" /><h3 className="text-2xl font-black">Audit trail</h3></div>
            <div className="mt-5 space-y-3">
              {auditLogs.map((log) => <p key={log} className="rounded-2xl bg-white/[0.05] p-3 text-sm text-slate-300">{log}</p>)}
            </div>
          </Card>
          <Card className="border-white/10 bg-white/[0.06] p-6 text-white">
            <div className="flex items-center gap-3"><Download className="h-6 w-6 text-emerald-300" /><h3 className="text-2xl font-black">Reports and exports</h3></div>
            <p className="mt-4 text-sm leading-7 text-slate-400">The MVP design includes server-side PDF statement and agreement templates, member reports, CSV/XLSX exports, backup routines and POPIA-style record export support. Direct bank integration is intentionally deferred; manual bank payment capture is supported first.</p>
          </Card>
        </div>
      </section>
    </main>
  );
}
