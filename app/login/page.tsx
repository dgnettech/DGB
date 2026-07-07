"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Landmark, LockKeyhole, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { isAdminRole, type DgbProfile } from "@/lib/dgb-live";

const ADMIN_USERNAME_EMAIL = "admin@dgbank.co.za";

function resolveLoginIdentifier(value: string) {
  const login = value.trim().toLowerCase();
  return login === "admin" ? ADMIN_USERNAME_EMAIL : login;
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (!alive || !data.session) return;
      const { data: profile } = await supabase
        .from("users")
        .select("id,email,full_name,role,mfa_enabled")
        .eq("id", data.session.user.id)
        .maybeSingle<DgbProfile>();
      if (!profile) return;
      router.replace(isAdminRole(profile.role) ? "/admin" : "/member");
    }
    checkSession();
    return () => {
      alive = false;
    };
  }, [router, supabase]);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({ email: resolveLoginIdentifier(login), password });
    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) {
      setMessage("Login succeeded, but no session was returned. Please try again.");
      setBusy(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("id,email,full_name,role,mfa_enabled")
      .eq("id", userId)
      .maybeSingle<DgbProfile>();

    if (profileError || !profile) {
      setMessage(profileError?.message ?? "Your Auth account is not linked to a DGB profile yet. Ask an admin to link it.");
      setBusy(false);
      return;
    }

    const next = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
    router.replace(next && next !== "/login" ? next : isAdminRole(profile.role) ? "/admin" : "/member");
  }

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
              <span className="block text-xs font-black uppercase tracking-[0.28em] text-emerald-200">DGB private platform</span>
              <span className="block text-2xl font-black tracking-[-0.04em]">Dunne Group Bank</span>
            </span>
          </Link>
          <h1 className="mt-12 text-5xl font-black tracking-[-0.06em] sm:text-6xl">Secure access for members and finance admins.</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
            Sign in to view live DGB balances, contributions, loan requests, repayment schedules, documents and admin workflows protected by Supabase Auth and Row Level Security.
          </p>
          <div className="mt-8 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
            {["RLS protected", "Private app", "Audit-ready"].map((item) => (
              <div key={item} className="rounded-3xl border border-white/10 bg-white/[0.06] p-4">
                <ShieldCheck className="mb-3 h-5 w-5 text-emerald-200" />
                <span className="font-black text-white">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-8">
        <form onSubmit={handleLogin} className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.07] p-7 shadow-2xl shadow-black/30 backdrop-blur-xl">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-200">
            <LockKeyhole className="h-7 w-7" />
          </div>
          <h2 className="mt-6 text-3xl font-black tracking-[-0.04em]">Log in</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Use your DGB username or email and password.</p>

          <label className="mt-6 block text-sm font-black text-slate-200" htmlFor="login">Username or email</label>
          <input
            id="login"
            type="text"
            autoComplete="username"
            required
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none ring-emerald-300/0 transition placeholder:text-slate-500 focus:border-emerald-300/30 focus:ring-4 focus:ring-emerald-300/10"
            placeholder="admin or member@example.com"
          />

          <label className="mt-4 block text-sm font-black text-slate-200" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none ring-emerald-300/0 transition placeholder:text-slate-500 focus:border-emerald-300/30 focus:ring-4 focus:ring-emerald-300/10"
            placeholder="••••••••"
          />

          {message ? (
            <div className="mt-4 flex gap-3 rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{message}</span>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-emerald-400 px-6 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 disabled:opacity-60"
          >
            {busy ? "Signing in..." : "Sign in securely"} <ArrowRight className="h-4 w-4" />
          </button>

          <p className="mt-5 rounded-2xl bg-yellow-300/10 p-4 text-xs leading-5 text-yellow-50">
            New setup? Use registration to create the first super admin. Members can register too, but they only see member data after their email is linked to a DGB member profile.
          </p>
          <Link href="/register" className="mt-4 block text-center text-sm font-bold text-emerald-100 hover:text-white">
            Register or bootstrap first admin
          </Link>
        </form>
      </section>
    </main>
  );
}
