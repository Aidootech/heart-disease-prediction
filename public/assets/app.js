/* CardioCare - clinical workspace (vanilla JavaScript, no build step). */
(function () {
  "use strict";

  /* ======================================================================
     Constants
     ====================================================================== */
  const ROUTES = {
    dashboard: "Dashboard",
    predict: "Predict",
    models: "Models",
    dataset: "Dataset",
    history: "History",
    profile: "Profile",
  };

  const ALIASES = {
    prediction: "predict",
    training: "models",
    evaluation: "models",
    about: "profile",
  };

  const METRIC_ORDER = ["accuracy", "precision", "recall", "f1", "roc_auc"];

  const MODEL_COLORS = {
    logistic_regression: "#1d4ed8",
    decision_tree: "#64748b",
    random_forest: "#0ea5e9",
    svm: "#0f172a",
  };

  const DEMO = {
    name: "Daniel Sullivan",
    email: "demo@cardiocare.app",
    password: "demo1234",
    createdAt: "2026-01-12T09:00:00.000Z",
    role: "Cardiology registrar",
    hospital: "St. Mary's Teaching Hospital",
  };

  const STORE = {
    accounts: "cc_accounts_v2",
    session: "cc_session_v2",
    sessionTemp: "cc_session_temp_v2",
    history: "cc_history_v2:",
  };

  const HISTORY_LIMIT = 60;

  const SLIDES = [
    {
      src: "assets/images/slide_showimage1.jpg",
      tag: "Prevention",
      title: "Small habits, stronger hearts",
      sub: "Regular activity and balanced living remain the most dependable forms of cardiovascular protection.",
      alt: "Illustration of a heart riding a bicycle",
    },
    {
      src: "assets/images/slide_showimage2.jpg",
      tag: "Screening",
      title: "Measure early, act sooner",
      sub: "Blood pressure, cholesterol and glucose are simple measurements that reveal risk long before symptoms appear.",
      alt: "Illustration of a clinician checking a patient's heart",
    },
    {
      src: "assets/images/slide_showimage3.jpg",
      tag: "Decision support",
      title: "Evidence at the point of care",
      sub: "Four verified classifiers score the same patient profile, with a transparent decision rule and clear explanations.",
      alt: "Illustration of clinical data and a heart",
    },
  ];

  /* ======================================================================
     Application state
     ====================================================================== */
  const APP = {
    data: { models: null, dataset: null, training: null },
    user: null,
    route: "dashboard",
    ui: {
      authMode: "signin",
      selectedModel: null,
      result: null,
      resultRecordId: null,
      lastPatient: null,
      predicting: false,
      slide: 0,
      slideTimer: null,
      historyQuery: "",
      historyFilter: "all",
      datasetTab: "overview",
      ready: false,
    },
  };

  /* ======================================================================
     Small utilities
     ====================================================================== */
  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function esc(value) {
    return String(value === null || value === undefined ? "" : value).replace(
      /[&<>"']/g,
      function (char) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[char];
      }
    );
  }

  function pct(value, digits) {
    if (!Number.isFinite(Number(value))) return "&mdash;";
    return (Number(value) * 100).toFixed(digits === undefined ? 1 : digits) + "%";
  }

  function pctRaw(value, digits) {
    if (!Number.isFinite(Number(value))) return "&mdash;";
    return Number(value).toFixed(digits === undefined ? 1 : digits) + "%";
  }

  function num(value, digits) {
    if (!Number.isFinite(Number(value))) return "&mdash;";
    return Number(value).toFixed(digits === undefined ? 1 : digits);
  }

  function score(value) {
    return Number(value).toFixed(3);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function initials(name) {
    return String(name || "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function (part) {
        return part.charAt(0).toUpperCase();
      })
      .join("");
  }

  function firstName(name) {
    return String(name || "").trim().split(/\s+/)[0] || "there";
  }

  function longDate(iso) {
    const date = iso ? new Date(iso) : new Date();
    if (Number.isNaN(date.getTime())) return "&mdash;";
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function shortDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "&mdash;";
    return date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  }

  function dateTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "&mdash;";
    return (
      date.toLocaleDateString(undefined, { day: "2-digit", month: "short" }) +
      " &middot; " +
      date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    );
  }

  function timeAgo(iso) {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "&mdash;";
    const diff = Math.max(0, Date.now() - then);
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return minutes + " min ago";
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
    const days = Math.floor(hours / 24);
    if (days < 7) return days + (days === 1 ? " day ago" : " days ago");
    return shortDate(iso);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }

  function modelColor(key) {
    if (APP.data.models && APP.data.models.models[key]) {
      return MODEL_COLORS[key] || APP.data.models.models[key].color || "#2563eb";
    }
    return MODEL_COLORS[key] || "#2563eb";
  }

  function modelName(key) {
    const models = APP.data.models && APP.data.models.models;
    return (models && models[key] && models[key].name) || key;
  }

  function modelAcronym(key) {
    const models = APP.data.models && APP.data.models.models;
    return (models && models[key] && models[key].acronym) || key.slice(0, 2).toUpperCase();
  }

  function modelByKey(key) {
    return (APP.data.models && APP.data.models.models[key]) || null;
  }

  function selectedModelKey() {
    return APP.ui.selectedModel || (APP.data.models && APP.data.models.best_model.key) || "logistic_regression";
  }

  /* ======================================================================
     Storage
     ====================================================================== */
  function readStore(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function removeStore(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      /* ignore */
    }
  }

  function historyKey(email) {
    return STORE.history + String(email || "").toLowerCase();
  }

  function getHistory() {
    if (!APP.user) return [];
    const list = readStore(historyKey(APP.user.email), []);
    return Array.isArray(list) ? list : [];
  }

  function saveHistory(list) {
    if (!APP.user) return;
    writeStore(historyKey(APP.user.email), list.slice(0, HISTORY_LIMIT));
    refreshChromeCounts();
  }

  function addHistory(record) {
    const list = getHistory();
    list.unshift(record);
    saveHistory(list);
  }

  function removeHistory(id) {
    saveHistory(getHistory().filter(function (item) {
      return item.id !== id;
    }));
  }

  function clearHistory() {
    if (!APP.user) return;
    removeStore(historyKey(APP.user.email));
    refreshChromeCounts();
  }

  /* ======================================================================
     Password hashing (demo only)
     ====================================================================== */
  function fallbackHash(text) {
    let hash = 5381;
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
    }
    return "fb" + (hash >>> 0).toString(16);
  }

  async function hashPassword(password) {
    const text = "cardiocare:v1:" + password;
    try {
      if (window.crypto && window.crypto.subtle && window.TextEncoder) {
        const buffer = await window.crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(text)
        );
        return Array.prototype.map
          .call(new Uint8Array(buffer), function (byte) {
            return byte.toString(16).padStart(2, "0");
          })
          .join("");
      }
    } catch (error) {
      /* fall through */
    }
    return fallbackHash(text);
  }

  /* ======================================================================
     Icons
     ====================================================================== */
  const ICONS = {
    calendar:
      '<rect x="3.5" y="5" width="17" height="15.5" rx="3" stroke="currentColor" stroke-width="1.7"/><path d="M8 3.2v4M16 3.2v4M3.5 10h17" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    plus: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
    arrowRight:
      '<path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    download:
      '<path d="M12 4v10m0 0 3.8-3.8M12 14l-3.8-3.8M4.5 17.5v1.2a1.3 1.3 0 0 0 1.3 1.3h12.4a1.3 1.3 0 0 0 1.3-1.3v-1.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    trash:
      '<path d="M4.5 7h15M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7M6.5 7l.8 12.1A1.4 1.4 0 0 0 8.7 20.5h6.6a1.4 1.4 0 0 0 1.4-1.4L17.5 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    clock:
      '<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7"/><path d="M12 7.5V12l3.2 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    heart:
      '<path d="M12 20.2s-7.1-4.4-7.1-9.3A4.1 4.1 0 0 1 12 8.2a4.1 4.1 0 0 1 7.1 2.7c0 4.9-7.1 9.3-7.1 9.3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    pulse:
      '<path d="M3 12h4l1.6-3.4 2.6 7L14 12h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    users:
      '<circle cx="9" cy="8.5" r="3.5" stroke="currentColor" stroke-width="1.7"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0M16 5.4a3.4 3.4 0 0 1 0 6.4M17.4 14.6a5.8 5.8 0 0 1 3.8 5.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    layers:
      '<path d="m12 3.5 8 4.2-8 4.2-8-4.2 8-4.2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m4 12.2 8 4.2 8-4.2M4 16.4l8 4.2 8-4.2" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    shield:
      '<path d="M12 3.5 5 6.2v5c0 4.3 2.8 7.6 7 9.3 4.2-1.7 7-5 7-9.3v-5L12 3.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m9 11.8 2.1 2.2L15.4 9.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    alert:
      '<path d="M12 8.2v5.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="17" r="1" fill="currentColor"/><path d="M10.3 4.3 2.9 17.1a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    check:
      '<path d="m5 12.5 4.2 4.2L19 6.9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    chevronLeft:
      '<path d="M14.5 5.5 8 12l6.5 6.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    chevronRight:
      '<path d="M9.5 5.5 16 12l-6.5 6.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    stethoscope:
      '<path d="M5 4v5.2a4.2 4.2 0 0 0 8.4 0V4M9.2 13.4v1.4a5 5 0 0 0 10 0v-1.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="19.2" cy="11" r="2.1" stroke="currentColor" stroke-width="1.7"/>',
    file:
      '<path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-5.5-5.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M13.5 3.5V9H19" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    search:
      '<circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.7"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    logout:
      '<path d="M14 5.5H6.8A1.8 1.8 0 0 0 5 7.3v9.4a1.8 1.8 0 0 0 1.8 1.8H14M10.5 12h9M16 8.5l3.5 3.5-3.5 3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    mail:
      '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5" stroke="currentColor" stroke-width="1.7"/><path d="m4.5 7 7.5 5.4L19.5 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    gauge:
      '<path d="M4 17a9 9 0 1 1 16 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m12 13 4-3.4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="14" r="1.4" fill="currentColor"/>',
    spark:
      '<path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6.3 6.3l2.6 2.6M15.1 15.1l2.6 2.6M17.7 6.3l-2.6 2.6M8.9 15.1l-2.6 2.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    table:
      '<rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 9.5h17M9.5 9.5v10M3.5 15h17" stroke="currentColor" stroke-width="1.6"/>',
    refresh:
      '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4.5V11h-6.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  };

  function icon(name, cls) {
    return (
      '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      (ICONS[name] || "") +
      "</svg>"
    );
  }

  /* ======================================================================
     Accounts and session (local demo authentication)
     ====================================================================== */
  function getAccounts() {
    const list = readStore(STORE.accounts, []);
    return Array.isArray(list) ? list : [];
  }

  function saveAccounts(list) {
    return writeStore(STORE.accounts, list);
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function findAccount(email) {
    const target = normalizeEmail(email);
    return getAccounts().find(function (account) {
      return normalizeEmail(account.email) === target;
    }) || null;
  }

  async function ensureDemoAccount() {
    if (findAccount(DEMO.email)) return;
    const list = getAccounts();
    list.push({
      name: DEMO.name,
      email: DEMO.email,
      hash: await hashPassword(DEMO.password),
      createdAt: DEMO.createdAt,
      role: DEMO.role,
      hospital: DEMO.hospital,
      demo: true,
    });
    saveAccounts(list);
  }

  function updateAccount(email, patch) {
    const list = getAccounts();
    let updated = null;
    const next = list.map(function (account) {
      if (normalizeEmail(account.email) !== normalizeEmail(email)) return account;
      updated = Object.assign({}, account, patch);
      return updated;
    });
    saveAccounts(next);
    if (updated) APP.user = updated;
    return updated;
  }

  function readSession() {
    const raw =
      window.localStorage.getItem(STORE.session) ||
      window.sessionStorage.getItem(STORE.sessionTemp);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && parsed.email ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function writeSession(email, remember) {
    const payload = JSON.stringify({ email: email, at: new Date().toISOString() });
    try {
      if (remember) {
        window.localStorage.setItem(STORE.session, payload);
        window.sessionStorage.removeItem(STORE.sessionTemp);
      } else {
        window.sessionStorage.setItem(STORE.sessionTemp, payload);
        window.localStorage.removeItem(STORE.session);
      }
    } catch (error) {
      /* ignore */
    }
  }

  function clearSession() {
    try {
      window.localStorage.removeItem(STORE.session);
      window.sessionStorage.removeItem(STORE.sessionTemp);
    } catch (error) {
      /* ignore */
    }
  }

  /* ======================================================================
     Authentication screen
     ====================================================================== */
  function authMessage(message) {
    const box = $("#authError");
    if (!box) return;
    box.hidden = !message;
    box.textContent = message || "";
  }

  function setFieldError(inputId, message) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const field = input.closest(".field");
    if (!field) return;
    field.classList.toggle("invalid", Boolean(message));
    const box = field.querySelector(".field-error");
    if (box) box.textContent = message || "";
  }

  function clearAuthFieldErrors() {
    $$("#authForm .field").forEach(function (field) {
      field.classList.remove("invalid");
      const box = field.querySelector(".field-error");
      if (box) box.textContent = "";
    });
  }

  function setAuthMode(mode) {
    const signup = mode === "signup";
    APP.ui.authMode = signup ? "signup" : "signin";
    $("#nameField").hidden = !signup;
    $("#authTitle").textContent = signup ? "Create your account" : "Welcome back";
    $("#authSubtitle").textContent = signup
      ? "Set up a private clinical workspace in seconds."
      : "Sign in to your clinical workspace.";
    $("#authSubmit").textContent = signup ? "Create account" : "Sign in";
    $("#authSwitchText").textContent = signup
      ? "Already have an account?"
      : "New to CardioCare?";
    $("#authSwitch").textContent = signup ? "Sign in instead" : "Create an account";
    $("#authPassword").setAttribute(
      "autocomplete",
      signup ? "new-password" : "current-password"
    );
    $("#authPassword").value = "";
    $("#forgotButton").hidden = signup;
    $("#rememberMe").checked = true;
    clearAuthFieldErrors();
    authMessage("");
  }

  function showAuth(mode) {
    $("#authScreen").hidden = false;
    $("#appShell").hidden = true;
    document.title = "Sign in \u00b7 CardioCare";
    setAuthMode(mode || "signin");
    window.setTimeout(function () {
      const email = $("#authEmail");
      if (email) email.focus();
    }, 60);
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }

  function setAuthBusy(busy, label) {
    const button = $("#authSubmit");
    if (!button) return;
    button.disabled = busy;
    if (busy) {
      button.dataset.label = button.textContent;
      button.textContent = label || "Please wait\u2026";
    } else if (button.dataset.label) {
      button.textContent = button.dataset.label;
      delete button.dataset.label;
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    if (!APP.ui.ready) return;

    const signup = APP.ui.authMode === "signup";
    const name = ($("#authName").value || "").trim();
    const email = normalizeEmail($("#authEmail").value);
    const password = $("#authPassword").value || "";
    const remember = $("#rememberMe").checked;

    clearAuthFieldErrors();
    authMessage("");

    let valid = true;
    if (signup && name.length < 2) {
      setFieldError("authName", "Enter your full name.");
      valid = false;
    }
    if (!validEmail(email)) {
      setFieldError("authEmail", "Enter a valid email address.");
      valid = false;
    }
    if (password.length < 6) {
      setFieldError("authPassword", "Use at least 6 characters.");
      valid = false;
    }
    if (!valid) return;

    setAuthBusy(true, signup ? "Creating account\u2026" : "Signing in\u2026");
    try {
      if (signup) {
        if (findAccount(email)) {
          setFieldError("authEmail", "An account already exists for this email.");
          authMessage("Try signing in instead, or use a different email address.");
          return;
        }
        const hash = await hashPassword(password);
        const account = {
          name: name,
          email: email,
          hash: hash,
          createdAt: new Date().toISOString(),
          role: "Clinician",
          hospital: "",
        };
        const list = getAccounts();
        list.push(account);
        saveAccounts(list);
        finishLogin(account, remember);
        toast("Account created. Welcome, " + firstName(account.name) + ".");
      } else {
        const account = findAccount(email);
        if (!account) {
          setFieldError("authEmail", "No account found for this email.");
          authMessage("Create an account, or continue with the demo workspace.");
          return;
        }
        const hash = await hashPassword(password);
        if (hash !== account.hash) {
          setFieldError("authPassword", "That password does not match this account.");
          return;
        }
        finishLogin(account, remember);
        toast("Signed in as " + account.name + ".");
      }
    } finally {
      setAuthBusy(false);
    }
  }

  function finishLogin(account, remember) {
    APP.user = account;
    writeSession(account.email, remember);
    authMessage("");
    $("#authPassword").value = "";
    enterApp();
  }

  function enterApp() {
    $("#authScreen").hidden = true;
    $("#appShell").hidden = false;
    renderChrome();
    const hasRoute = /^#\//.test(window.location.hash);
    if (!hasRoute) {
      window.location.hash = "#/dashboard";
    } else {
      onRouteChange();
    }
  }

  function signOut() {
    stopSlideshow();
    clearSession();
    APP.user = null;
    APP.ui.result = null;
    APP.ui.lastPatient = null;
    APP.ui.historyQuery = "";
    closeDrawer();
    closeNotifications();
    showAuth("signin");
    toast("Signed out.");
  }

  async function demoLogin() {
    const button = $("#demoLogin");
    if (button) button.disabled = true;
    try {
      await ensureDemoAccount();
      const account = findAccount(DEMO.email);
      if (!account) {
        authMessage("The demo account could not be created in this browser.");
        return;
      }
      finishLogin(account, true);
      toast("Demo workspace loaded.");
    } finally {
      if (button) button.disabled = false;
    }
  }

  function togglePassword() {
    const input = $("#authPassword");
    const toggle = $("#passwordToggle");
    if (!input || !toggle) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.textContent = show ? "Hide" : "Show";
    toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
  }

  /* ======================================================================
     Routing and shell
     ====================================================================== */
  function parseRoute() {
    let raw = String(window.location.hash || "").replace(/^#\/?/, "").split("?")[0].trim();
    if (!raw) raw = "dashboard";
    if (ALIASES[raw]) raw = ALIASES[raw];
    return ROUTES[raw] ? raw : "dashboard";
  }

  function navigate(route) {
    const target = "#/" + (ROUTES[route] ? route : "dashboard");
    if (window.location.hash === target) {
      onRouteChange();
    } else {
      window.location.hash = target;
    }
  }

  function onRouteChange() {
    if (!APP.user) {
      if (APP.ui.ready) showAuth("signin");
      return;
    }
    renderRoute();
  }

  function renderRoute() {
    const route = parseRoute();
    APP.route = route;
    stopSlideshow();
    closeDrawer();
    closeNotifications();

    $$("[data-route]").forEach(function (item) {
      const active = item.getAttribute("data-route") === route;
      item.classList.toggle("active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });

    const title = ROUTES[route];
    const topTitle = $("#topbarTitle");
    if (topTitle) topTitle.textContent = title;
    document.title = title + " \u00b7 CardioCare";

    let html = "";
    try {
      if (route === "dashboard") html = renderDashboard();
      else if (route === "predict") html = renderPredict();
      else if (route === "models") html = renderModels();
      else if (route === "dataset") html = renderDataset();
      else if (route === "history") html = renderHistory();
      else html = renderProfile();
    } catch (error) {
      html =
        '<div class="page"><div class="card">' +
        '<div class="card-title">This page could not be rendered</div>' +
        '<p class="card-sub mt-1">' + esc(error.message) + "</p>" +
        '<button class="btn primary mt-2" data-action="reload">Reload workspace</button>' +
        "</div></div>";
    }

    const view = $("#view");
    if (view) view.innerHTML = html;
    window.scrollTo({ top: 0, behavior: "auto" });

    if (route === "dashboard") startSlideshow();
    refreshChromeCounts();
    playAnimations();
  }

  function renderChrome() {
    if (!APP.user) return;
    const sidebarUser = $("#sidebarUser");
    if (sidebarUser) {
      sidebarUser.innerHTML =
        '<div class="side-user-top">' +
        '<span class="avatar">' + esc(initials(APP.user.name)) + "</span>" +
        '<div class="side-user-meta">' +
        '<div class="side-user-name">' + esc(APP.user.name) + "</div>" +
        '<div class="side-user-email">' + esc(APP.user.email) + "</div>" +
        "</div></div>" +
        '<button type="button" class="side-signout" data-action="signout">' +
        icon("logout") + " Sign out</button>";
    }

    const topUser = $("#topUser");
    if (topUser) {
      topUser.innerHTML =
        '<span class="avatar">' + esc(initials(APP.user.name)) + "</span>" +
        '<span class="user-chip-name">' + esc(APP.user.name) + "</span>";
    }
    refreshChromeCounts();
  }

  function refreshChromeCounts() {
    const count = getHistory().length;
    const badge = $("#historyCount");
    if (badge) {
      badge.hidden = count === 0;
      badge.textContent = String(count);
    }
    const dot = $("#notificationDot");
    if (dot) dot.hidden = count === 0;
    renderNotifications();
  }

  /* ======================================================================
     Drawer
     ====================================================================== */
  function openDrawer() {
    const sidebar = $("#sidebar");
    const scrim = $("#sidebarScrim");
    if (sidebar) sidebar.classList.add("open");
    if (scrim) scrim.hidden = false;
    const button = $("#menuButton");
    if (button) button.setAttribute("aria-expanded", "true");
  }

  function closeDrawer() {
    const sidebar = $("#sidebar");
    const scrim = $("#sidebarScrim");
    if (sidebar) sidebar.classList.remove("open");
    if (scrim) scrim.hidden = true;
    const button = $("#menuButton");
    if (button) button.setAttribute("aria-expanded", "false");
  }

  /* ======================================================================
     Notifications
     ====================================================================== */
  function renderNotifications() {
    const list = $("#notificationList");
    if (!list) return;
    const items = getHistory().slice(0, 5);
    if (!items.length) {
      list.innerHTML =
        '<div class="notification-item"><span class="dot"></span>' +
        "<span>No activity yet. <b>Run a prediction</b> to begin your history.</span></div>";
      return;
    }
    list.innerHTML =
      items
        .map(function (item) {
          const risky = Number(item.prediction) === 1;
          return (
            '<div class="notification-item"><span class="dot"></span><span>' +
            "<b>" + esc(item.label || (risky ? "Heart disease detected" : "No heart disease detected")) + "</b> " +
            '<span class="muted">&middot; ' + pct(item.probability) + " &middot; " + esc(item.modelName || "") + "</span>" +
            '<span class="tiny muted" style="display:block;margin-top:2px">' + timeAgo(item.at) + "</span>" +
            "</span></div>"
          );
        })
        .join("") +
      '<div style="padding-top:10px"><button type="button" class="link-button" data-action="open-history">Open full history</button></div>';
  }

  function toggleNotifications() {
    const panel = $("#notificationPanel");
    const button = $("#notificationButton");
    if (!panel) return;
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    if (button) button.setAttribute("aria-expanded", willOpen ? "true" : "false");
    if (willOpen) renderNotifications();
  }

  function closeNotifications() {
    const panel = $("#notificationPanel");
    const button = $("#notificationButton");
    if (panel) panel.hidden = true;
    if (button) button.setAttribute("aria-expanded", "false");
  }

  /* ======================================================================
     Toast
     ====================================================================== */
  let toastTimer = null;

  function toast(message, tone) {
    const element = $("#toast");
    if (!element) return;
    element.hidden = false;
    element.textContent = message;
    element.style.background =
      tone === "error" ? "#b91c1c" : tone === "success" ? "#15803d" : "";
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      element.hidden = true;
    }, 3200);
  }

  /* ======================================================================
     Slideshow
     ====================================================================== */
  function paintSlides() {
    $$("#slideshow .slide").forEach(function (slide, index) {
      const active = index === APP.ui.slide;
      slide.classList.toggle("active", active);
      slide.setAttribute("aria-hidden", active ? "false" : "true");
    });
    $$("#slideshow .slide-dot").forEach(function (dot, index) {
      const active = index === APP.ui.slide;
      dot.classList.toggle("active", active);
      dot.setAttribute("aria-selected", active ? "true" : "false");
    });
    const status = $("#slideStatus");
    if (status) status.textContent = APP.ui.slide + 1 + " / " + SLIDES.length;
  }

  function goSlide(index) {
    const slides = $$("#slideshow .slide");
    if (!slides.length) return;
    const count = slides.length;
    APP.ui.slide = ((index % count) + count) % count;
    paintSlides();
  }

  function pauseSlideshow() {
    if (APP.ui.slideTimer) {
      window.clearInterval(APP.ui.slideTimer);
      APP.ui.slideTimer = null;
    }
  }

  function resumeSlideshow() {
    if (APP.ui.slideTimer) return;
    const box = $("#slideshow");
    if (!box) return;
    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    APP.ui.slideTimer = window.setInterval(function () {
      goSlide(APP.ui.slide + 1);
    }, 6500);
  }

  function stopSlideshow() {
    pauseSlideshow();
  }

  function startSlideshow() {
    stopSlideshow();
    const box = $("#slideshow");
    if (!box) return;
    APP.ui.slide = 0;
    paintSlides();
    box.addEventListener("mouseenter", pauseSlideshow);
    box.addEventListener("mouseleave", resumeSlideshow);
    box.addEventListener("focusin", pauseSlideshow);
    box.addEventListener("focusout", resumeSlideshow);
    box.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") {
        goSlide(APP.ui.slide - 1);
      } else if (event.key === "ArrowRight") {
        goSlide(APP.ui.slide + 1);
      }
    });
    resumeSlideshow();
  }

  /* ======================================================================
     Shared presentation helpers
     ====================================================================== */
  function metricCard(spec) {
    return (
      '<div class="metric">' +
      '<div class="metric-top"><span class="metric-label">' + esc(spec.label) + "</span>" +
      '<span class="metric-icon">' + icon(spec.icon || "pulse") + "</span></div>" +
      '<div class="metric-value' + (spec.small ? " sm" : "") + '">' + spec.value + "</div>" +
      '<div class="metric-sub">' + spec.sub + "</div>" +
      "</div>"
    );
  }

  function sectionHead(title, sub, action) {
    return (
      '<div class="section-head"><div><h2>' + esc(title) + "</h2>" +
      (sub ? "<p>" + sub + "</p>" : "") + "</div>" + (action || "") + "</div>"
    );
  }

  function outcomeBadge(record) {
    const positive = Number(record.prediction) === 1;
    return (
      '<span class="badge ' + (positive ? "red" : "green") + '">' +
      (positive ? "Disease detected" : "No disease") + "</span>"
    );
  }

  function probabilityCell(value) {
    return '<span class="strong">' + pct(value) + "</span>";
  }

  function hbars(rows) {
    return (
      '<div class="hbars">' +
      rows
        .map(function (row) {
          const width = clamp(Number(row.value) * 100, 1, 100).toFixed(1);
          return (
            '<div class="hbar-row">' +
            '<span class="hbar-label" title="' + esc(row.label) + '">' + esc(row.label) + "</span>" +
            '<span class="hbar-track"><span class="hbar-fill" data-w="' + width + '%" ' +
            'style="width:0%;--bar:' + (row.color || "#2563eb") + '"></span></span>' +
            '<span class="hbar-value">' + (row.display || score(row.value)) + "</span>" +
            "</div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function playAnimations() {
    window.requestAnimationFrame(function () {
      $$(".hbar-fill[data-w]").forEach(function (bar) {
        bar.style.width = bar.getAttribute("data-w");
      });
      $$(".meter > span[data-w]").forEach(function (bar) {
        bar.style.width = bar.getAttribute("data-w");
      });
    });
  }

  function donut(segments, centreValue, centreLabel, size) {
    const dimension = size || 164;
    const stroke = 17;
    const radius = (dimension - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const total = segments.reduce(function (sum, item) {
      return sum + Number(item.value || 0);
    }, 0);
    let offset = 0;
    const rings = segments
      .map(function (item) {
        const length = total ? (Number(item.value) / total) * circumference : 0;
        const ring =
          '<circle cx="' + dimension / 2 + '" cy="' + dimension / 2 + '" r="' + radius + '" ' +
          'fill="none" stroke="' + item.color + '" stroke-width="' + stroke + '" ' +
          'stroke-dasharray="' + length.toFixed(2) + " " + (circumference - length).toFixed(2) + '" ' +
          'stroke-dashoffset="' + (-offset).toFixed(2) + '"></circle>';
        offset += length;
        return ring;
      })
      .join("");
    return (
      '<svg width="' + dimension + '" height="' + dimension + '" viewBox="0 0 ' + dimension + " " + dimension + '" ' +
      'role="img" aria-label="' + esc(centreValue + " " + centreLabel) + '">' +
      '<circle cx="' + dimension / 2 + '" cy="' + dimension / 2 + '" r="' + radius + '" fill="none" ' +
      'stroke="#eef3fa" stroke-width="' + stroke + '"></circle>' +
      '<g transform="rotate(-90 ' + dimension / 2 + " " + dimension / 2 + ')">' + rings + "</g>" +
      '<text x="' + dimension / 2 + '" y="' + (dimension / 2 - 3) + '" text-anchor="middle" ' +
      'font-family="Plus Jakarta Sans, sans-serif" font-size="21" font-weight="800" fill="#0f172a">' +
      esc(centreValue) + "</text>" +
      '<text x="' + dimension / 2 + '" y="' + (dimension / 2 + 15) + '" text-anchor="middle" ' +
      'font-family="Inter, sans-serif" font-size="9.5" fill="#64748b">' + esc(centreLabel) + "</text>" +
      "</svg>"
    );
  }

  /* ======================================================================
     Dashboard
     ====================================================================== */
  function renderDashboard() {
    const models = APP.data.models;
    const dataset = APP.data.dataset;
    const profile = dataset.profile;
    const selectedKey = models.best_model.key;
    const selected = models.models[selectedKey];
    const history = getHistory();
    const positives = profile.target_counts.disease || 0;
    const negatives = profile.target_counts.no_disease || 0;
    const prevalence = profile.target_prevalence || 0;
    const bestCvAuc = models.signal_assessment.best_cv_roc_auc;

    const slides = SLIDES.map(function (slide, index) {
      return (
        '<div class="slide' + (index === 0 ? " active" : "") + '" data-slide="' + index + '" aria-hidden="' +
        (index === 0 ? "false" : "true") + '">' +
        '<img src="' + slide.src + '" alt="' + esc(slide.alt) + '" loading="' +
        (index === 0 ? "eager" : "lazy") + '" />' +
        '<div class="slide-caption"><div class="slide-tag">' + esc(slide.tag) + "</div>" +
        '<div class="slide-title">' + esc(slide.title) + "</div>" +
        '<div class="slide-sub">' + esc(slide.sub) + "</div></div></div>"
      );
    }).join("");

    const dots = SLIDES.map(function (slide, index) {
      return (
        '<button type="button" class="slide-dot' + (index === 0 ? " active" : "") + '" ' +
        'data-action="slide-dot" data-index="' + index + '" role="tab" aria-selected="' +
        (index === 0 ? "true" : "false") + '" aria-label="Slide ' + (index + 1) + '"></button>'
      );
    }).join("");

    const performanceRows = models.model_order.map(function (key) {
      const model = models.models[key];
      return {
        label: model.name,
        value: model.cv.f1.mean,
        display: score(model.cv.f1.mean),
        color: modelColor(key),
      };
    });

    const selectedScores =
      '<div class="score-row">' +
      '<div class="score"><div class="k">CV F1</div><div class="v">' + score(selected.cv.f1.mean) + "</div>" +
      '<div class="s">&plusmn; ' + score(selected.cv.f1.std) + "</div></div>" +
      '<div class="score"><div class="k">Test F1</div><div class="v">' + score(selected.metrics.f1) + "</div>" +
      '<div class="s">held-out</div></div>' +
      '<div class="score"><div class="k">ROC-AUC</div><div class="v">' + score(selected.metrics.roc_auc) + "</div>" +
      '<div class="s">test set</div></div></div>';

    const recent = history.length
      ? '<div class="table-wrap"><table class="table"><thead><tr>' +
        "<th>Date</th><th>Model</th><th class=\"num\">Probability</th><th>Outcome</th>" +
        "</tr></thead><tbody>" +
        history
          .slice(0, 5)
          .map(function (item) {
            return (
              "<tr><td>" + shortDate(item.at) + "</td>" +
              "<td>" + esc(item.modelName || modelName(item.model)) + "</td>" +
              '<td class="num">' + pct(item.probability) + "</td>" +
              "<td>" + outcomeBadge(item) + "</td></tr>"
            );
          })
          .join("") +
        "</tbody></table></div>"
      : '<div class="empty" style="padding:28px 12px">' +
        '<div class="empty-icon">' + icon("clock") + "</div>" +
        "<h3>No predictions yet</h3><p>Your assessments will appear here after the first run.</p>" +
        '<a class="btn primary sm mt-2" href="#/predict">' + icon("plus") + " Start an assessment</a></div>";

    const vitalRows = [
      { label: "Age", value: profile.numeric_summary[0], unit: "years", icon: "calendar", digits: 1 },
      { label: "Blood pressure", value: profile.numeric_summary[1], unit: "mmHg", icon: "pulse", digits: 1 },
      { label: "Cholesterol", value: profile.numeric_summary[2], unit: "mg/dL", icon: "gauge", digits: 1 },
      { label: "Body mass index", value: profile.numeric_summary[3], unit: "kg/m&sup2;", icon: "activity", digits: 1 },
      { label: "Physical activity", value: profile.numeric_summary[4], unit: "sessions / wk", icon: "heart", digits: 2 },
      { label: "Stress level", value: profile.numeric_summary[5], unit: "score / 10", icon: "spark", digits: 1 },
    ]
      .map(function (row) {
        return (
          '<div class="vital-row"><span class="vital-icon">' + icon(row.icon) + "</span>" +
          '<div class="vital-body"><div class="vital-label">' + row.label + "</div>" +
          '<div class="vital-value">' + num(row.value.mean, row.digits) + " <span class=\"tiny muted\">" + row.unit + "</span></div></div>" +
          '<div class="vital-range">' + num(row.value.min, row.digits) + "&ndash;" + num(row.value.max, row.digits) + "</div></div>"
        );
      })
      .join("");

    return (
      '<div class="page">' +
      '<div class="page-head"><div>' +
      '<span class="eyebrow">Clinical overview</span>' +
      "<h1 class=\"mt-1\">" + greeting() + ", " + esc(firstName(APP.user.name)) + "</h1>" +
      "<p>Here is the current picture across the 500-patient cohort and four verified classifiers.</p>" +
      "</div>" +
      '<div class="page-actions"><span class="date-chip">' + icon("calendar") + " " + longDate() + "</span>" +
      '<a class="btn primary" href="#/predict">' + icon("plus") + " New prediction</a></div></div>" +

      '<section class="card slideshow-card lift"><div class="slideshow" id="slideshow" tabindex="0" ' +
      'role="group" aria-roledescription="carousel" aria-label="CardioCare highlights">' +
      slides +
      '<button type="button" class="slide-arrow prev" data-action="slide-prev" aria-label="Previous slide">' +
      icon("chevronLeft") + "</button>" +
      '<button type="button" class="slide-arrow next" data-action="slide-next" aria-label="Next slide">' +
      icon("chevronRight") + "</button>" +
      '<div class="slide-dots" role="tablist" aria-label="Choose slide">' + dots + "</div>" +
      '<span class="pill" id="slideStatus" style="position:absolute;left:18px;top:16px;z-index:3;' +
      'background:rgba(255,255,255,0.93);border-color:transparent;color:#1d4ed8">1 / ' + SLIDES.length + "</span>" +
      "</div></section>" +

      '<div class="grid kpi-grid mt-2">' +
      metricCard({
        label: "Cohort size",
        value: profile.shape.rows,
        icon: "users",
        sub: "patients &middot; " + profile.feature_count + " clinical features",
      }) +
      metricCard({
        label: "Disease prevalence",
        value: pctRaw(prevalence),
        icon: "heart",
        sub: positives + " positive &middot; " + negatives + " negative",
      }) +
      metricCard({
        label: "Verified models",
        value: models.model_order.length,
        icon: "layers",
        sub: "inference parity checked on all records",
      }) +
      metricCard({
        label: "Selected model",
        value: selected.acronym,
        icon: "shield",
        sub: "mean CV F1 " + score(selected.cv.f1.mean) + " &plusmn; " + score(selected.cv.f1.std),
      }) +
      "</div>" +

      '<div class="grid split-2-1 mt-2">' +
      '<div class="card heart-card lift"><div class="card-head"><div>' +
      '<div class="card-title">Cohort at a glance</div>' +
      '<div class="card-sub">Mean values from hospital_synthetic_dataset.xlsx</div></div>' +
      '<span class="badge blue">500 patients</span></div>' +
      '<div class="heart-stage">' +
      '<img src="assets/images/Heart_display.png" alt="Anatomical heart illustration" />' +
      '<div class="float-chip fc-a"><div class="fc-label">Age</div><div class="fc-value">' +
      num(profile.numeric_summary[0].mean) + '<span class="fc-unit">yrs</span></div></div>' +
      '<div class="float-chip fc-b"><div class="fc-label">Blood pressure</div><div class="fc-value">' +
      num(profile.numeric_summary[1].mean) + '<span class="fc-unit">mmHg</span></div></div>' +
      '<div class="float-chip fc-c"><div class="fc-label">Cholesterol</div><div class="fc-value">' +
      num(profile.numeric_summary[2].mean) + '<span class="fc-unit">mg/dL</span></div></div>' +
      '<div class="float-chip fc-d"><div class="fc-label">BMI</div><div class="fc-value">' +
      num(profile.numeric_summary[3].mean) + '<span class="fc-unit">kg/m&sup2;</span></div></div>' +
      "</div>" +
      '<div class="row mt-2" style="justify-content:space-between"><span class="tiny muted">' +
      "Observed age range " + num(profile.numeric_summary[0].min, 0) + "&ndash;" + num(profile.numeric_summary[0].max, 0) +
      '</span><a class="card-link" href="#/dataset">Explore dataset</a></div></div>' +

      '<div class="card lift"><div class="card-head"><div><div class="card-title">Average vitals</div>' +
      '<div class="card-sub">Cohort means with observed ranges</div></div>' +
      '<span class="badge gray">10 features</span></div>' +
      '<div class="vital-list">' + vitalRows + "</div></div></div>" +

      '<div class="grid split-2-1 mt-2">' +
      '<div class="card lift"><div class="card-head"><div>' +
      '<div class="card-title">Cross-validated F1 by model</div>' +
      '<div class="card-sub">5-fold stratified cross-validation on the training partition</div></div>' +
      '<a class="card-link" href="#/models">Full evaluation</a></div>' +
      hbars(performanceRows) +
      '<div class="legend"><span class="legend-item"><span class="legend-swatch"></span>' +
      "Higher is better &middot; decision rule P &ge; 0.50</span></div>" +
      '<div class="form-section-title">' + esc(selected.acronym) + " &middot; fold scores</div>" +
      '<div class="row">' +
      selected.cv.f1.folds
        .map(function (fold, index) {
          return '<span class="chip">Fold ' + (index + 1) + " <b>" + score(fold) + "</b></span>";
        })
        .join("") +
      "</div></div>" +

      '<div class="card lift"><div class="card-head"><div><div class="card-title">Selected model</div>' +
      '<div class="card-sub">Chosen by ' + esc(models.selection_basis) + "</div></div>" +
      '<span class="badge blue">Auto-selected</span></div>' +
      '<div class="row"><span class="acronym" style="--acronym:' + modelColor(selectedKey) + '">' +
      esc(selected.acronym) + "</span><div><div class=\"strong\">" + esc(selected.name) + "</div>" +
      '<div class="tiny muted">' + esc(selected.family) + "</div></div></div>" +
      selectedScores +
      '<p class="tiny muted mt-2">Best CV AUC across all models is ' + score(bestCvAuc) +
      ", which is close to chance on this synthetic sample.</p>" +
      '<a class="btn ghost sm mt-2" href="#/models">Open model comparison ' + icon("arrowRight") + "</a></div></div>" +

      '<div class="grid split-2-1 mt-2">' +
      '<div class="card lift"><div class="card-head"><div><div class="card-title">Recent predictions</div>' +
      '<div class="card-sub">Saved privately in this browser</div></div>' +
      (history.length ? '<a class="card-link" href="#/history">View all</a>' : "") + "</div>" +
      recent + "</div>" +

      '<div class="card lift"><div class="card-head"><div><div class="card-title">Cohort composition</div>' +
      '<div class="card-sub">Target distribution across all records</div></div></div>' +
      '<div class="donut-wrap">' +
      donut(
        [
          { value: positives, color: "#dc2626" },
          { value: negatives, color: "#2563eb" },
        ],
        pctRaw(prevalence, 1),
        "heart disease"
      ) +
      '<div class="donut-legend">' +
      '<div class="donut-row"><span class="legend-swatch" style="--swatch:#dc2626"></span>Heart disease <b>' + positives + "</b></div>" +
      '<div class="donut-row"><span class="legend-swatch" style="--swatch:#2563eb"></span>No heart disease <b>' + negatives + "</b></div>" +
      '<div class="donut-row"><span class="legend-swatch" style="--swatch:#94a3b8"></span>Total records <b>' + profile.shape.rows + "</b></div>" +
      "</div></div>" +
      '<a class="btn ghost sm mt-2" href="#/dataset">Inspect the dataset ' + icon("arrowRight") + "</a></div></div>" +

      '<div class="callout warn mt-2" style="margin-bottom:6px">' + icon("alert") + " <b>Interpretation note.</b> " +
      esc(models.signal_assessment.interpretation) + "</div>" +
      "</div>"
    );
  }

  /* ======================================================================
     Prediction page
     ====================================================================== */
  const DEFAULT_PATIENT = {
    age: 55,
    blood_pressure: 133,
    cholesterol: 222,
    bmi: 29.2,
    physical_activity: 2,
    stress_level: 5,
    sex: "Female",
    smoker: "No",
    diabetes: "No",
    family_history: "No",
  };

  function numericField(item, value) {
    return (
      '<div class="field" data-field="' + item.name + '">' +
      '<label class="field-label" for="f-' + item.name + '">' + esc(item.label) +
      '<span class="field-unit">' + esc(item.unit) + "</span></label>" +
      '<input type="number" id="f-' + item.name + '" name="' + item.name + '" ' +
      'min="' + item.min + '" max="' + item.max + '" step="' + item.step + '" ' +
      'value="' + esc(value) + '" inputmode="decimal" required />' +
      '<div class="field-hint">Observed ' + item.observed_min + "&ndash;" + item.observed_max + "</div>" +
      '<div class="field-error"></div></div>'
    );
  }

  function categoricalField(item, value) {
    const options = item.options
      .map(function (option) {
        return (
          "<label><input type=\"radio\" name=\"" + item.name + "\" value=\"" + esc(option) + "\"" +
          (String(value) === option ? " checked" : "") + " /><span>" + esc(option) + "</span></label>"
        );
      })
      .join("");
    return (
      '<div class="field" data-field="' + item.name + '">' +
      '<span class="field-label">' + esc(item.label) + "</span>" +
      '<div class="segmented">' + options + "</div>" +
      '<div class="field-error"></div></div>'
    );
  }

  function renderPredict() {
    const models = APP.data.models;
    const schema = models.feature_schema;
    const key = selectedModelKey();
    const model = modelByKey(key) || models.models[models.model_order[0]];
    const values = Object.assign({}, DEFAULT_PATIENT, APP.ui.lastPatient || {});

    const numericFields = schema.numeric
      .map(function (item) {
        return numericField(item, values[item.name]);
      })
      .join("");
    const categoricalFields = schema.categorical
      .map(function (item) {
        return categoricalField(item, values[item.name]);
      })
      .join("");

    const options = models.model_order
      .map(function (optionKey) {
        const option = models.models[optionKey];
        return (
          '<option value="' + optionKey + '"' + (optionKey === key ? " selected" : "") + ">" +
          esc(option.name) + " &middot; " + esc(option.acronym) + "</option>"
        );
      })
      .join("");

    const resultHtml = APP.ui.result
      ? predictionResultHTML(APP.ui.result)
      : '<div class="card lift"><div class="empty" style="padding:36px 18px">' +
        '<div class="empty-icon">' + icon("stethoscope") + "</div>" +
        "<h3>No assessment yet</h3>" +
        "<p>Complete the patient profile, then run a prediction to see the probability, drivers and indicators.</p>" +
        '<span class="pill mt-2" style="margin-top:14px">Decision rule P &ge; 0.50</span></div></div>';

    return (
      '<div class="page">' +
      '<div class="page-head"><div><span class="eyebrow">Risk assessment</span>' +
      '<h1 class="mt-1">Estimate heart disease probability</h1>' +
      "<p>Score one patient with the selected verified classifier. All values follow the published feature schema.</p></div>" +
      '<div class="page-actions"><span class="pill">' + icon("shield") + " P &ge; 0.50 decision rule</span>" +
      '<a class="btn ghost" href="#/models">View models</a></div></div>' +

      '<div class="predict-grid">' +
      '<div class="stack">' +
      '<form id="predictForm" novalidate><div class="card lift">' +
      '<div class="card-head"><div><div class="card-title">Patient characteristics</div>' +
      '<div class="card-sub">Ten clinical inputs &middot; numerical and categorical</div></div>' +
      '<span class="badge blue">10 features</span></div>' +
      '<div class="form-section-title">Vital measurements</div>' +
      '<div class="form-grid">' + numericFields + "</div>" +
      '<div class="form-section-title">Clinical history</div>' +
      '<div class="form-grid">' + categoricalFields + "</div>" +
      '<div class="row mt-3" style="justify-content:space-between">' +
      '<p class="tiny muted" style="max-width:340px">Values outside the observed range are accepted within the schema limits. ' +
      "This prototype does not provide medical advice.</p>" +
      '<div class="row"><button type="button" class="btn ghost" data-action="prefill">Use cohort averages</button>' +
      '<button type="submit" class="btn primary" id="predictSubmit">' + icon("pulse") + " Predict risk</button></div>" +
      "</div></div></form>" +

      '<div class="card lift desktop-only"><div class="card-head"><div>' +
      '<div class="card-title">How the score is produced</div>' +
      '<div class="card-sub">Parity-verified inference &middot; no retraining</div></div>' +
      '<span class="badge gray">3 steps</span></div>' +
      '<div class="timeline">' +
      '<div class="timeline-item"><span class="timeline-num">01</span><div>' +
      '<div class="timeline-title">Preprocess</div><div class="timeline-detail">' +
      "Six numerical inputs are standardised and four categorical fields one-hot encoded using training parameters." +
      "</div></div></div>" +
      '<div class="timeline-item"><span class="timeline-num">02</span><div>' +
      '<div class="timeline-title">Score</div><div class="timeline-detail">' +
      "The saved " + esc(model.name) + " pipeline returns P(heart disease) for this profile." +
      "</div></div></div>" +
      '<div class="timeline-item"><span class="timeline-num">03</span><div>' +
      '<div class="timeline-title">Decide</div><div class="timeline-detail">' +
      "P &ge; 0.50 indicates disease; the same rule produced the published test metrics." +
      "</div></div></div></div>" +
      '<div class="callout mt-2 tiny">The API replays the saved artifact over the published arithmetic. ' +
      "Nothing is trained inside the serverless function.</div></div>" +
      "</div>" +
      '<div class="predict-side">' +
      '<div class="card model-picker lift"><div class="card-head"><div>' +
      '<div class="card-title">Model</div><div class="card-sub">Choose the classifier for this assessment</div></div>' +
      '<span class="badge gray">4 verified</span></div>' +
      '<label class="field-label" for="modelSelect">Classifier</label>' +
      '<select class="select" id="modelSelect">' + options + "</select>" +
      '<div class="model-meta" id="modelMeta">' + modelMetaHTML(key) + "</div>" +
      '<div class="callout mt-2 tiny">Every model uses the same ten inputs, the same preprocessing and the same ' +
      "P &ge; 0.50 classification rule.</div></div>" +
      '<div id="predictionOutput">' + resultHtml + "</div>" +
      "</div></div>" +

      '<div class="callout mt-2" style="margin-bottom:6px">' + icon("alert") +
      " <b>Prototype notice.</b> Predictions are produced by models trained on a synthetic cohort. " +
      "Discrimination is close to chance, so results are for demonstrating the workflow and must not guide clinical care.</div>" +
      "</div>"
    );
  }

  function modelMetaHTML(key) {
    const model = modelByKey(key);
    if (!model) return "";
    return (
      '<span class="chip"><span class="dot" style="--dot:' + modelColor(key) + '"></span>' +
      esc(model.family) + "</span>" +
      '<span class="chip">CV F1 <b>' + score(model.cv.f1.mean) + "</b></span>" +
      '<span class="chip">Test AUC <b>' + score(model.metrics.roc_auc) + "</b></span>"
    );
  }

  function updatePredictModel(key) {
    APP.ui.selectedModel = key;
    const box = $("#modelMeta");
    if (box) box.innerHTML = modelMetaHTML(key);
  }

  function readPredictForm() {
    const form = $("#predictForm");
    const schema = APP.data.models.feature_schema;
    const patient = {};
    let valid = true;
    let firstBad = null;

    schema.numeric.forEach(function (item) {
      const input = form.querySelector('[name="' + item.name + '"]');
      if (!input) return;
      const field = input.closest(".field");
      const errorBox = field ? field.querySelector(".field-error") : null;
      const raw = String(input.value || "").trim();
      const value = Number(raw);
      let message = "";
      if (raw === "") {
        message = "Required.";
      } else if (!Number.isFinite(value)) {
        message = "Enter a number.";
      } else if (value < item.min || value > item.max) {
        message = "Use " + item.min + "\u2013" + item.max + " " + item.unit + ".";
      }
      if (field) field.classList.toggle("invalid", Boolean(message));
      if (errorBox) errorBox.textContent = message;
      if (message) {
        valid = false;
        if (!firstBad) firstBad = input;
      } else {
        patient[item.name] = value;
      }
    });

    schema.categorical.forEach(function (item) {
      const field = form.querySelector('[data-field="' + item.name + '"]');
      const checked = form.querySelector('input[name="' + item.name + '"]:checked');
      if (field) field.classList.toggle("invalid", !checked);
      if (checked) {
        patient[item.name] = checked.value;
      } else {
        valid = false;
        if (!firstBad) firstBad = field;
      }
    });

    return { valid: valid, patient: patient, firstBad: firstBad };
  }

  function patientSummary(patient) {
    if (!patient) return "";
    return [
      patient.age + " yrs",
      patient.sex,
      patient.blood_pressure + " mmHg",
      patient.cholesterol + " mg/dL",
      patient.bmi + " kg/m\u00b2",
    ].join(" \u00b7 ");
  }

  function driverLabel(name) {
    return String(name || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, function (letter) {
        return letter.toUpperCase();
      });
  }

  function predictionResultHTML(payload) {
    const positive = Number(payload.prediction) === 1;
    const probability = Number(payload.probability) || 0;
    const band = payload.risk_band || {};
    const drivers = payload.drivers || [];
    const indicators = payload.clinical_indicators || [];
    const warnings = payload.warnings || [];
    const comparison = payload.comparison || {};
    const maxStrength = drivers.reduce(function (max, item) {
      return Math.max(max, Number(item.strength) || 0);
    }, 0);

    const warningHtml = warnings.length
      ? '<div class="warning-list">' +
        warnings
          .map(function (warning) {
            return '<div class="warning-item">' + esc(warning) + "</div>";
          })
          .join("") +
        "</div>"
      : "";

    const driverHtml = drivers.length
      ? drivers
          .map(function (driver) {
            const strength = Number(driver.strength) || 0;
            const width = maxStrength ? clamp((strength / maxStrength) * 100, 4, 100) : 4;
            const colour =
              driver.impact === "increases"
                ? "#dc2626"
                : driver.impact === "decreases"
                ? "#2563eb"
                : "#64748b";
            const tag =
              driver.impact === "increases"
                ? "raises risk"
                : driver.impact === "decreases"
                ? "lowers risk"
                : "associated";
            return (
              '<div class="driver"><div class="driver-head"><span>' + esc(driverLabel(driver.feature)) +
              ' <span class="tiny muted">' + tag + "</span></span><b>" + strength.toFixed(3) + "</b></div>" +
              '<div class="driver-track"><div class="driver-fill" style="width:' + width.toFixed(1) +
              "%;--driver:" + colour + '"></div></div></div>'
            );
          })
          .join("")
      : '<p class="tiny muted">This model does not expose additive per-patient contributions.</p>';

    const indicatorHtml = indicators.length
      ? '<div class="row" style="margin-top:6px">' +
        indicators
          .map(function (item) {
            const severity = item.severity || "moderate";
            const colour = severity === "high" ? "#dc2626" : severity === "moderate" ? "#d97706" : "#2563eb";
            return (
              '<span class="chip" title="' + esc(item.detail || "") + '"><span class="dot" style="--dot:' +
              colour + '"></span>' + esc(item.label) + "</span>"
            );
          })
          .join("") +
        "</div>"
      : '<p class="tiny muted">No clinical indicators were flagged at these values.</p>';

    const comparisonRows = Object.keys(comparison)
      .map(function (key) {
        const item = comparison[key];
        const active = item.name === payload.model_name;
        return (
          "<tr><td class=\"model-cell\"><span class=\"cell-dot\" style=\"--dot:" + modelColor(key) + '"></span>' +
          esc(item.name) + (active ? ' <span class="badge blue">scored</span>' : "") + "</td>" +
          '<td class="num">' + pct(item.probability) + "</td>" +
          "<td>" + (Number(item.prediction) === 1
            ? '<span class="badge red">Disease</span>'
            : '<span class="badge green">No disease</span>') + "</td></tr>"
        );
      })
      .join("");

    return (
      '<div class="result-card">' +
      '<div class="result-top"><span class="label">Assessment result</span>' +
      '<span class="badge blue">' + esc(payload.model_name || "") + "</span></div>" +
      '<div class="result-body">' + warningHtml +
      '<div class="result-status ' + (positive ? "positive" : "negative") + '">' +
      '<span class="result-status-icon">' + icon(positive ? "alert" : "check") + "</span>" +
      "<div><div class=\"result-status-title\">" + esc(payload.label) + "</div>" +
      '<div class="result-status-sub">' + esc(band.label || "") + " &middot; threshold P &ge; 0.50</div></div></div>" +
      '<div class="result-prob"><b>' + pct(probability) + "</b><span>probability of heart disease</span></div>" +
      '<div class="meter ' + (positive ? "positive" : "negative") + '">' +
      '<span data-w="' + (probability * 100).toFixed(1) + '%" style="width:0%"></span></div>' +
      '<div class="meter-legend"><span>0%</span><span>50% threshold</span><span>100%</span></div>' +
      '<div class="prob-pair">' +
      '<div class="prob-box risk"><div class="k">Heart disease</div><div class="v">' + pct(probability) + "</div></div>" +
      '<div class="prob-box safe"><div class="k">No heart disease</div><div class="v">' + pct(1 - probability) + "</div></div>" +
      "</div>" +
      '<p class="risk-note">' + esc(band.description || "") + "</p>" +
      '<div class="result-section"><h4>Model drivers</h4>' + driverHtml + "</div>" +
      '<div class="result-section"><h4>Clinical indicators</h4>' + indicatorHtml + "</div>" +
      '<div class="result-section"><h4>Comparison across models</h4>' +
      '<div class="table-wrap mt-2"><table class="table" style="min-width:0"><thead><tr>' +
      "<th>Model</th><th class=\"num\">Probability</th><th>Outcome</th></tr></thead><tbody>" +
      comparisonRows + "</tbody></table></div></div>" +
      '<div class="result-section"><div class="row" style="justify-content:space-between">' +
      '<button type="button" class="btn green sm" data-action="download-result">' + icon("download") +
      " Download result</button>" +
      '<button type="button" class="btn ghost sm" data-action="reset-assessment">New assessment</button>' +
      "</div></div>" +
      "</div></div>"
    );
  }

  function setPredictBusy(busy) {
    const button = $("#predictSubmit");
    if (!button) return;
    if (busy) {
      button.disabled = true;
      button.dataset.label = button.innerHTML;
      button.textContent = "Scoring patient\u2026";
    } else {
      button.disabled = false;
      if (button.dataset.label) {
        button.innerHTML = button.dataset.label;
        delete button.dataset.label;
      }
    }
  }

  async function handlePredictSubmit(event) {
    event.preventDefault();
    if (APP.ui.predicting) return;

    const read = readPredictForm();
    if (!read.valid) {
      toast("Please correct the highlighted fields.", "error");
      if (read.firstBad && read.firstBad.focus) read.firstBad.focus();
      return;
    }

    const select = $("#modelSelect");
    const key = (select && select.value) || selectedModelKey();
    updatePredictModel(key);
    APP.ui.predicting = true;
    APP.ui.result = null;
    const output = $("#predictionOutput");
    if (output) {
      output.innerHTML =
        '<div class="card lift"><div class="boot" style="padding:34px 12px">' +
        '<div class="boot-mark"></div><div><h1 style="font-size:15px">Scoring patient</h1>' +
        '<p>Applying the verified pipeline for ' + esc(modelName(key)) + "\u2026</p></div></div></div>";
    }
    setPredictBusy(true);

    try {
      const response = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: key, patient: read.patient }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        const message =
          (payload.error || "The prediction request failed.") +
          (payload.errors && payload.errors.length ? " " + payload.errors.join(" ") : "") +
          (payload.warnings && payload.warnings.length ? " " + payload.warnings.join(" ") : "");
        if (output) output.innerHTML = '<div class="error-item">' + esc(message) + "</div>";
        toast("Prediction failed.", "error");
        return;
      }

      APP.ui.result = payload;
      APP.ui.lastPatient = read.patient;
      APP.ui.selectedModel = key;

      const record = {
        id: "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        at: new Date().toISOString(),
        model: key,
        modelName: payload.model_name || modelName(key),
        probability: payload.probability,
        prediction: payload.prediction,
        label: payload.label,
        riskKey: (payload.risk_band && payload.risk_band.key) || "",
        riskLabel: (payload.risk_band && payload.risk_band.label) || "",
        patient: read.patient,
      };
      addHistory(record);
      APP.ui.resultRecordId = record.id;

      if (output) output.innerHTML = predictionResultHTML(payload);
      playAnimations();
      toast(
        Number(payload.prediction) === 1
          ? "Assessment saved. Heart disease is indicated."
          : "Assessment saved. No heart disease is indicated.",
        Number(payload.prediction) === 1 ? "error" : "success"
      );
      if (window.innerWidth < 1024 && output) {
        output.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (error) {
      if (output) {
        output.innerHTML =
          '<div class="error-item">The prediction service could not be reached. ' +
          "When running locally, start the full preview server so /api/predict is available.</div>";
      }
      toast("Prediction service unavailable.", "error");
    } finally {
      APP.ui.predicting = false;
      setPredictBusy(false);
    }
  }

  function prefillAverages() {
    const form = $("#predictForm");
    if (!form) return;
    APP.data.models.feature_schema.numeric.forEach(function (item) {
      const input = form.querySelector('[name="' + item.name + '"]');
      if (input) input.value = item.median;
      const field = input && input.closest(".field");
      if (field) field.classList.remove("invalid");
    });
    $$(".field.invalid", form).forEach(function (field) {
      field.classList.remove("invalid");
    });
    toast("Cohort medians applied.");
  }

  function resetAssessment() {
    const output = $("#predictionOutput");
    APP.ui.result = null;
    APP.ui.lastPatient = null;
    APP.ui.resultRecordId = null;
    if (output) {
      output.innerHTML =
        '<div class="card lift"><div class="empty" style="padding:36px 18px">' +
        '<div class="empty-icon">' + icon("stethoscope") + "</div>" +
        "<h3>No assessment yet</h3>" +
        "<p>Adjust the patient profile and run a new prediction.</p></div></div>";
    }
    const form = $("#predictForm");
    if (form) {
      $$(".field.invalid", form).forEach(function (field) {
        field.classList.remove("invalid");
      });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ======================================================================
     Models page
     ====================================================================== */
  function rocChart(models) {
    const width = 560;
    const height = 300;
    const pad = { left: 44, right: 16, top: 14, bottom: 38 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const x = function (value) {
      return pad.left + value * plotW;
    };
    const y = function (value) {
      return pad.top + (1 - value) * plotH;
    };

    let grid = "";
    [0, 0.25, 0.5, 0.75, 1].forEach(function (tick) {
      grid +=
        '<line class="grid-line" x1="' + x(tick) + '" y1="' + y(0) + '" x2="' + x(tick) + '" y2="' + y(1) + '"></line>' +
        '<line class="grid-line" x1="' + x(0) + '" y1="' + y(tick) + '" x2="' + x(1) + '" y2="' + y(tick) + '"></line>' +
        '<text x="' + x(tick) + '" y="' + (height - 16) + '" text-anchor="middle" font-size="10">' +
        tick.toFixed(2) + "</text>" +
        '<text x="' + (pad.left - 10) + '" y="' + (y(tick) + 3.5) + '" text-anchor="end" font-size="10">' +
        tick.toFixed(2) + "</text>";
    });

    const lines = models.model_order
      .map(function (key) {
        const model = models.models[key];
        const points = model.roc_curve
          .map(function (point) {
            return x(point.fpr).toFixed(1) + "," + y(point.tpr).toFixed(1);
          })
          .join(" ");
        return (
          '<polyline points="' + points + '" fill="none" stroke="' + modelColor(key) +
          '" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round"></polyline>'
        );
      })
      .join("");

    return (
      '<svg class="chart" viewBox="0 0 ' + width + " " + height + '" role="img" ' +
      'aria-label="Receiver operating characteristic curves for all four models">' +
      grid +
      '<line class="axis-line" x1="' + x(0) + '" y1="' + y(0) + '" x2="' + x(1) + '" y2="' + y(0) + '"></line>' +
      '<line class="axis-line" x1="' + x(0) + '" y1="' + y(0) + '" x2="' + x(0) + '" y2="' + y(1) + '"></line>' +
      '<line x1="' + x(0) + '" y1="' + y(0) + '" x2="' + x(1) + '" y2="' + y(1) +
      '" stroke="#cbd5e1" stroke-width="1.2" stroke-dasharray="4 4"></line>' +
      lines +
      '<text x="' + (pad.left + plotW / 2) + '" y="' + (height - 2) + '" text-anchor="middle" font-size="10.5">' +
      "False positive rate</text>" +
      '<text x="12" y="' + (pad.top + plotH / 2) + '" text-anchor="middle" font-size="10.5" ' +
      'transform="rotate(-90 12 ' + (pad.top + plotH / 2) + ')">True positive rate</text>' +
      "</svg>"
    );
  }

  function hyperparameterText(model) {
    const params = model.hyperparameters || {};
    const entries = Object.keys(params).map(function (key) {
      const value = params[key];
      return key + " = " + (value === null ? "\u2014" : value);
    });
    return entries.join(" \u00b7 ");
  }

  function modelCardHTML(key, selectedKey) {
    const model = APP.data.models.models[key];
    return (
      '<div class="card lift"><div class="card-head"><div class="algorithm">' +
      '<span class="acronym" style="--acronym:' + modelColor(key) + '">' + esc(model.acronym) + "</span>" +
      '<div><div class="name">' + esc(model.name) +
      (key === selectedKey ? ' <span class="badge blue">selected</span>' : "") + "</div>" +
      '<div class="family">' + esc(model.family) + "</div></div></div></div>" +
      "<p class=\"small muted\" style=\"line-height:1.6\">" + esc(model.description) + "</p>" +
      '<div class="param-box">' + esc(hyperparameterText(model)) + "</div>" +
      '<div class="strengths">' + esc(model.strengths) + "</div>" +
      '<div class="score-row">' +
      '<div class="score"><div class="k">CV F1</div><div class="v">' + score(model.cv.f1.mean) + "</div>" +
      '<div class="s">&plusmn; ' + score(model.cv.f1.std) + "</div></div>" +
      '<div class="score"><div class="k">Test F1</div><div class="v">' + score(model.metrics.f1) + "</div>" +
      '<div class="s">held-out</div></div>' +
      '<div class="score"><div class="k">ROC-AUC</div><div class="v">' + score(model.metrics.roc_auc) + "</div>" +
      '<div class="s">test set</div></div></div>' +
      '<div class="row mt-2" style="justify-content:space-between"><span class="tiny muted">' +
      model.test_samples + " test records</span>" +
      '<a class="card-link" href="#/predict">Score a patient</a></div></div>'
    );
  }

  function renderModels() {
    const models = APP.data.models;
    const training = APP.data.training;
    const selectedKey = models.best_model.key;
    const selected = models.models[selectedKey];
    const verification = training.run.verification || {};
    const verifiedCount = Object.keys(verification.models || {}).filter(function (key) {
      return verification.models[key].passed;
    }).length;
    const bestAucKey = models.model_order.reduce(function (best, key) {
      const current = models.models[key].cv.roc_auc.mean;
      return current > models.models[best].cv.roc_auc.mean ? key : best;
    }, models.model_order[0]);

    const comparisonRows = models.model_order
      .map(function (key) {
        const model = models.models[key];
        return (
          "<tr><td class=\"model-cell\"><span class=\"cell-dot\" style=\"--dot:" + modelColor(key) + '"></span>' +
          esc(model.name) + "</td>" +
          '<td class="num">' + score(model.cv.f1.mean) + ' <span class="tiny muted">&plusmn; ' +
          score(model.cv.f1.std) + "</span></td>" +
          '<td class="num">' + score(model.metrics.f1) + "</td>" +
          '<td class="num">' + score(model.metrics.roc_auc) + "</td>" +
          '<td class="num">' + pct(model.metrics.recall) + "</td>" +
          '<td class="num">' + pct(model.metrics.accuracy) + "</td>" +
          "<td>" + (key === selectedKey
            ? '<span class="badge blue">Selected</span>'
            : '<span class="badge gray">Compared</span>') + "</td></tr>"
        );
      })
      .join("");

    const matrix = selected.confusion_matrix;
    const cmCells = [
      { label: "True negative", value: matrix.tn, cls: "positive" },
      { label: "False positive", value: matrix.fp, cls: "negative" },
      { label: "False negative", value: matrix.fn, cls: "negative" },
      { label: "True positive", value: matrix.tp, cls: "positive" },
    ]
      .map(function (cell) {
        return (
          '<div class="cm-cell ' + cell.cls + '"><div class="n">' + cell.value + "</div>" +
          '<div class="t">' + cell.label + "</div></div>"
        );
      })
      .join("");

    const reportRows = selected.classification_report
      .map(function (row) {
        return (
          "<tr><td>" + esc(row.label) + "</td>" +
          '<td class="num">' + score(row.precision) + "</td>" +
          '<td class="num">' + score(row.recall) + "</td>" +
          '<td class="num">' + score(row.f1) + "</td>" +
          '<td class="num">' + row.support + "</td></tr>"
        );
      })
      .join("");

    const legend = models.model_order
      .map(function (key) {
        return (
          '<span class="legend-item"><span class="legend-swatch" style="--swatch:' + modelColor(key) +
          '"></span>' + esc(models.models[key].name) + "</span>"
        );
      })
      .join("");

    const pipeline = (training.pipeline_steps || [])
      .map(function (step, index) {
        return (
          '<div class="timeline-item"><span class="timeline-num">' + String(index + 1).padStart(2, "0") + "</span>" +
          '<div><div class="timeline-title">' + esc(step.title) + "</div>" +
          '<div class="timeline-detail">' + esc(step.detail) + "</div></div></div>"
        );
      })
      .join("");

    const verificationRows = Object.keys(verification.models || {})
      .map(function (key) {
        const item = verification.models[key];
        return (
          '<div class="kv-row"><span class="k"><span class="cell-dot" style="--dot:' + modelColor(key) + '"></span>' +
          esc(models.models[key].name) + "</span>" +
          '<span class="v">' + (item.passed
            ? '<span class="badge green">Verified</span>'
            : '<span class="badge red">Failed</span>') +
          ' <span class="tiny muted">max diff ' + Number(item.max_abs_probability_diff).toExponential(1) +
          "</span></span></div>"
        );
      })
      .join("");

    return (
      '<div class="page">' +
      '<div class="page-head"><div><span class="eyebrow">Model development</span>' +
      '<h1 class="mt-1">Four classifiers, one decision rule</h1>' +
      "<p>Cross-validated selection, a stratified hold-out evaluation and parity-verified inference.</p></div>" +
      '<div class="page-actions"><span class="badge ' + (verification.passed ? "green" : "red") + '">' +
      (verification.passed ? "Parity passed" : "Parity failed") + "</span>" +
      '<span class="date-chip">' + icon("calendar") + " Trained " + shortDate(training.run.trained_at) + "</span></div></div>" +

      '<div class="grid kpi-grid">' +
      metricCard({
        label: "Selected model",
        value: selected.acronym,
        icon: "shield",
        sub: esc(selected.name) + " &middot; CV F1 " + score(selected.cv.f1.mean),
      }) +
      metricCard({
        label: "Best CV ROC-AUC",
        value: score(models.signal_assessment.best_cv_roc_auc),
        icon: "gauge",
        sub: esc(models.models[bestAucKey].name) + " &middot; close to chance",
      }) +
      metricCard({
        label: "Held-out patients",
        value: training.run.dataset.test_rows,
        icon: "users",
        sub: selected.test_positives + " positive &middot; " + selected.test_negatives + " negative",
      }) +
      metricCard({
        label: "Inference parity",
        value: verifiedCount + " / " + models.model_order.length,
        icon: "check",
        sub: "max probability difference &lt; 1e-8",
      }) +
      "</div>" +

      '<div class="section-head"><div><h2>Model comparison</h2>' +
      "<p>Cross-validation on the training partition, then a single stratified 80/20 hold-out.</p></div>" +
      '<span class="pill">' + icon("shield") + " P &ge; 0.50</span></div>" +
      '<div class="table-wrap"><table class="table"><thead><tr>' +
      "<th>Model</th><th class=\"num\">CV F1</th><th class=\"num\">Test F1</th>" +
      "<th class=\"num\">ROC-AUC</th><th class=\"num\">Recall</th><th class=\"num\">Accuracy</th><th>Status</th>" +
      "</tr></thead><tbody>" + comparisonRows + "</tbody></table></div>" +

      '<div class="grid split-2-1 mt-2">' +
      '<div class="card lift"><div class="card-head"><div><div class="card-title">ROC curves</div>' +
      '<div class="card-sub">True positive rate against false positive rate on the held-out set</div></div>' +
      '<span class="badge gray">100 patients</span></div>' +
      rocChart(models) + '<div class="legend">' + legend + "</div></div>" +

      '<div class="card lift"><div class="card-head"><div><div class="card-title">Confusion matrix</div>' +
      '<div class="card-sub">' + esc(selected.name) + " &middot; threshold 0.50</div></div></div>" +
      '<div class="cm-grid">' + cmCells + "</div>" +
      '<div class="cm-axis"><span>Predicted no disease &larr;</span><span>&rarr; predicted disease</span></div>' +
      '<div class="table-wrap mt-2" style="border:0"><table class="table" style="min-width:0"><thead><tr>' +
      "<th>Class</th><th class=\"num\">Prec.</th><th class=\"num\">Recall</th><th class=\"num\">F1</th><th class=\"num\">n</th>" +
      "</tr></thead><tbody>" + reportRows + "</tbody></table></div></div></div>" +

      sectionHead("Algorithms", "Same inputs and preprocessing &middot; different inductive biases.") +
      '<div class="grid split-even">' +
      models.model_order
        .map(function (key) {
          return modelCardHTML(key, selectedKey);
        })
        .join("") +
      "</div>" +

      '<div class="grid split-2-1 mt-2">' +
      '<div class="card lift"><div class="card-head"><div><div class="card-title">Training pipeline</div>' +
      '<div class="card-sub">Leakage-safe preprocessing fitted inside each pipeline</div></div></div>' +
      '<div class="timeline">' + pipeline + "</div></div>" +
      '<div class="card lift"><div class="card-head"><div><div class="card-title">Run record</div>' +
      '<div class="card-sub">Saved artifacts served by the live API</div></div></div>' +
      '<div class="kv">' +
      '<div class="kv-row"><span class="k">Trained</span><span class="v">' + dateTime(training.run.trained_at) + "</span></div>" +
      '<div class="kv-row"><span class="k">Duration</span><span class="v">' + training.run.duration_seconds + " s</span></div>" +
      '<div class="kv-row"><span class="k">Split</span><span class="v">' + Math.round(training.run.split.train_size * 100) +
      " / " + Math.round(training.run.split.test_size * 100) + " stratified</span></div>" +
      '<div class="kv-row"><span class="k">Cross-validation</span><span class="v">' + training.run.cv.folds +
      "-fold " + esc(training.run.cv.strategy) + "</span></div>" +
      '<div class="kv-row"><span class="k">scikit-learn</span><span class="v">' +
      esc(training.run.environment.scikit_learn) + "</span></div>" +
      '<div class="kv-row"><span class="k">Python</span><span class="v">' + esc(training.run.environment.python) + "</span></div>" +
      "</div>" +
      '<div class="form-section-title">Inference parity</div>' + verificationRows +
      '<div class="callout mt-2 tiny">The hosted function replays the saved pipelines; it never retrains or edits metrics.</div>' +
      "</div></div>" +

      '<div class="callout warn mt-2" style="margin-bottom:6px">' + icon("alert") +
      " <b>Signal quality.</b> " + esc(models.signal_assessment.interpretation) + "</div>" +
      "</div>"
    );
  }

  /* ======================================================================
     Dataset page
     ====================================================================== */
  function correlationStyle(value) {
    const magnitude = Math.abs(Number(value) || 0);
    if (value >= 0) {
      return "background:rgba(37,99,235," + (0.07 + magnitude * 0.78).toFixed(2) + ");" +
        "color:" + (magnitude > 0.55 ? "#ffffff" : "#0f172a");
    }
    return "background:rgba(100,116,139," + (0.08 + magnitude * 0.62).toFixed(2) + ");" +
      "color:" + (magnitude > 0.55 ? "#ffffff" : "#0f172a");
  }

  function previewCell(column, value) {
    if (column === "Heart Disease") {
      return Number(value) === 1
        ? '<span class="badge red">Disease</span>'
        : '<span class="badge green">No disease</span>';
    }
    if (typeof value === "number") {
      return Number.isInteger(value) ? String(value) : num(value, 1);
    }
    return esc(value);
  }

  function datasetOverviewPanel(profile) {
    const preview = profile.preview || [];
    const columns = preview.length ? Object.keys(preview[0]) : [];
    const rows = preview
      .slice(0, 8)
      .map(function (row) {
        return (
          "<tr>" + columns
            .map(function (column) {
              return "<td>" + previewCell(column, row[column]) + "</td>";
            })
            .join("") + "</tr>"
        );
      })
      .join("");

    const positives = profile.target_counts.disease || 0;
    const negatives = profile.target_counts.no_disease || 0;
    const sex = profile.sex_distribution;
    const sexRows = hbars(
      sex.labels.map(function (label, index) {
        const withDisease = sex.disease[index];
        const withoutDisease = sex.no_disease[index];
        const total = withDisease + withoutDisease;
        const rate = total ? (withDisease / total) * 100 : 0;
        return {
          label: label + " (n=" + total + ")",
          value: rate / 100,
          display: rate.toFixed(1) + "%",
          color: index === 0 ? "#2563eb" : "#0ea5e9",
        };
      })
    );

    return (
      '<div class="grid split-2-1">' +
      '<div class="card lift"><div class="card-head"><div><div class="card-title">Record preview</div>' +
      '<div class="card-sub">First eight rows &middot; all eleven columns</div></div>' +
      '<span class="badge gray">' + profile.shape.rows + " rows</span></div>" +
      '<div class="table-wrap"><table class="table" style="min-width:900px"><thead><tr>' +
      columns.map(function (column) {
        return "<th>" + esc(column) + "</th>";
      }).join("") +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
      '<p class="tiny muted mt-2">Source file: ' + esc(APP.data.dataset.source_file) +
      " &middot; " + profile.feature_count + " independent features plus the target. " +
      "Scroll horizontally to see all eleven columns.</p></div>" +

      '<div class="card lift"><div class="card-head"><div><div class="card-title">Target distribution</div>' +
      '<div class="card-sub">0 = no disease &middot; 1 = heart disease</div></div></div>' +
      '<div class="donut-wrap">' +
      donut(
        [
          { value: positives, color: "#dc2626" },
          { value: negatives, color: "#2563eb" },
        ],
        pctRaw(profile.target_prevalence, 1),
        "heart disease",
        148
      ) +
      '<div class="donut-legend">' +
      '<div class="donut-row"><span class="legend-swatch" style="--swatch:#dc2626"></span>Disease <b>' + positives + "</b></div>" +
      '<div class="donut-row"><span class="legend-swatch" style="--swatch:#2563eb"></span>No disease <b>' + negatives + "</b></div>" +
      '</div></div>' +
      '<div class="form-section-title">Disease rate by sex</div>' + sexRows +
      '<div class="form-section-title">Data quality</div>' +
      '<div class="kv">' +
      '<div class="kv-row"><span class="k">Missing values</span><span class="v">' + profile.missing_total + "</span></div>" +
      '<div class="kv-row"><span class="k">Duplicate rows</span><span class="v">' + profile.duplicate_rows + "</span></div>" +
      '<div class="kv-row"><span class="k">Memory footprint</span><span class="v">' + num(profile.memory_kb, 1) + " KB</span></div>" +
      "</div></div></div>"
    );
  }

  function datasetNumericPanel(profile) {
    const rows = profile.numeric_summary
      .map(function (item) {
        return (
          "<tr><td class=\"model-cell\">" + esc(item.label) + "</td>" +
          '<td class="num">' + num(item.mean, 2) + "</td>" +
          '<td class="num">' + num(item.std, 2) + "</td>" +
          '<td class="num">' + num(item.min, 1) + "</td>" +
          '<td class="num">' + num(item.q1, 1) + "</td>" +
          '<td class="num">' + num(item.median, 1) + "</td>" +
          '<td class="num">' + num(item.q3, 1) + "</td>" +
          '<td class="num">' + num(item.max, 1) + "</td></tr>"
        );
      })
      .join("");

    const spread = profile.numeric_summary
      .map(function (item) {
        const span = Math.max(1, item.max - item.min);
        const iqrStart = ((item.q1 - item.min) / span) * 100;
        const iqrWidth = ((item.q3 - item.q1) / span) * 100;
        const median = ((item.median - item.min) / span) * 100;
        return (
          '<div class="driver"><div class="driver-head"><span>' + esc(item.label) + "</span>" +
          "<b>" + num(item.q1, 1) + " &ndash; " + num(item.q3, 1) + "</b></div>" +
          '<div class="driver-track" style="position:relative;height:8px">' +
          '<div class="driver-fill" style="position:absolute;left:' + iqrStart.toFixed(1) + "%;width:" +
          Math.max(2, iqrWidth).toFixed(1) + '%;--driver:#2563eb"></div>' +
          '<div style="position:absolute;top:-2px;left:' + median.toFixed(1) + "%;width:2px;height:12px;background:#0f172a\"></div>" +
          "</div></div>"
        );
      })
      .join("");

    return (
      '<div class="grid split-2-1">' +
      '<div class="card lift"><div class="card-head"><div><div class="card-title">Numerical summary</div>' +
      '<div class="card-sub">Descriptive statistics across 500 records</div></div></div>' +
      '<div class="table-wrap"><table class="table" style="min-width:680px"><thead><tr>' +
      "<th>Feature</th><th class=\"num\">Mean</th><th class=\"num\">Std</th><th class=\"num\">Min</th>" +
      "<th class=\"num\">Q1</th><th class=\"num\">Median</th><th class=\"num\">Q3</th><th class=\"num\">Max</th>" +
      "</tr></thead><tbody>" + rows + "</tbody></table></div></div>" +
      '<div class="card lift"><div class="card-head"><div><div class="card-title">Interquartile ranges</div>' +
      '<div class="card-sub">Middle 50% with the median marked</div></div></div>' + spread +
      '<div class="callout mt-2 tiny">Numerical features are standardised inside every model pipeline, fitted on the training partition only.</div>' +
      "</div></div>"
    );
  }

  function datasetCategoricalPanel(profile) {
    const cards = Object.keys(profile.category_target)
      .map(function (key) {
        const label = APP.data.dataset.column_labels[key] || key;
        const categories = profile.category_target[key];
        const rows = categories.map(function (item) {
          return {
            label: item.category + " (n=" + item.total + ")",
            value: item.rate / 100,
            display: item.rate.toFixed(1) + "%",
            color: key === "sex" ? "#2563eb" : "#0ea5e9",
          };
        });
        return (
          '<div class="card lift"><div class="card-head"><div><div class="card-title">' + esc(label) + "</div>" +
          '<div class="card-sub">Heart disease rate by category</div></div>' +
          '<span class="badge gray">' + categories.length + " groups</span></div>" +
          hbars(rows) +
          '<p class="tiny muted mt-2">A rate near 50% indicates no meaningful separation in this synthetic sample.</p></div>'
        );
      })
      .join("");
    return '<div class="grid split-even">' + cards + "</div>";
  }

  function datasetCorrelationPanel(profile) {
    const correlation = profile.correlation;
    const labels = correlation.labels;
    const matrix = correlation.matrix;
    const head = "<tr><th></th>" + labels.map(function (label) {
      return "<th>" + esc(label) + "</th>";
    }).join("") + "</tr>";
    const body = matrix
      .map(function (row, rowIndex) {
        return (
          "<tr><th class=\"row-head\">" + esc(labels[rowIndex]) + "</th>" +
          row
            .map(function (value, columnIndex) {
              return (
                '<td style="' + correlationStyle(value) + '" title="' +
                esc(labels[rowIndex] + " vs " + labels[columnIndex]) + '">' +
                Number(value).toFixed(2) + "</td>"
              );
            })
            .join("") + "</tr>"
        );
      })
      .join("");

    return (
      '<div class="grid split-2-1">' +
      '<div class="card lift"><div class="card-head"><div><div class="card-title">Correlation matrix</div>' +
      '<div class="card-sub">Pearson correlation across numerical features and the target</div></div></div>' +
      '<div class="table-wrap" style="border:0;overflow-x:auto"><table class="heatmap">' +
      "<thead>" + head + "</thead><tbody>" + body + "</tbody></table></div>" +
      '<div class="legend"><span class="legend-item"><span class="legend-swatch" style="--swatch:#2563eb"></span>Positive association</span>' +
      '<span class="legend-item"><span class="legend-swatch" style="--swatch:#64748b"></span>Negative association</span></div></div>' +
      '<div class="card lift"><div class="card-head"><div><div class="card-title">Reading the matrix</div>' +
      '<div class="card-sub">What to expect from this cohort</div></div></div>' +
      '<p class="small muted" style="line-height:1.7">Coefficients close to zero mean the feature carries little linear signal for the target. ' +
      "On this synthetic dataset every association is weak, which is why held-out discrimination sits near chance.</p>" +
      '<div class="kv mt-2">' +
      '<div class="kv-row"><span class="k">Missing values</span><span class="v">' + profile.missing_total + "</span></div>" +
      '<div class="kv-row"><span class="k">Duplicate rows</span><span class="v">' + profile.duplicate_rows + "</span></div>" +
      '<div class="kv-row"><span class="k">Memory footprint</span><span class="v">' + num(profile.memory_kb, 1) + " KB</span></div>" +
      '<div class="kv-row"><span class="k">Columns</span><span class="v">' + profile.shape.columns + " (10 features + target)</span></div>" +
      "</div>" +
      '<div class="callout warn mt-2 tiny">Correlation is not causation, and a synthetic sample cannot establish clinical relationships.</div>' +
      "</div></div>"
    );
  }

  function renderDataset() {
    const dataset = APP.data.dataset;
    const profile = dataset.profile;
    const tab = APP.ui.datasetTab || "overview";
    const tabs = [
      { key: "overview", label: "Overview" },
      { key: "numeric", label: "Numerical profile" },
      { key: "categorical", label: "Categorical associations" },
      { key: "correlations", label: "Correlations" },
    ]
      .map(function (item) {
        return (
          '<button type="button" class="tab' + (tab === item.key ? " active" : "") +
          '" data-action="dataset-tab" data-tab="' + item.key + '">' + item.label + "</button>"
        );
      })
      .join("");

    let panel = "";
    if (tab === "numeric") panel = datasetNumericPanel(profile);
    else if (tab === "categorical") panel = datasetCategoricalPanel(profile);
    else if (tab === "correlations") panel = datasetCorrelationPanel(profile);
    else panel = datasetOverviewPanel(profile);

    return (
      '<div class="page">' +
      '<div class="page-head"><div><span class="eyebrow">Source data</span>' +
      '<h1 class="mt-1">Synthetic hospital cohort</h1>' +
      "<p>" + profile.shape.rows + " patient records, " + profile.shape.columns +
      " columns, published from " + esc(dataset.source_file) + ".</p></div>" +
      '<div class="page-actions"><span class="badge blue">Synthetic dataset</span>' +
      '<span class="date-chip">' + icon("table") + " 0 missing &middot; 0 duplicates</span></div></div>" +

      '<div class="grid kpi-grid">' +
      metricCard({ label: "Patients", value: profile.shape.rows, icon: "users", sub: "complete records" }) +
      metricCard({ label: "Clinical features", value: profile.feature_count, icon: "layers", sub: "plus one target column" }) +
      metricCard({ label: "Disease prevalence", value: pctRaw(profile.target_prevalence), icon: "heart", sub: "266 positive &middot; 234 negative" }) +
      metricCard({ label: "Data quality", value: "Clean", icon: "check", sub: "no missing values or duplicate rows" }) +
      "</div>" +

      '<div class="tabs mt-2">' + tabs + "</div>" +
      panel +

      '<div class="callout mt-2" style="margin-bottom:6px">' + icon("shield") +
      " <b>About this data.</b> The cohort is a synthetic teaching dataset generated for an academic machine-learning project. " +
      "It does not describe real patients, and the metrics reported here should not be treated as clinical evidence.</div>" +
      "</div>"
    );
  }

  /* ======================================================================
     History
     ====================================================================== */
  function historyMatches(record, query, filter) {
    if (filter === "disease" && Number(record.prediction) !== 1) return false;
    if (filter === "no-disease" && Number(record.prediction) === 1) return false;
    if (filter === "high" && Number(record.probability) < 0.65) return false;
    if (filter === "low" && Number(record.probability) >= 0.35) return false;
    if (!query) return true;
    const haystack = [
      record.modelName,
      record.label,
      record.riskLabel,
      record.patient && patientSummary(record.patient),
      record.patient && record.patient.age,
      record.patient && record.patient.sex,
      pct(record.probability),
      dateTime(record.at),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.indexOf(query.toLowerCase()) !== -1;
  }

  function filteredHistory() {
    const query = (APP.ui.historyQuery || "").trim();
    const filter = APP.ui.historyFilter || "all";
    return getHistory().filter(function (record) {
      return historyMatches(record, query, filter);
    });
  }

  function historyTableHTML(records) {
    if (!records.length) {
      const emptySearch = getHistory().length > 0;
      return (
        '<div class="card lift"><div class="empty">' +
        '<div class="empty-icon">' + icon(emptySearch ? "search" : "clock") + "</div>" +
        "<h3>" + (emptySearch ? "No matching records" : "No predictions saved yet") + "</h3>" +
        "<p>" + (emptySearch
          ? "Try a different search term or clear the filter."
          : "Every successful assessment is saved here for this browser account.") + "</p>" +
        (emptySearch
          ? '<button class="btn sm mt-2" data-action="clear-history-filters">Clear filters</button>'
          : '<a class="btn primary sm mt-2" href="#/predict">' + icon("plus") + " Run first prediction</a>") +
        "</div></div>"
      );
    }

    const rows = records
      .map(function (record) {
        return (
          "<tr>" +
          '<td><div class="strong">' + esc(patientSummary(record.patient)) + "</div>" +
          '<div class="tiny muted">' + esc(record.id) + "</div></td>" +
          "<td>" + esc(record.modelName || modelName(record.model)) + "</td>" +
          '<td class="num">' + probabilityCell(record.probability) + "</td>" +
          "<td>" + outcomeBadge(record) + "</td>" +
          '<td><span class="tiny muted">' + esc(record.riskLabel || "") + "</span></td>" +
          "<td>" + dateTime(record.at) + "</td>" +
          '<td><div class="row-actions">' +
          '<button type="button" class="action-btn export" data-action="download-record" data-id="' +
          esc(record.id) + '" title="Download this record as CSV" aria-label="Download record">' +
          icon("download") + "</button>" +
          '<button type="button" class="action-btn delete" data-action="delete-record" data-id="' +
          esc(record.id) + '" title="Delete this record" aria-label="Delete record">' +
          icon("trash") + "</button></div></td></tr>"
        );
      })
      .join("");

    return (
      '<div class="table-wrap"><table class="table" style="min-width:860px"><thead><tr>' +
      "<th>Patient</th><th>Model</th><th class=\"num\">Probability</th><th>Outcome</th>" +
      "<th>Risk band</th><th>Recorded</th><th class=\"num\">Actions</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>"
    );
  }

  function historyMetaHTML(records) {
    const total = getHistory().length;
    return (
      "<span class=\"tiny muted\" id=\"historyMeta\">" +
      (records.length === total
        ? total + (total === 1 ? " record" : " records") + " saved in this browser"
        : records.length + " of " + total + " records") +
      "</span>"
    );
  }

  function renderHistory() {
    const records = filteredHistory();
    const total = getHistory().length;
    return (
      '<div class="page">' +
      '<div class="page-head"><div><span class="eyebrow">Assessment records</span>' +
      '<h1 class="mt-1">Prediction history</h1>' +
      "<p>Private to this browser account. Export a copy before clearing your records.</p></div>" +
      '<div class="page-actions">' +
      '<button type="button" class="btn green" data-action="export-csv"' + (total ? "" : " disabled") + ">" +
      icon("download") + " Export CSV</button>" +
      '<button type="button" class="btn outline-green" data-action="export-json"' + (total ? "" : " disabled") + ">" +
      icon("file") + " Export JSON</button>" +
      '<button type="button" class="btn outline-red" data-action="clear-history"' + (total ? "" : " disabled") + ">" +
      icon("trash") + " Clear all</button></div></div>" +

      '<div class="card lift">' +
      '<div class="toolbar">' +
      '<div class="search">' + icon("search") +
      '<input type="search" id="historySearch" placeholder="Search by patient, model or date\u2026" ' +
      'aria-label="Search prediction history" value="' + esc(APP.ui.historyQuery) + '" /></div>' +
      '<select class="select" id="historyFilter" aria-label="Filter by outcome">' +
      [
        { value: "all", label: "All outcomes" },
        { value: "disease", label: "Disease detected" },
        { value: "no-disease", label: "No disease" },
        { value: "high", label: "Probability \u2265 65%" },
        { value: "low", label: "Probability < 35%" },
      ]
        .map(function (option) {
          return '<option value="' + option.value + '"' +
            (APP.ui.historyFilter === option.value ? " selected" : "") + ">" + option.label + "</option>";
        })
        .join("") +
      "</select>" + historyMetaHTML(records) + "</div>" +
      '<div id="historyTableWrap">' + historyTableHTML(records) + "</div></div>" +

      '<div class="callout mt-2" style="margin-bottom:6px">' + icon("shield") +
      " <b>Storage.</b> Records live in this browser's local storage under your account email. " +
      "Clearing browser data or using another device will make them unavailable.</div>" +
      "</div>"
    );
  }

  function refreshHistoryTable() {
    const wrap = $("#historyTableWrap");
    if (!wrap) return;
    const records = filteredHistory();
    wrap.innerHTML = historyTableHTML(records);
    const meta = $("#historyMeta");
    if (meta) meta.outerHTML = historyMetaHTML(records);
    playAnimations();
  }

  /* ======================================================================
     Downloads
     ====================================================================== */
  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type: type || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1200);
  }

  function csvCell(value) {
    const text = String(value === null || value === undefined ? "" : value);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function recordToCsv(record) {
    const patient = record.patient || {};
    return [
      record.at,
      record.modelName || record.model,
      record.probability,
      record.prediction,
      record.label,
      record.riskLabel,
      patient.age,
      patient.sex,
      patient.blood_pressure,
      patient.cholesterol,
      patient.bmi,
      patient.physical_activity,
      patient.stress_level,
      patient.smoker,
      patient.diabetes,
      patient.family_history,
      record.id,
    ]
      .map(csvCell)
      .join(",");
  }

  const CSV_HEADER = [
    "Recorded",
    "Model",
    "Probability",
    "Prediction",
    "Label",
    "Risk band",
    "Age",
    "Sex",
    "Blood pressure",
    "Cholesterol",
    "BMI",
    "Physical activity",
    "Stress level",
    "Smoker",
    "Diabetes",
    "Family history",
    "Record ID",
  ]
    .map(csvCell)
    .join(",");

  function exportHistoryCsv() {
    const records = getHistory();
    if (!records.length) {
      toast("There is no history to export.", "error");
      return;
    }
    const body = records.map(recordToCsv).join("\r\n");
    downloadFile(
      "cardiocare-history-" + todayISO() + ".csv",
      CSV_HEADER + "\r\n" + body,
      "text/csv;charset=utf-8"
    );
    toast("History exported as CSV.", "success");
  }

  function exportHistoryJson() {
    const records = getHistory();
    if (!records.length) {
      toast("There is no history to export.", "error");
      return;
    }
    downloadFile(
      "cardiocare-history-" + todayISO() + ".json",
      JSON.stringify({ account: APP.user.email, exportedAt: new Date().toISOString(), records: records }, null, 2),
      "application/json;charset=utf-8"
    );
    toast("History exported as JSON.", "success");
  }

  function downloadRecord(id) {
    const record = getHistory().find(function (item) {
      return item.id === id;
    });
    if (!record) return;
    downloadFile(
      "cardiocare-record-" + id + ".csv",
      CSV_HEADER + "\r\n" + recordToCsv(record),
      "text/csv;charset=utf-8"
    );
    toast("Record downloaded.", "success");
  }

  function downloadCurrentResult() {
    if (!APP.ui.result || !APP.ui.lastPatient) {
      toast("Run a prediction before downloading the result.", "error");
      return;
    }
    const payload = APP.ui.result;
    const saved = getHistory().find(function (item) {
      return item.id === APP.ui.resultRecordId;
    });
    const record = saved || {
      id: "unsaved",
      at: new Date().toISOString(),
      model: (APP.data.models.model_order.find(function (key) {
        return modelName(key) === payload.model_name;
      })) || selectedModelKey(),
      modelName: payload.model_name || modelName(selectedModelKey()),
      probability: payload.probability,
      prediction: payload.prediction,
      label: payload.label,
      riskLabel: (payload.risk_band && payload.risk_band.label) || "",
      patient: APP.ui.lastPatient,
    };
    downloadFile(
      "cardiocare-result-" + todayISO() + ".csv",
      CSV_HEADER + "\r\n" + recordToCsv(record),
      "text/csv;charset=utf-8"
    );
    toast("Assessment downloaded.", "success");
  }

  function clearAllHistory() {
    if (!getHistory().length) return;
    const confirmed = window.confirm(
      "Delete every saved prediction for this account? This cannot be undone. Export a copy first if you need one."
    );
    if (!confirmed) return;
    clearHistory();
    toast("Prediction history cleared.", "success");
    if (APP.route === "history" || APP.route === "dashboard" || APP.route === "profile") {
      renderRoute();
    }
  }

  function deleteRecord(id) {
    const confirmed = window.confirm("Delete this prediction record? This cannot be undone.");
    if (!confirmed) return;
    removeHistory(id);
    toast("Record deleted.", "success");
    if (APP.route === "dashboard") {
      renderRoute();
    } else {
      refreshHistoryTable();
    }
  }

  function clearHistoryFilters() {
    APP.ui.historyQuery = "";
    APP.ui.historyFilter = "all";
    const search = $("#searchInput");
    if (search) search.value = "";
    renderRoute();
  }

  /* ======================================================================
     Profile
     ====================================================================== */
  function renderProfile() {
    const history = getHistory();
    const last = history[0];
    const created = APP.user.createdAt ? longDate(APP.user.createdAt) : "—";
    return (
      '<div class="page">' +
      '<div class="page-head"><div><span class="eyebrow">Account</span>' +
      '<h1 class="mt-1">Your profile</h1>' +
      "<p>Manage the local account that holds your prediction history.</p></div>" +
      '<div class="page-actions"><span class="badge ' + (APP.user.demo ? "blue" : "gray") + '">' +
      (APP.user.demo ? "Demo account" : "Local account") + "</span>" +
      '<span class="date-chip">' + icon("calendar") + " Joined " + created + "</span></div></div>" +

      '<div class="grid split-2-1">' +
      "<div>" +
      '<div class="card lift profile-card"><span class="avatar lg">' + esc(initials(APP.user.name)) + "</span>" +
      '<div class="profile-identity"><h3>' + esc(APP.user.name) + "</h3>" +
      "<p>" + esc(APP.user.email) + "</p>" +
      '<div class="row mt-1"><span class="badge blue">' + esc(APP.user.role || "Clinician") + "</span>" +
      (APP.user.hospital ? '<span class="badge gray">' + esc(APP.user.hospital) + "</span>" : "") +
      "</div></div></div>" +

      '<div class="card lift mt-2"><div class="card-head"><div><div class="card-title">Personal details</div>' +
      '<div class="card-sub">Shown across the workspace and in exported records</div></div></div>' +
      '<form id="profileForm" novalidate>' +
      '<div class="form-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">' +
      '<div class="field"><label class="field-label" for="profileName">Full name</label>' +
      '<input type="text" id="profileName" name="name" value="' + esc(APP.user.name) + '" required />' +
      '<div class="field-error"></div></div>' +
      '<div class="field"><label class="field-label" for="profileEmail">Email address</label>' +
      '<input type="email" id="profileEmail" value="' + esc(APP.user.email) + '" disabled /></div>' +
      '<div class="field"><label class="field-label" for="profileRole">Role</label>' +
      '<input type="text" id="profileRole" name="role" value="' + esc(APP.user.role || "") +
      '" placeholder="Clinician" /></div>' +
      '<div class="field"><label class="field-label" for="profileHospital">Hospital or unit</label>' +
      '<input type="text" id="profileHospital" name="hospital" value="' + esc(APP.user.hospital || "") +
      '" placeholder="Optional" /></div></div>' +
      '<div class="row mt-2" style="justify-content:space-between">' +
      '<span class="tiny muted">Email cannot be changed in this demo.</span>' +
      '<button type="submit" class="btn primary" id="profileSave">Save changes</button></div>' +
      "</form></div>" +

      '<div class="card lift mt-2"><div class="card-head"><div><div class="card-title">Workspace storage</div>' +
      '<div class="card-sub">Everything stays on this device</div></div></div>' +
      '<div class="kv">' +
      '<div class="kv-row"><span class="k">Predictions saved</span><span class="v">' + history.length + "</span></div>" +
      '<div class="kv-row"><span class="k">Most recent</span><span class="v">' +
      (last ? timeAgo(last.at) : "No assessments yet") + "</span></div>" +
      '<div class="kv-row"><span class="k">Storage location</span><span class="v">Browser local storage</span></div>' +
      '<div class="kv-row"><span class="k">Account created</span><span class="v">' + created + "</span></div>" +
      "</div>" +
      '<div class="row mt-2"><button type="button" class="btn outline-green" data-action="export-account">' +
      icon("download") + " Download my data</button>" +
      '<a class="btn ghost" href="#/history">Open history</a></div></div>' +
      "</div>" +

      '<div class="stack">' +
      '<div class="card lift"><div class="card-head"><div><div class="card-title">Session</div>' +
      '<div class="card-sub">Signed in on this device</div></div></div>' +
      '<div class="kv">' +
      '<div class="kv-row"><span class="k">Email</span><span class="v">' + esc(APP.user.email) + "</span></div>" +
      '<div class="kv-row"><span class="k">Method</span><span class="v">Local demo authentication</span></div>' +
      '<div class="kv-row"><span class="k">History records</span><span class="v">' + history.length + "</span></div>" +
      "</div>" +
      '<button type="button" class="btn wide mt-2" data-action="signout">' + icon("logout") + " Sign out</button></div>" +

      '<div class="card lift danger-zone"><div class="card-head"><div><div class="card-title">Danger zone</div>' +
      '<div class="card-sub">These actions cannot be undone</div></div></div>' +
      '<p class="tiny muted" style="line-height:1.6">Clearing history removes every assessment for this account. ' +
      "Deleting the account also removes the login and its saved predictions from this browser.</p>" +
      '<button type="button" class="btn outline-red wide mt-2" data-action="clear-history"' +
      (history.length ? "" : " disabled") + ">" + icon("trash") + " Clear prediction history</button>" +
      '<button type="button" class="btn red wide mt-1" data-action="delete-account">' +
      icon("trash") + " Delete account</button></div>" +
      "</div></div>" +

      '<div class="callout mt-2" style="margin-bottom:6px">' + icon("shield") +
      " <b>Demo authentication.</b> Passwords are hashed before storage, but this is a local prototype, not a production identity system.</div>" +
      "</div>"
    );
  }

  function handleProfileSubmit(event) {
    event.preventDefault();
    const nameInput = $("#profileName");
    const field = nameInput ? nameInput.closest(".field") : null;
    const name = nameInput ? nameInput.value.trim() : "";
    if (name.length < 2) {
      if (field) {
        field.classList.add("invalid");
        const error = field.querySelector(".field-error");
        if (error) error.textContent = "Enter your full name.";
      }
      toast("Please enter your full name.", "error");
      return;
    }
    if (field) {
      field.classList.remove("invalid");
      const error = field.querySelector(".field-error");
      if (error) error.textContent = "";
    }
    updateAccount(APP.user.email, {
      name: name,
      role: ($("#profileRole").value || "").trim() || "Clinician",
      hospital: ($("#profileHospital").value || "").trim(),
    });
    renderChrome();
    renderRoute();
    toast("Profile updated.", "success");
  }

  function exportAccountData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      account: {
        name: APP.user.name,
        email: APP.user.email,
        role: APP.user.role || "",
        hospital: APP.user.hospital || "",
        createdAt: APP.user.createdAt || "",
      },
      history: getHistory(),
    };
    downloadFile(
      "cardiocare-account-" + todayISO() + ".json",
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8"
    );
    toast("Account data downloaded.", "success");
  }

  function deleteAccount() {
    const confirmed = window.confirm(
      "Delete this account and all of its saved predictions from this browser? This cannot be undone."
    );
    if (!confirmed) return;
    const email = APP.user.email;
    saveAccounts(
      getAccounts().filter(function (account) {
        return normalizeEmail(account.email) !== normalizeEmail(email);
      })
    );
    removeStore(historyKey(email));
    clearSession();
    APP.user = null;
    APP.ui.result = null;
    APP.ui.lastPatient = null;
    showAuth("signin");
    toast("Account deleted.");
  }

  /* ======================================================================
     Event bindings
     ====================================================================== */
  function handleAction(action, element) {
    if (action === "signout") {
      signOut();
    } else if (action === "slide-prev") {
      goSlide(APP.ui.slide - 1);
    } else if (action === "slide-next") {
      goSlide(APP.ui.slide + 1);
    } else if (action === "slide-dot") {
      goSlide(Number(element.getAttribute("data-index")) || 0);
    } else if (action === "open-history") {
      closeNotifications();
      navigate("history");
    } else if (action === "reload") {
      window.location.reload();
    } else if (action === "dataset-tab") {
      APP.ui.datasetTab = element.getAttribute("data-tab") || "overview";
      const view = $("#view");
      if (view) {
        view.innerHTML = renderDataset();
        playAnimations();
      }
    } else if (action === "prefill") {
      prefillAverages();
    } else if (action === "reset-assessment") {
      resetAssessment();
    } else if (action === "download-result") {
      downloadCurrentResult();
    } else if (action === "export-csv") {
      exportHistoryCsv();
    } else if (action === "export-json") {
      exportHistoryJson();
    } else if (action === "export-account") {
      exportAccountData();
    } else if (action === "clear-history") {
      clearAllHistory();
    } else if (action === "delete-record") {
      deleteRecord(element.getAttribute("data-id"));
    } else if (action === "download-record") {
      downloadRecord(element.getAttribute("data-id"));
    } else if (action === "clear-history-filters") {
      clearHistoryFilters();
    } else if (action === "delete-account") {
      deleteAccount();
    }
  }

  function bindEvents() {
    document.addEventListener("click", function (event) {
      const target = event.target;
      if (!target || !target.closest) return;

      const routeLink = target.closest("[data-route]");
      if (routeLink) closeDrawer();

      const actionEl = target.closest("[data-action]");
      if (actionEl) {
        event.preventDefault();
        handleAction(actionEl.getAttribute("data-action"), actionEl);
        return;
      }

      const panel = $("#notificationPanel");
      const notificationButton = $("#notificationButton");
      if (
        panel &&
        !panel.hidden &&
        !panel.contains(target) &&
        notificationButton &&
        !notificationButton.contains(target)
      ) {
        closeNotifications();
      }
    });

    document.addEventListener("submit", function (event) {
      if (event.target.id === "authForm") {
        handleAuthSubmit(event);
      } else if (event.target.id === "predictForm") {
        handlePredictSubmit(event);
      } else if (event.target.id === "profileForm") {
        handleProfileSubmit(event);
      } else if (event.target.id === "globalSearch") {
        event.preventDefault();
        runGlobalSearch();
      }
    });

    document.addEventListener("input", function (event) {
      if (event.target.id === "historySearch") {
        APP.ui.historyQuery = event.target.value;
        const global = $("#searchInput");
        if (global) global.value = event.target.value;
        window.clearTimeout(bindEvents.historyTimer);
        bindEvents.historyTimer = window.setTimeout(refreshHistoryTable, 140);
      }
    });

    document.addEventListener("change", function (event) {
      if (event.target.id === "historyFilter") {
        APP.ui.historyFilter = event.target.value;
        refreshHistoryTable();
      } else if (event.target.id === "modelSelect") {
        updatePredictModel(event.target.value);
        if (APP.ui.result && APP.ui.result.model_name !== modelName(event.target.value)) {
          toast("Model changed. Run the prediction again to score with this classifier.");
        }
      }
    });

    document.addEventListener("keydown", function (event) {
      const tag = document.activeElement ? document.activeElement.tagName : "";
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (event.key === "/" && !typing) {
        const input = $("#searchInput");
        if (input && input.offsetParent !== null) {
          event.preventDefault();
          input.focus();
          input.select();
        }
      }
      if (event.key === "Escape") {
        closeNotifications();
        closeDrawer();
      }
    });

    window.addEventListener("hashchange", onRouteChange);

    const menuButton = $("#menuButton");
    if (menuButton) {
      menuButton.addEventListener("click", function () {
        const sidebar = $("#sidebar");
        if (sidebar && sidebar.classList.contains("open")) closeDrawer();
        else openDrawer();
      });
    }

    const scrim = $("#sidebarScrim");
    if (scrim) scrim.addEventListener("click", closeDrawer);

    const notificationButton = $("#notificationButton");
    if (notificationButton) notificationButton.addEventListener("click", toggleNotifications);

    const notificationClose = $("#notificationClose");
    if (notificationClose) notificationClose.addEventListener("click", closeNotifications);

    const topUser = $("#topUser");
    if (topUser) {
      topUser.addEventListener("click", function () {
        navigate("profile");
      });
    }

    const passwordToggle = $("#passwordToggle");
    if (passwordToggle) passwordToggle.addEventListener("click", togglePassword);

    const authSwitch = $("#authSwitch");
    if (authSwitch) {
      authSwitch.addEventListener("click", function () {
        setAuthMode(APP.ui.authMode === "signup" ? "signin" : "signup");
        const email = $("#authEmail");
        if (email) email.focus();
      });
    }

    const demoLoginButton = $("#demoLogin");
    if (demoLoginButton) demoLoginButton.addEventListener("click", demoLogin);

    const forgotButton = $("#forgotButton");
    if (forgotButton) {
      forgotButton.addEventListener("click", function () {
        toast("Demo accounts are stored in this browser. Use the demo button or create a new account.");
      });
    }
  }

  function runGlobalSearch() {
    const input = $("#searchInput");
    APP.ui.historyQuery = input ? input.value : "";
    if (APP.route === "history") {
      renderRoute();
      const local = $("#historySearch");
      if (local) local.value = APP.ui.historyQuery;
    } else {
      navigate("history");
    }
  }

  /* ======================================================================
     Boot
     ====================================================================== */
  async function loadData() {
    const files = ["data/dataset.json", "data/models.json", "data/training.json"];
    const responses = await Promise.all(
      files.map(function (file) {
        return fetch(file, { cache: "no-cache" });
      })
    );
    if (responses.some(function (response) { return !response.ok; })) {
      throw new Error("Published data files could not be loaded.");
    }
    const payloads = await Promise.all(
      responses.map(function (response) {
        return response.json();
      })
    );
    APP.data.dataset = payloads[0];
    APP.data.models = payloads[1];
    APP.data.training = payloads[2];
  }

  async function boot() {
    try {
      await loadData();
      APP.ui.selectedModel =
        APP.data.models.best_model.key || APP.data.models.model_order[0];
      await ensureDemoAccount();
      APP.ui.ready = true;

      const session = readSession();
      if (session) {
        const account = findAccount(session.email);
        if (account) {
          APP.user = account;
          enterApp();
          return;
        }
        clearSession();
      }
      showAuth("signin");
    } catch (error) {
      APP.ui.ready = true;
      $("#authScreen").hidden = false;
      $("#appShell").hidden = true;
      authMessage(
        "The published dataset and model artifacts could not be loaded. " +
        "Check your connection and refresh the page."
      );
      toast("Workspace data unavailable.", "error");
    }
  }

  bindEvents();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
