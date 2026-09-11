import {
  cloneElement,
  isValidElement,
  type ComponentPropsWithRef,
} from "react";

type ButtonVariant = "primary" | "secondary";
type ButtonSize = "default" | "sm";

interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  // Render the single child element (e.g. a Next.js <Link>) with the button
  // styling instead of a <button>, so a styled link stays valid HTML.
  asChild?: boolean;
}

const base =
  "inline-flex items-center justify-center rounded-pill font-heading font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40 disabled:pointer-events-none disabled:opacity-50";

const variantClasses: Record<ButtonVariant, string> = {
  // text-background: label takes the theme's bg color, so it reads as light
  // text on rust in light mode and dark text on the brighter rust in dark mode.
  primary: "bg-rust text-background hover:bg-rust-dark",
  secondary:
    "border border-bamboo-green bg-transparent text-deep-grass hover:bg-bamboo-green/10",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-11 px-6 text-body",
  sm: "h-9 px-4 text-body-sm",
};

export function Button({
  className = "",
  variant = "primary",
  size = "default",
  type = "button",
  asChild = false,
  children,
  ...props
}: ButtonProps) {
  const classes = `${base} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  if (asChild && isValidElement<{ className?: string }>(children)) {
    return cloneElement(children, {
      className: [classes, children.props.className].filter(Boolean).join(" "),
    });
  }

  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
}
