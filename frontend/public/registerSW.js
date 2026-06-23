if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .then(() => {
        // Do not force a page reload after unregistering service workers.
        // Reloads cause instability on flaky Raspberry Pi hotspot networks.
        console.debug("Service workers unregistered (no reload)");
      })
      .catch(() => {});
  });
}
