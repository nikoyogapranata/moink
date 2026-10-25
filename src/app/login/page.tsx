import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { HillScene } from "@/components/HillScene";
import { getHomePath } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";

import { GoogleSignInButton } from "./google-sign-in-button";

const PEEK_SRC = "/images/mascot/bao/login-peek.webp";
const PEEK_W = 782;
const PEEK_H = 665;

export const metadata: Metadata = {
  title: "Sign in - moink",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(await getHomePath(supabase, user.id));
  }

  const { error } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header>
        <div className="mx-auto flex w-full max-w-6xl items-center px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 whitespace-nowrap"
          >
            <Image
              src="/images/logo/bao.png"
              alt="moink logo"
              width={36}
              height={36}
              className="h-9 w-9 rounded-lg"
            />
            <span className="font-heading text-h1 font-bold text-bark">
              moink
            </span>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="relative w-full max-w-sm">
          {/* Bao's chin is a straight cut at 90.5% of the image height and
              his paws span ~80-97%. The card overlaps the image by ~10.4%
              (17px at w-48, 20px at sm:w-56), so its top edge tucks just
              under his chin while the upper paws stay visible, resting on
              the edge. peek-bob only moves him down, deeper behind the
              card, so the paws never lift off. */}
          <div className="peek-bob relative z-0">
            <Image
              src={PEEK_SRC}
              alt="Bao peeking over the card, smiling"
              width={PEEK_W}
              height={PEEK_H}
              priority
              sizes="(min-width: 640px) 224px, 192px"
              className="mx-auto block h-auto w-48 select-none sm:w-56"
            />
          </div>

          <div className="relative z-10 -mt-4.25 flex flex-col gap-4 rounded-xl bg-surface p-6 text-center shadow-float sm:-mt-5 sm:p-8">
            <h1 className="font-heading text-display font-bold text-bark">
              Ready to learn?
            </h1>
            <p className="font-body text-body text-bark">
              Sign in with Google to start, or pick up where you left off.
            </p>
            {error && (
              <p role="alert" className="font-body text-body-sm text-danger">
                Sign-in didn&apos;t go through. Please try again.
              </p>
            )}
            <GoogleSignInButton />
            <p className="font-body text-body-sm text-bark">
              New here? Your account is created automatically the first time
              you sign in.
            </p>
          </div>
        </div>
      </main>

      <HillScene />
    </div>
  );
}
