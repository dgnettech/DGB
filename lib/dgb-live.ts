export type DgbRole = "super_admin" | "finance_admin" | "viewer" | "member";

export type DgbProfile = {
  id: string;
  email: string;
  full_name: string;
  role: DgbRole;
  mfa_enabled: boolean;
};

export type LoanInterestMethod = "simple" | "reducing_balance";

export type LoanProductRow = {
  id: string;
  name: string;
  annual_interest_rate: string | number;
  interest_method: LoanInterestMethod;
  max_term_months: number;
  admin_fee_cents: number;
  penalty_rate: string | number;
  active: boolean;
};

export type MemberRow = {
  id: string;
  user_id: string | null;
  member_number: string;
  full_name: string;
  email: string;
  phone: string | null;
  id_passport_number: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  employment_income_notes: string | null;
  status: string;
};

export type AccountRow = {
  id: string;
  member_id: string;
  account_number: string;
  name: string;
  currency: string;
  status: string;
};

export type BalanceRow = {
  account_id: string;
  member_id: string;
  balance_cents: number;
};

export type InterestEarningRow = {
  account_id: string;
  member_id: string;
  interest_earned_cents: number;
};

export type TransactionRow = {
  id: string;
  account_id: string;
  member_id: string;
  loan_id: string | null;
  kind: string;
  direction: "credit" | "debit";
  amount_cents: number;
  reference: string;
  memo: string | null;
  captured_at: string;
};

export type LoanRequestRow = {
  id: string;
  member_id: string;
  loan_product_id: string | null;
  requested_amount_cents: number;
  requested_term_months: number;
  purpose: string;
  external_lender: string | null;
  external_settlement_reference: string | null;
  status: string;
  submitted_at: string;
  review_notes: string | null;
  offer_annual_interest_rate: string | number | null;
  offer_interest_method: LoanInterestMethod | null;
  offer_admin_fee_cents: number;
  offer_start_date: string | null;
  member_accepted_at: string | null;
  member_decision_notes: string | null;
};

export type LoanRow = {
  id: string;
  member_id: string;
  loan_product_id: string | null;
  principal_cents: number;
  annual_interest_rate: string | number;
  interest_method: LoanInterestMethod;
  term_months: number;
  admin_fee_cents: number;
  status: string;
  start_date: string;
};

export type ScheduleRow = {
  id: string;
  loan_id: string;
  installment_number: number;
  due_date: string;
  principal_cents: number;
  interest_cents: number;
  fee_cents: number;
  penalty_cents: number;
  amount_due_cents: number;
  paid_cents: number;
  principal_paid_cents?: number;
  interest_paid_cents?: number;
  fee_paid_cents?: number;
  penalty_paid_cents?: number;
  status: string;
};

export type DocumentRow = {
  id: string;
  member_id: string;
  loan_id: string | null;
  kind: string;
  storage_path: string;
  file_name: string;
  uploaded_at: string;
};

export type ProfileChangeRequestRow = {
  id: string;
  member_id: string;
  requested_changes: Record<string, unknown>;
  status: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
};

export type NotificationRow = {
  id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export function isAdminRole(role: DgbRole) {
  return role === "super_admin" || role === "finance_admin";
}

export function roleLabel(role: DgbRole) {
  return role.replace("_", " ");
}

export function formatMoney(cents: number | null | undefined) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 2,
  }).format((cents ?? 0) / 100);
}

export function parseMoneyToCents(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").replace(/[^0-9.]/g, "");
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return Math.round(amount * 100);
}

export function parsePercent(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").replace(/[^0-9.]/g, "");
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }
  return amount;
}

export function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(new Date(value));
}

export function statusClassName(status: string) {
  const normalized = status.toLowerCase();
  if (["active", "approved", "paid", "read"].includes(normalized)) return "bg-emerald-400/15 text-emerald-100 ring-emerald-300/20";
  if (["pending", "due", "part_paid", "offer ready", "offer sent"].includes(normalized)) return "bg-yellow-300/15 text-yellow-100 ring-yellow-200/20";
  if (["overdue", "rejected", "suspended"].includes(normalized)) return "bg-rose-400/15 text-rose-100 ring-rose-300/20";
  return "bg-white/10 text-slate-100 ring-white/15";
}

export function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120);
}

export function downloadCsv(fileName: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  if (typeof document === "undefined") return;

  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = sanitizeFileName(fileName.endsWith(".csv") ? fileName : `${fileName}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}
