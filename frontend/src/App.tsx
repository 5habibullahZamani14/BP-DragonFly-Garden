/*
 * App.tsx — Root React component and application shell.
 *
 * App sets up the global provider stack that every other component in the
 * application depends on. The providers are layered from outermost to
 * innermost:
 *
 *   QueryClientProvider  — TanStack Query's data-fetching and caching layer.
 *                          Any component can call useQuery/useMutation anywhere
 *                          in the tree because of this provider.
 *
 *   AccessibilityProvider — Manages font theme and UI scale preferences stored
 *                           in localStorage. Injects CSS custom properties onto
 *                           the root element so the entire UI reacts to changes.
 *
 *   TooltipProvider      — Shadcn UI tooltip context. Required for any component
 *                          that uses the <Tooltip> component.
 *
 *   Toaster / Sonner     — Two toast notification systems. Toaster is the Shadcn
 *                          variant (used internally by some UI components),
 *                          Sonner is the animated one used for user-visible
 *                          order confirmations and error messages.
 *
 *   BrowserRouter        — React Router's history API wrapper. All <Route>
 *                          definitions live inside this.
 *
 * The application has only two routes: "/" which renders the Index page
 * (which internally decides which view to show based on the QR code), and
 * "*" which renders the 404 page for any unknown URL.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AccessibilityProvider } from "@/lib/useAccessibility";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AccessibilityProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AccessibilityProvider>
  </QueryClientProvider>
);

export default App;