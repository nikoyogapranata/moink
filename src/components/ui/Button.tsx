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
  "inline-flex items-center justify-center whitespace-nowrap rounded-pill font-heading transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40 disabled:pointer-events-none disabled:opacity-50";

const variantClasses: Record<ButtonVariant, string> = {
  // text-background: label takes the theme's bg color, so it reads as light
  // text on rust in light mode and dark text on the brighter rust in dark mode.
  // Cream on rust is 3.2:1, so the label is bold and at least 18.66px (WCAG
  // large text, where 3:1 passes AA) at every size.
  primary: "bg-rust font-bold text-background hover:bg-rust-dark",
  secondary:
    "border border-bamboo-green bg-transparent font-medium text-deep-grass hover:bg-bamboo-green/10",
};

// Heights are fixed, so the larger primary label doesn't change them; the
// primary's side padding is a little tighter to offset the wider text.
const sizeClasses: Record<ButtonSize, Record<ButtonVariant, string>> = {
  default: {
    primary: "h-11 px-5 text-[19px] leading-6",
    secondary: "h-11 px-6 text-body",
  },
  sm: {
    primary: "h-9 px-3.5 text-[19px] leading-6",
    secondary: "h-9 px-4 text-body-sm",
  },
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
  const classes = `${base} ${variantClasses[variant]} ${sizeClasses[size][variant]} ${className}`;

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
