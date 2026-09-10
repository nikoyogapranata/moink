import type { ComponentPropsWithRef } from "react";

type CardTone = "surface" | "white";

interface CardProps extends ComponentPropsWithRef<"div"> {
  tone?: CardTone;
}

const toneClasses: Record<CardTone, string> = {
  surface: "bg-surface",
  white: "bg-white",
};

export function Card({ className = "", tone = "surface", ...props }: CardProps) {
  return (
    <div
      className={`rounded-lg p-6 shadow-float ${toneClasses[tone]} ${className}`}
      {...props}
    />
  );
}
