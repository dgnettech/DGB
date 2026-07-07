import Link from "next/link";
import { Landmark, LockKeyhole, ShieldCheck, UserPlus } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#06111f] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.22),transparent_34rem),radial-gradient(circle_at_bottom_right,rgba(234,179,8,0.16),transparent_32rem)]" />
      <section className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-yellow-300/35 bg-yellow-300/15 shadow-2xl shadow-yellow-500/10">
              <Landmark className="h-8 w-8 text-yellow-200" />
            </div>

            <p className="mt-6 text-xs font-black uppercase tracking-[0.34em] text-emerald-200">
              DGB secure private platform
            </p>
            <h1 className="mt-4 text-5xl font-black tracking-[-0.065em] sm:text-6xl">
              Dunne Group Bank
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              Private member access for contributions, balances, loan requests, repayment schedules and admin-approved financial workflows.
            </p>
          </div>

          <div className="mx-auto mt-10 grid max-w-3xl gap-4 md:grid-cols-2">
            <Link
              href="/register"
              className="group rounded-[2rem] border border-emerald-300/20 bg-emerald-400 p-6 text-slate-950 shadow-2xl shadow-emerald-500/20 transition hover:-translate-y-1 hover:shadow-emerald-500/30"
            >
              <div className="flex items-start justify-between gap-5">
                <div>
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950/10">
                    <UserPlus className="h-6 w-6" />
                  </div>
                  <h2 className="mt-6 text-3xl font-black tracking-[-0.04em]">Register</h2>
                  <p className="mt-3 text-sm font-bold leading-6 text-slate-800">
                    Create the first super-admin account or register a member login for an existing DGB profile.
                  </p>
                </div>
                <span className="mt-1 rounded-full bg-slate-950/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em]">
                  Start
                </span>
              </div>
            </Link>

            <Link
              href="/login"
              className="group rounded-[2rem] border border-white/12 bg-white/[0.08] p-6 shadow-2xl shadow-black/20 backdrop-blur-xl transition hover:-translate-y-1 hover:bg-white/[0.12]"
            >
              <div className="flex items-start justify-between gap-5">
                <div>
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-emerald-200">
                    <LockKeyhole className="h-6 w-6" />
                  </div>
                  <h2 className="mt-6 text-3xl font-black tracking-[-0.04em] text-white">Login</h2>
                  <p className="mt-3 text-sm font-bold leading-6 text-slate-300">
                    Sign in to access your member portal or admin dashboard with Supabase-protected permissions.
                  </p>
                </div>
                <span className="mt-1 rounded-full border border-white/12 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-white">
                  Enter
                </span>
              </div>
            </Link>
          </div>

          <div className="mx-auto mt-8 flex max-w-3xl items-start gap-3 rounded-3xl border border-white/10 bg-white/[0.06] p-5 text-sm leading-6 text-slate-300">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" />
            <p>
              DGB is a private internal system. Member data, documents and financial records are protected by Supabase Auth and Row Level Security.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
