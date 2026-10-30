"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/Button";

/** "Try again" for a section that failed to load. By default it refreshes
 *  the route, so the page's server loads run again (pending while that's
 *  in flight); a client-side load passes `onRetry` instead. */
export function RetryButton({
  className = "",
  label = "Try again",
  size = "sm",
  onRetry,
}: {
  className?: string;
  label?: string;
  size?: "sm" | "default";
  onRetry?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      size={size}
      disabled={pending}
      aria-busy={pending}
      onClick={() => (onRetry ? onRetry() : startTransition(() => router.refresh()))}
      className={`gap-1.5 ${className}`}
    >
      <RotateCw size={16} aria-hidden="true" className={pending ? "spin" : ""} />
      {pending ? "Trying again…" : label}
    </Button>
  );
}
