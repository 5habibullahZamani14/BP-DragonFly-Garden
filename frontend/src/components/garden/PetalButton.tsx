/*
 * PetalButton.tsx — Design-system button component.
 *
 * This is the primary interactive element used throughout the app. I created
 * it as a thin wrapper around the native <button> element so every button in
 * the UI uses the same shape (rounded-full pill) and animation timing, while
 * allowing four distinct colour schemes via the variant prop.
 *
 * Variants:
 *   emerald  — Primary green. Used for "Place Order", "Confirm", and other
 *              positive actions.
 *   gold     — Warm amber. Used for promotional highlights and "Reorder" buttons.
 *   berry    — Deep pink/red. Used for destructive or warning actions.
 *   ghost    — Transparent with a subtle border. Used for secondary actions
 *              like "Cancel" or "View Details".
 *
 * The actual colour and hover/active animations are defined in index.css under
 * .btn-emerald, .btn-gold, etc. Keeping the CSS in the stylesheet (not inline)
 * means the design can be updated without touching component code.
 *
 * forwardRef is used so parent components can attach a ref to the underlying
 * button element when needed (e.g. for programmatic focus management).
 */

import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "emerald" | "gold" | "ghost" | "berry";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
}

/* Base classes applied to every button regardless of variant or size. */
const base =
  "group relative inline-flex items-center justify-center gap-2 rounded-full font-bold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed";

const sizes = {
  sm: "px-4 py-2 text-[0.82rem]",
  md: "px-5 py-3 text-[0.9rem]",
  lg: "px-7 py-5 text-[1rem]",
};

/* Maps variant names to the CSS class names defined in index.css. */
const variants: Record<Variant, string> = {
  emerald: "btn-emerald",
  gold: "btn-gold",
  berry: "btn-berry",
  ghost: "btn-ghost",
};

export const PetalButton = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "emerald", size = "md", className, children, ...rest }, ref) => (
    <button ref={ref} className={cn(base, sizes[size], variants[variant], className)} {...rest}>
      {children}
    </button>
  )
);
PetalButton.displayName = "PetalButton";
