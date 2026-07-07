"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Landmark, ShieldCheck, UserPlus } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { isAdminRole, type DgbProfile } from "@/lib/dgb-live";

type BootstrapStatus = {
  has_users: boolean;
  auth_user_count: number;
  public_user_count: number;
  member_count: number;
};

export default function RegisterPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [status, setStatus] = useState<BootstrapStatus | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function loadStatus() {
      const { data, error: statusError } = await supabase.rpc("bootstrap_status");
      if (!alive) return;
      if (statusError) {
        setError(statusError.message);
        return;
      }
      setStatus(Array.isArray(data) ? data[0] : data);
    }
    loadStatus();
    return () => {
      alive = false;
    };
  }, [supabase]);

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/login` : undefined,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setBusy(false);
      return;
    }

    if (!data.session) {
      setMessage("Account created. If Supabase email confirmation is enabled, check your email and then log in.");
      setBusy(false);
      return;
    }

    const { data: profile } = await supabase
      .from("users")
      .select("id,email,full_name,role,mfa_enabled")
      .eq("id", data.session.user.id)
      .maybeSingle<DgbProfile>();

    if (profile) {
      router.replace(isAdminRole(profile.role) ? "/admin" : "/member");
      return;
    }

    setMessage("Account created. Your DGB profile is being prepared — log in again in a moment.");
    setBusy(false);
  }

  const setupMode = !status?.has_users;

  return (
    <main className="grid min-h-screen bg-[#06111f] text-white lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative flex items-center px-5 py-12 sm:px-8 lg:px-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.24),transparent_34rem),radial-gradient(circle_at_bottom_right,rgba(234,179,8,0.18),transparent_32rem)]" />
        <div className="relative max-w-2xl">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="grid h-13 w-13 place-items-center rounded-2xl border border-yellow-300/35 bg-yellow-300/15">
              <Landmark className="h-7 w-7 text-yellow-200" />
            </span>
            <span>
              <span className="block text-xs font-black uppercase tracking-[0.28em] text-emerald-200">DGB secure setup</span>
              <span className="block text-2xl font-black tracking-[-0.04em]">Dunne Group Bank</span>
            </span>
          </Link>
          <h1 className="mt-12 text-5xl font-black tracking-[-0.06em] sm:text-6xl">
            {setupMode ? "Create the first DGB super admin." : "Create a member login request."}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
            {setupMode
              ? "Because there are no DGB users yet, the first registered account becomes the super admin. After this, new accounts default to member access and must be linked to a member profile."
              : "Register a login with the same email your finance admin used on your DGB member record. The system will auto-link matching profiles where possible."}
          </p>
          <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 text-sm leading-6 text-slate-300">
            <ShieldCheck className="mb-3 h-5 w-5 text-emerald-200" />
            <strong className="text-white">Current setup:</strong>{" "}
            {status ? `${status.public_user_count} DGB users, ${status.member_count} members.` : "Checking Supabase..."}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-8">
        <form onSubmit={handleRegister} className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.07] p-7 shadow-2xl shadow-black/30 backdrop-blur-xl">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-200">
            <UserPlus className="h-7 w-7" />
          </div>
          <h2 className="mt-6 text-3xl font-black tracking-[-0.04em]">{setupMode ? "Bootstrap admin" : "Register"}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Use a strong password. This creates a Supabase Auth user and DGB profile row.</p>

          <label className="mt-6 block text-sm font-black text-slate-200" htmlFor="fullName">Full name</label>
          <input
            id="fullName"
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-300/30"
            placeholder="Adam Dunne"
          />

          <label className="mt-4 block text-sm font-black text-slate-200" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-300/30"
            placeholder="admin@example.com"
          />

          <label className="mt-4 block text-sm font-black text-slate-200" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-300/30"
            placeholder="Minimum 8 characters"
          />

          {message ? (
            <div className="mt-4 flex gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{message}</span>
            </div>
          ) : null}
          {error ? (
            <div className="mt-4 flex gap-3 rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-emerald-400 px-6 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 disabled:opacity-60"
          >
            {busy ? "Creating account..." : setupMode ? "Create first super admin" : "Create login"} <ArrowRight className="h-4 w-4" />
          </button>
          <Link href="/login" className="mt-4 block text-center text-sm font-bold text-emerald-100 hover:text-white">
            Already registered? Sign in
          </Link>
        </form>
      </section>
    </main>
  );
}
