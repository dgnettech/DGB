"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { type DgbProfile, isAdminRole } from "@/lib/dgb-live";

type AuthState =
  | { status: "loading"; supabase: SupabaseClient; session: null; profile: null; message?: string }
  | { status: "signed-out"; supabase: SupabaseClient; session: null; profile: null; message?: string }
  | { status: "missing-profile"; supabase: SupabaseClient; session: Session; profile: null; message?: string }
  | { status: "ready"; supabase: SupabaseClient; session: Session; profile: DgbProfile; message?: string };

export function useDgbAuth({ adminOnly = false }: { adminOnly?: boolean } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [state, setState] = useState<AuthState>({ status: "loading", supabase, session: null, profile: null });

  useEffect(() => {
    let alive = true;

    async function load() {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (!alive) return;

      if (sessionError || !sessionData.session) {
        setState({
          status: "signed-out",
          supabase,
          session: null,
          profile: null,
          message: sessionError?.message,
        });
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }

      const session = sessionData.session;
      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("id,email,full_name,role,mfa_enabled")
        .eq("id", session.user.id)
        .maybeSingle<DgbProfile>();

      if (!alive) return;

      if (profileError || !profile) {
        setState({
          status: "missing-profile",
          supabase,
          session,
          profile: null,
          message: profileError?.message ?? "Your Supabase Auth account is not linked to a DGB user profile yet.",
        });
        return;
      }

      if (adminOnly && !isAdminRole(profile.role)) {
        router.replace("/member");
      }

      setState({ status: "ready", supabase, session, profile });
    }

    load();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [adminOnly, pathname, router, supabase]);

  return state;
}

export function AuthGate({
  adminOnly = false,
  children,
}: {
  adminOnly?: boolean;
  children: (state: Extract<AuthState, { status: "ready" }>) => React.ReactNode;
}) {
  const state = useDgbAuth({ adminOnly });

  if (state.status === "loading") {
    return <FullScreenNotice title="Checking secure session" body="Loading your DGB profile and role..." />;
  }

  if (state.status === "missing-profile") {
    return (
      <FullScreenNotice
        title="DGB profile not linked yet"
        body="You are signed in to Supabase Auth, but an admin still needs to create or link your DGB user/member profile before the portal can show private data."
        detail={state.message}
        actionLabel="Sign out"
        onAction={() => state.supabase.auth.signOut().then(() => window.location.assign("/login"))}
      />
    );
  }

  if (state.status === "signed-out") {
    return <FullScreenNotice title="Redirecting to login" body="Secure access requires a DGB login." detail={state.message} />;
  }

  return <>{children(state)}</>;
}

function FullScreenNotice({
  title,
  body,
  detail,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#06111f] px-5 text-white">
      <div className="max-w-xl rounded-[2rem] border border-white/10 bg-white/[0.07] p-8 text-center shadow-2xl shadow-black/30">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-200">DGB secure access</p>
        <h1 className="mt-4 text-3xl font-black tracking-[-0.04em]">{title}</h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">{body}</p>
        {detail ? <p className="mt-4 rounded-2xl bg-black/20 p-3 text-xs text-slate-400">{detail}</p> : null}
        {actionLabel ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-6 rounded-full bg-emerald-400 px-5 py-3 text-sm font-black text-slate-950"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </main>
  );
}
