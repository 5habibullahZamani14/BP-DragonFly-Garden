if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      console.debug("Service worker registered", registration.scope);
    } catch (error) {
      console.warn("Service worker registration failed", error);
    }
  });
}
