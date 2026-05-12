/*
 * NavLink.tsx — Active-state-aware navigation link wrapper.
 *
 * React Router's NavLink component accepts a className function that receives
 * `isActive` and `isPending` booleans, but many places in the codebase want
 * to pass a plain string className and separate activeClassName / pendingClassName
 * strings — the simpler API that older versions of React Router used.
 *
 * This component bridges the two APIs: it accepts plain string class names and
 * merges the active/pending ones using the `cn` helper (clsx + tailwind-merge)
 * so class conflicts are resolved correctly.
 *
 * forwardRef is used so components that need to attach a ref to the underlying
 * <a> element (e.g. for focus management) can do so transparently.
 */

import { NavLink as RouterNavLink, NavLinkProps } from "react-router-dom";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface NavLinkCompatProps extends Omit<NavLinkProps, "className"> {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName, to, ...props }, ref) => {
    return (
      <RouterNavLink
        ref={ref}
        to={to}
        className={({ isActive, isPending }) =>
          cn(className, isActive && activeClassName, isPending && pendingClassName)
        }
        {...props}
      />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
