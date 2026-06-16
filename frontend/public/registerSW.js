if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .then(() => {
        if (window.location.search.includes("clear-sw=1")) return;
        const url = new URL(window.location.href);
        url.searchParams.set("clear-sw", "1");
        window.location.replace(url.toString());
      })
      .catch(() => {});
  });
}
