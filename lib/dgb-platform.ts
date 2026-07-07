export type Role = "Super Admin" | "Finance Admin" | "Viewer" | "Member";
export type InterestMethod = "simple" | "reducing-balance";
export type LoanStatus = "pending" | "approved" | "active" | "closed" | "overdue";
export type TransactionKind = "contribution" | "loan-disbursement" | "repayment" | "fee" | "reversal" | "withdrawal";

export type Member = {
  id: string;
  name: string;
  role: Role;
  email: string;
  phone: string;
  idNumber: string;
  nextOfKin: string;
  employment: string;
  bank: string;
  risk: "low" | "watch" | "arrears";
};

export type Transaction = {
  id: string;
  memberId: string;
  kind: TransactionKind;
  amount: number;
  direction: "credit" | "debit";
  date: string;
  memo: string;
  immutable: true;
};

export type LoanProduct = {
  name: string;
  method: InterestMethod;
  annualRate: number;
  maxMonths: number;
  adminFee: number;
  penaltyRate: number;
};

export type Loan = {
  id: string;
  memberId: string;
  product: string;
  principal: number;
  annualRate: number;
  termMonths: number;
  method: InterestMethod;
  startDate: string;
  status: LoanStatus;
  externalSettlement: string;
  paid: number;
};

export type RepaymentScheduleItem = {
  installment: number;
  dueDate: string;
  principal: number;
  interest: number;
  amount: number;
  status: "paid" | "due" | "overdue";
};

export const members: Member[] = [
  {
    id: "m-001",
    name: "Megan Dunne",
    role: "Member",
    email: "megan@dgb.local",
    phone: "+27 82 555 0191",
    idNumber: "••••••••9012",
    nextOfKin: "A. Dunne — spouse",
    employment: "Permanent teacher, R31 000 net income notes captured",
    bank: "FNB cheque •••• 1048",
    risk: "low",
  },
  {
    id: "m-002",
    name: "Liam Dunne",
    role: "Member",
    email: "liam@dgb.local",
    phone: "+27 83 555 0104",
    idNumber: "••••••••4421",
    nextOfKin: "T. Dunne — sibling",
    employment: "Self-employed contractor, average R48 500 monthly income",
    bank: "Capitec savings •••• 8820",
    risk: "watch",
  },
  {
    id: "m-003",
    name: "Grace Naidoo",
    role: "Member",
    email: "grace@dgb.local",
    phone: "+27 84 555 0137",
    idNumber: "••••••••3301",
    nextOfKin: "R. Naidoo — parent",
    employment: "Permanent nurse, overtime variable",
    bank: "Standard Bank •••• 6392",
    risk: "arrears",
  },
];

export const loanProducts: LoanProduct[] = [
  { name: "Settlement Assist", method: "reducing-balance", annualRate: 12, maxMonths: 24, adminFee: 250, penaltyRate: 2 },
  { name: "Short Bridge", method: "simple", annualRate: 8, maxMonths: 6, adminFee: 0, penaltyRate: 1.5 },
  { name: "Family Relief", method: "reducing-balance", annualRate: 6, maxMonths: 36, adminFee: 150, penaltyRate: 1 },
];

export const transactions: Transaction[] = [
  { id: "txn-1001", memberId: "m-001", kind: "contribution", amount: 36500, direction: "credit", date: "2026-06-01", memo: "Family pool capital contribution", immutable: true },
  { id: "txn-1002", memberId: "m-002", kind: "contribution", amount: 29500, direction: "credit", date: "2026-06-02", memo: "Family pool capital contribution", immutable: true },
  { id: "txn-1003", memberId: "m-003", kind: "contribution", amount: 14200, direction: "credit", date: "2026-06-03", memo: "Family pool capital contribution", immutable: true },
  { id: "txn-1004", memberId: "m-001", kind: "loan-disbursement", amount: 28000, direction: "debit", date: "2026-06-05", memo: "Settlement paid to external lender: Store card refinance", immutable: true },
  { id: "txn-1005", memberId: "m-001", kind: "repayment", amount: 2900, direction: "credit", date: "2026-07-01", memo: "Manual EFT repayment captured by finance admin", immutable: true },
  { id: "txn-1006", memberId: "m-002", kind: "loan-disbursement", amount: 18000, direction: "debit", date: "2026-06-12", memo: "Vehicle repair bridge payout", immutable: true },
  { id: "txn-1007", memberId: "m-003", kind: "repayment", amount: 1200, direction: "credit", date: "2026-06-26", memo: "Partial repayment", immutable: true },
  { id: "txn-1008", memberId: "m-003", kind: "loan-disbursement", amount: 22000, direction: "debit", date: "2026-05-15", memo: "High-interest personal loan settlement", immutable: true },
];

export const loans: Loan[] = [
  { id: "loan-2401", memberId: "m-001", product: "Settlement Assist", principal: 28000, annualRate: 12, termMonths: 12, method: "reducing-balance", startDate: "2026-06-05", status: "active", externalSettlement: "Store card settlement letter uploaded", paid: 2900 },
  { id: "loan-2402", memberId: "m-002", product: "Short Bridge", principal: 18000, annualRate: 8, termMonths: 6, method: "simple", startDate: "2026-06-12", status: "active", externalSettlement: "Direct payout to member, proof pending", paid: 0 },
  { id: "loan-2403", memberId: "m-003", product: "Settlement Assist", principal: 22000, annualRate: 12, termMonths: 10, method: "reducing-balance", startDate: "2026-05-15", status: "overdue", externalSettlement: "Capfin settlement proof stored", paid: 1200 },
];

const addMonths = (date: string, months: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 10);
};

const splitAmount = (total: number, installmentIndex: number, totalInstallments: number) => {
  const wholeTotal = Math.round(total);
  const base = Math.floor(wholeTotal / totalInstallments);
  const remainder = wholeTotal % totalInstallments;
  return base + (installmentIndex < remainder ? 1 : 0);
};

export const money = (amount: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(amount);

export function memberBalance(memberId: string) {
  return transactions
    .filter((transaction) => transaction.memberId === memberId)
    .reduce((total, transaction) => total + (transaction.direction === "credit" ? transaction.amount : -transaction.amount), 0);
}

export function calculateSchedule(loan: Loan): RepaymentScheduleItem[] {
  const principalTotal = Math.round(loan.principal);
  const monthlyRate = loan.annualRate / 100 / 12;
  const simpleInterestTotal = Math.round(principalTotal * (loan.annualRate / 100) * (loan.termMonths / 12));
  let remainingPrincipal = principalTotal;
  let paidRemaining = loan.paid;

  return Array.from({ length: loan.termMonths }, (_, index) => {
    const installment = index + 1;
    const principal = loan.method === "simple"
      ? splitAmount(principalTotal, index, loan.termMonths)
      : index === loan.termMonths - 1
        ? remainingPrincipal
        : splitAmount(principalTotal, index, loan.termMonths);
    const interest = loan.method === "simple"
      ? splitAmount(simpleInterestTotal, index, loan.termMonths)
      : Math.round(remainingPrincipal * monthlyRate);
    const amount = principal + interest;
    remainingPrincipal = Math.max(0, remainingPrincipal - principal);
    const status = paidRemaining >= amount ? "paid" : installment <= 2 && loan.status === "overdue" ? "overdue" : "due";
    paidRemaining = Math.max(0, paidRemaining - amount);

    return {
      installment,
      dueDate: addMonths(loan.startDate, installment),
      principal,
      interest,
      amount,
      status,
    };
  });
}

export function paidInterest(schedule: RepaymentScheduleItem[], paidAmount: number) {
  let remainingPaid = Math.round(paidAmount);

  return schedule.reduce((total, row) => {
    const interestPaid = Math.min(row.interest, remainingPaid);
    remainingPaid = Math.max(0, remainingPaid - interestPaid);
    const principalPaid = Math.min(row.principal, remainingPaid);
    remainingPaid = Math.max(0, remainingPaid - principalPaid);
    return total + interestPaid;
  }, 0);
}

export function loanTotals(loan: Loan) {
  const schedule = calculateSchedule(loan);
  const totalInterest = schedule.reduce((total, row) => total + row.interest, 0);
  const totalRepayable = schedule.reduce((total, row) => total + row.amount, 0);
  const outstanding = Math.max(0, totalRepayable - loan.paid);
  const arrears = schedule
    .filter((row) => row.status === "overdue")
    .reduce((total, row) => total + row.amount, 0);

  return { schedule, totalInterest, totalRepayable, outstanding, arrears };
}

export function fundSummary() {
  const totalContributions = transactions
    .filter((transaction) => transaction.kind === "contribution")
    .reduce((total, transaction) => total + transaction.amount, 0);
  const totalLoansIssued = loans.reduce((total, loan) => total + loan.principal, 0);
  const totalOutstanding = loans.reduce((total, loan) => total + loanTotals(loan).outstanding, 0);
  const totalInterestEarned = loans.reduce((total, loan) => total + paidInterest(calculateSchedule(loan), loan.paid), 0);
  const arrears = loans.reduce((total, loan) => total + loanTotals(loan).arrears, 0);
  const repayments = transactions
    .filter((transaction) => transaction.kind === "repayment")
    .reduce((total, transaction) => total + transaction.amount, 0);
  const availableCash = totalContributions + repayments - totalLoansIssued;

  return { totalContributions, totalLoansIssued, totalOutstanding, totalInterestEarned, arrears, repayments, availableCash };
}

export const auditLogs = [
  "Finance Admin recorded EFT repayment for Megan Dunne — txn-1005",
  "Super Admin approved loan-2402 with simple-interest method",
  "Viewer exported member statement for Grace Naidoo",
  "System locked transaction ledger against direct edits",
];

export const documents = [
  "ID / passport copy",
  "External loan statement",
  "Settlement letter",
  "Signed DGB agreement",
  "Proof of payment",
];

export const notifications = [
  "Loan request approved and agreement ready for signature",
  "Repayment due in 5 days",
  "Payment overdue: arrears flagged for finance review",
  "Contribution captured and balance updated",
];
