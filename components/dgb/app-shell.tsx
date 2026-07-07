"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Landmark, LogOut, ShieldCheck, UserRound } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type DgbProfile, isAdminRole, roleLabel } from "@/lib/dgb-live";

export function DgbAppShell({
  profile,
  supabase,
  children,
}: {
  profile: DgbProfile;
  supabase: SupabaseClient;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const admin = isAdminRole(profile.role);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <main className="min-h-screen bg-[#06111f] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#06111f]/90 px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl border border-yellow-300/35 bg-yellow-300/15">
              <Landmark className="h-6 w-6 text-yellow-200" />
            </span>
            <span>
              <span className="block text-xs font-black uppercase tracking-[0.24em] text-emerald-200">DGB secure portal</span>
              <span className="block text-xl font-black tracking-[-0.04em]">Dunne Group Bank</span>
            </span>
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <Link className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm font-bold text-white/85 hover:bg-white/12" href="/member">
              Member
            </Link>
            {admin ? (
              <Link className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-sm font-bold text-emerald-100 hover:bg-emerald-300/15" href="/admin">
                Admin
              </Link>
            ) : null}
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-2 text-sm">
              {admin ? <ShieldCheck className="h-4 w-4 text-emerald-200" /> : <UserRound className="h-4 w-4 text-slate-300" />}
              <span className="font-bold">{profile.full_name}</span>
              <span className="text-slate-400">· {roleLabel(profile.role)}</span>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm font-bold text-white/85 hover:bg-white/12"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </header>
      {children}
    </main>
  );
}

export function StatusPill({ status }: { status: string }) {
  return <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black capitalize text-white/90">{status.replace("_", " ")}</span>;
}
