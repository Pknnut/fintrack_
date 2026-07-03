// FinTrack — Bootstrap kickoff. MUST be the last <script> tag loaded — everything else must be defined before this runs.
nkpMarkInputs();
tkbMarkInputs();
// Wrap startup() in .catch() so any unhandled throw (e.g. checkRecurringSuggestions on the 1st of the month)
// never leaves the loading screen frozen. The catch forces the app past "Ready" regardless.
startup().catch(e => {
  console.error("Startup error:", e);
  try { document.getElementById("loading-screen").classList.add("hidden"); } catch(_) {}
  try {
    if (settings.pinEnabled) {
      document.getElementById("pin-screen").classList.remove("hidden");
      document.getElementById("pin-sub").textContent = "Enter your PIN";
    } else { unlockApp(); }
  } catch(_) {}
});