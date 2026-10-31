import { Wordmark } from "@/components/Wordmark";

import { RetryButton } from "./RetryButton";

/** In place of a signed-in page when the account couldn't be loaded (the
 *  app and focus layouts, onboarding): the message and a retry, never a
 *  redirect. The error itself is logged where the load failed. */
export function AccountError() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center px-4 py-4 sm:px-6">
        <Wordmark />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 pb-16 text-center">
        <h1 role="alert" className="font-heading text-h2 font-bold text-bark">
          Couldn&apos;t load your account. Try again.
        </h1>
        <RetryButton size="default" />
      </main>
    </div>
  );
}
