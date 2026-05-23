"use client";

import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function Nav() {
  const [user, setUser] = useState<User | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth.onAuthStateChange, supabase.auth.getUser]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  return (
    <nav className="border-b border-border bg-background sticky top-0 z-50">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="font-serif text-xl tracking-tight">
          Common<span className="text-terracotta">·</span>Ground
        </Link>

        {/* Center Nav Links */}
        <div className="hidden md:flex items-center gap-8">
          <Link
            href="#topics"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Topics
          </Link>
          <Link
            href="#how-it-works"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            How it Works
          </Link>
          <Link
            href="#about"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            About
          </Link>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link
                href="/profile"
                className="text-sm text-foreground hover:text-muted-foreground transition-colors px-3 py-2"
              >
                Profile
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-sm border border-border px-4 py-2 rounded-sm hover:bg-secondary transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="text-sm text-foreground hover:text-muted-foreground transition-colors px-3 py-2"
              >
                Sign in
              </Link>
              <Link
                href="/sign-in"
                className="text-sm bg-foreground text-primary-foreground px-4 py-2 rounded-sm hover:opacity-90 transition-opacity"
              >
                Join now
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
