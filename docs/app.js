"use strict";
(() => {
  const catalogs = window.SL_I18N;
  const selector = document.querySelector("#language");
  const queryLanguage = new URLSearchParams(location.search).get("lang");
  const normalize = value => {
    const name = String(value || "").toLowerCase();
    if (name.startsWith("ja")) return "ja";
    if (name.startsWith("zh")) return /hant|tw|hk|mo/.test(name) ? "zh-Hant" : "zh-Hans";
    return "en";
  };
  let storedLanguage = null;
  try { storedLanguage = localStorage.getItem("shittim-site-language"); } catch {}
  let language = catalogs[queryLanguage] ? queryLanguage : catalogs[storedLanguage] ? storedLanguage : normalize(navigator.language);
  let release = null;
  let checkId = 0;
  let checkState = null;
  let selectedName = "";
  let copyState = null;
  let loadState = "loading";
  const t = key => catalogs[language][key] ?? catalogs.en[key] ?? key;
  const result = document.querySelector("#verify-result");
  const input = document.querySelector("#verify-file");
  const drop = document.querySelector("#file-drop");
  const download = document.querySelector("#download-button");
  const expectedHash = document.querySelector("#expected-hash");

  function showState() {
    result.textContent = checkState ? `${selectedName ? selectedName + " — " : ""}${t(checkState)}` : "";
    result.dataset.state = checkState || "";
    result.setAttribute("aria-busy", String(checkState === "checking"));
    document.querySelector("#copy-status").textContent = copyState ? t(copyState) : "";
    document.querySelector("#publication-state").textContent = t(release?.published ? "published" : loadState === "loadFailed" ? "loadFailed" : "pending");
    expectedHash.textContent = release ? release.sha256 : t(loadState);
  }
  function translate() {
    document.documentElement.lang = language;
    selector.value = language;
    document.querySelectorAll("[data-i18n]").forEach(element => {
      element.textContent = t(element.dataset.i18n);
    });
    showState();
  }
  selector.addEventListener("change", () => {
    language = selector.value;
    try { localStorage.setItem("shittim-site-language", language); } catch {}
    translate();
  });

  document.querySelector("#copy-hash").addEventListener("click", async () => {
    if (!release) return;
    try {
      await navigator.clipboard.writeText(release.sha256);
      copyState = "copied";
    } catch {
      copyState = "copyFailed";
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(expectedHash);
      selection.removeAllRanges();
      selection.addRange(range);
      expectedHash.focus();
    }
    showState();
  });

  async function check(file) {
    if (!file) return;
    const ownId = ++checkId;
    document.querySelector("#digest-details").hidden = true;
    document.querySelector("#actual-hash").textContent = "";
    selectedName = file?.name || "";
    if (!release) { checkState = "loadFailed"; showState(); return; }
    if (!globalThis.crypto?.subtle) { checkState = "unsupported"; showState(); return; }
    if (file.size > 256 * 1024 * 1024) { checkState = "tooLarge"; showState(); return; }
    checkState = "checking";
    showState();
    try {
      const buffer = await file.arrayBuffer();
      if (ownId !== checkId) return;
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      if (ownId !== checkId) return;
      const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
      checkState = hex === release.sha256 && file.size === release.bytes ? "match" : "mismatch";
      document.querySelector("#actual-hash").textContent = hex;
      document.querySelector("#digest-details").hidden = false;
    } catch {
      if (ownId !== checkId) return;
      checkState = "error";
    }
    showState();
  }
  input.addEventListener("change", () => check(input.files[0]));
  ["dragenter", "dragover"].forEach(event => drop.addEventListener(event, e => { e.preventDefault(); drop.classList.add("drag-over"); }));
  ["dragleave", "drop"].forEach(event => drop.addEventListener(event, e => { e.preventDefault(); drop.classList.remove("drag-over"); }));
  drop.addEventListener("drop", e => {
    if (e.dataTransfer.files.length !== 1) {
      ++checkId; selectedName = ""; checkState = "chooseOne";
      document.querySelector("#digest-details").hidden = true;
      document.querySelector("#actual-hash").textContent = "";
      showState(); return;
    }
    check(e.dataTransfer.files[0]);
  });
  download.setAttribute("aria-disabled", "true");
  download.addEventListener("click", e => {
    if (!release?.published) e.preventDefault();
  });

  translate();
  fetch("release.json", { cache: "no-store" }).then(response => {
    if (!response.ok) throw new Error("Release metadata unavailable");
    return response.json();
  }).then(value => {
    if (!/^[a-f0-9]{64}$/.test(value.sha256) || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || typeof value.published !== "boolean") throw new Error("Invalid release metadata");
    if (!/^\d+\.\d+\.\d+$/.test(value.version)) throw new Error("Invalid version");
    const url = new URL(value.downloadUrl);
    if (url.origin !== "https://github.com" || url.pathname !== `/usatsuki/ShittimLogon-X/releases/download/v${value.version}/ShittimLogon-X-${value.version}.exe` || url.search || url.hash) throw new Error("Unexpected download address");
    release = value;
    document.querySelectorAll('[data-release="version"]').forEach(e => e.textContent = value.version);
    document.querySelectorAll('[data-release="date"]').forEach(e => e.textContent = value.date);
    document.querySelectorAll('[data-release="size"]').forEach(e => e.textContent = `${(value.bytes / 1048576).toFixed(1)} MiB`);
    expectedHash.textContent = value.sha256;
    if (value.published) {
      download.href = url.href;
      download.removeAttribute("aria-disabled");
      download.removeAttribute("tabindex");
    }
    showState();
  }).catch(() => {
    loadState = "loadFailed";
    showState();
  });
})();
