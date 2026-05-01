import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "emerald" | "gold" | "ghost" | "berry";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
}

const base =
  "group relative inline-flex items-center justify-center gap-2 rounded-full font-bold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed";

const sizes = {
  sm: "px-4 py-2 text-[0.82rem]",
  md: "px-5 py-3 text-[0.9rem]",
  lg: "px-7 py-5 text-[1rem]",
};

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
