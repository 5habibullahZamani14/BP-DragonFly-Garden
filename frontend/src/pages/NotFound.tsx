/*
 * NotFound.tsx — 404 fallback page.
 *
 * This page renders whenever React Router's <Routes> receives a URL that does
 * not match any defined route. In normal usage this should never appear because
 * the application is a single-page app with only one meaningful URL ("/").
 * It exists as a safety net for direct URL manipulation or misconfigured links.
 *
 * The useEffect logs the attempted path to the browser console so it is easy
 * to diagnose broken links during development without leaving noisy log calls
 * in the rest of the application code.
 */

import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  /* Log the bad path so developers can identify broken links quickly. */
  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
