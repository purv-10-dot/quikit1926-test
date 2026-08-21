// Upwork side panel bootstrap.
//
// AUTH: identical architecture to the QuikCRM LinkedIn extension —
//   chrome.identity.launchWebAuthFlow → GET {API_BASE_URL}/api/extension-auth/start
//     ?provider=google|microsoft&return=<chromiumapp url>
//   → provider consent → /api/extension-auth/callback (server-side code exchange,
//     existing-QuikCRM-user gate, mints a NextAuth-compatible JWT)
//   → redirect back to https://<extension-id>.chromiumapp.org/#token=...&email=...
//
// The old QuikFetch auth (email/password against backend.quikit.ai, go.quikit.ai
// OAuth callbacks, generate-org-token) has been removed entirely. No new auth
// system is introduced here; this reuses the same backend endpoints and the same
// storage keys the LinkedIn extension uses.
//
// Storage contract:
//   authToken            — the QuikCRM JWT (canonical; read by api.js/apiFetch)
//   token                — same value, mirrored for the existing upwork.js fetches,
//                          which read chrome.storage.local.token. Scraping logic is
//                          untouched by this change.
//   userEmail            — signed-in email
//   selectedOrganization — { id, name } of the active org
//
// UNCHANGED from the previous version: siteScriptMap / replacePopupScript /
// loadHTML / detectAndLoadScript / changeScript and the toast helpers.

document.addEventListener("DOMContentLoaded", function () {
  const STORAGE_KEY_TOKEN = "authToken";
  const STORAGE_KEY_LEGACY_TOKEN = "token";
  const STORAGE_KEY_EMAIL = "userEmail";
  const STORAGE_KEY_ORG = "selectedOrganization";

  const fetchSection = document.getElementById("fetchsection");
  const logInCard = document.getElementById("log");
  const output = document.getElementById("output");
  const logOutButton = document.getElementById("logOut");
  const errorImage = document.getElementById("errorImage");
  const orgContainer = document.getElementById("orgContainer");

  // Every org the signed-in user can act in, from /api/extension-auth/organizations.
  let availableOrgs = [];
  let currentOrg = null;

  // ---- storage helpers ---------------------------------------------------

  function getStoredAuthToken() {
    return new Promise(function (resolve) {
      chrome.storage.local.get([STORAGE_KEY_TOKEN], function (result) {
        resolve(result[STORAGE_KEY_TOKEN] || null);
      });
    });
  }

  function getStoredOrg() {
    return new Promise(function (resolve) {
      chrome.storage.local.get([STORAGE_KEY_ORG], function (result) {
        resolve(result[STORAGE_KEY_ORG] || null);
      });
    });
  }

  function storeOrg(org) {
    currentOrg = org;
    return new Promise(function (resolve) {
      chrome.storage.local.set({ [STORAGE_KEY_ORG]: org }, resolve);
    });
  }

  // ---- view switching ----------------------------------------------------

  function show(el) {
    if (!el) return;
    el.classList.remove("hidden");
    el.classList.add("block");
  }

  function hide(el) {
    if (!el) return;
    el.classList.add("hidden");
    el.classList.remove("block");
  }

  function showLoginView() {
    show(logInCard);
    hide(orgContainer);
    hide(errorImage);
    if (logOutButton) logOutButton.style.display = "none";
    const htmlContainer = document.getElementById("htmlContainer");
    if (htmlContainer) {
      htmlContainer.innerHTML = "";
      htmlContainer.classList.add("hidden");
    }
  }

  function showOrgView() {
    hide(logInCard);
    hide(errorImage);
    if (orgContainer) {
      orgContainer.classList.remove("hidden");
      orgContainer.classList.add("flex");
    }
  }

  function hideOrgView() {
    if (orgContainer) {
      orgContainer.classList.add("hidden");
      orgContainer.classList.remove("flex");
    }
  }

  function showLoginError(message) {
    const el = document.getElementById("loginErrorMessage");
    if (el) {
      el.textContent = message;
      el.classList.remove("hidden");
    }
  }

  function hideLoginError() {
    const el = document.getElementById("loginErrorMessage");
    if (el) el.classList.add("hidden");
  }

  function showOrgError(message) {
    const el = document.getElementById("orgError");
    if (el) {
      el.textContent = message;
      el.classList.remove("hidden");
    }
  }

  function hideOrgError() {
    const el = document.getElementById("orgError");
    if (el) el.classList.add("hidden");
  }

  // ---- OAuth (same flow as the LinkedIn extension) -----------------------

  function setOAuthButtonsDisabled(disabled) {
    ["googleSignInButton", "microsoftLogin"].forEach(function (id) {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = disabled;
    });
  }

  // Launch the provider OAuth flow via chrome.identity. The QuikCRM backend
  // (/api/extension-auth/*) runs the code exchange, enforces the
  // existing-QuikCRM-user gate, and redirects back to this extension's
  // chromiumapp.org URL with the token (or ?error) in the fragment.
  function startOAuth(provider) {
    hideLoginError();
    setOAuthButtonsDisabled(true);

    const baseUrl =
      typeof window !== "undefined" && window.API_BASE_URL
        ? window.API_BASE_URL
        : "http://localhost:3008";
    const returnUrl = chrome.identity.getRedirectURL(); // https://<id>.chromiumapp.org/
    const authUrl =
      baseUrl +
      "/api/extension-auth/start" +
      "?provider=" +
      encodeURIComponent(provider) +
      "&return=" +
      encodeURIComponent(returnUrl);

    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      function (redirectUrl) {
        setOAuthButtonsDisabled(false);

        if (chrome.runtime.lastError || !redirectUrl) {
          // User closed the window or the flow was interrupted.
          showLoginError("Login was cancelled. Please try again.");
          return;
        }

        let params;
        try {
          params = new URLSearchParams(new URL(redirectUrl).hash.slice(1));
        } catch (e) {
          showLoginError("Login failed. Please try again.");
          return;
        }

        const err = params.get("error");
        if (err === "not_authorized") {
          showLoginError(
            "You are not an authorized QuikCRM user. Please contact your administrator."
          );
          return;
        }
        if (err) {
          showLoginError("Login failed. Please try again.");
          return;
        }

        const token = params.get("token");
        if (!token) {
          showLoginError("Login failed. Please try again.");
          return;
        }

        // Write both keys: `authToken` is what api.js/apiFetch reads, `token` is
        // what the untouched upwork.js scraping fetches read.
        chrome.storage.local.set(
          {
            [STORAGE_KEY_TOKEN]: token,
            [STORAGE_KEY_LEGACY_TOKEN]: token,
            [STORAGE_KEY_EMAIL]: params.get("email") || "",
          },
          function () {
            if (chrome.runtime.lastError) {
              console.error("Storage Error:", chrome.runtime.lastError.message);
              showLoginError("Failed to save login data.");
              return;
            }
            sucessmsg("Login Successful!");
            enterAuthenticated();
          }
        );
      }
    );
  }

  const googleButton = document.getElementById("googleSignInButton");
  if (googleButton) {
    googleButton.addEventListener("click", function () {
      startOAuth("google");
    });
  }

  const microsoftButton = document.getElementById("microsoftLogin");
  if (microsoftButton) {
    microsoftButton.addEventListener("click", function () {
      startOAuth("microsoft");
    });
  }

  // ---- logout ------------------------------------------------------------

  function handleLogout() {
    chrome.storage.local.remove(
      [
        STORAGE_KEY_TOKEN,
        STORAGE_KEY_LEGACY_TOKEN,
        STORAGE_KEY_EMAIL,
        STORAGE_KEY_ORG,
      ],
      function () {
        currentOrg = null;
        availableOrgs = [];
        hideLoginError();
        hideOrgError();
        hideOrgView();
        showLoginView();
        chrome.runtime.sendMessage("closeSidePanel");
      }
    );
  }

  if (logOutButton) {
    logOutButton.addEventListener("click", handleLogout);
  }

  // ---- organization flow -------------------------------------------------

  async function loadOrganizations() {
    const response = await window.apiFetch("/api/extension-auth/organizations");
    const data = await response.json();
    if (!response.ok || !data || data.success === false) {
      throw new Error((data && data.error) || "Failed to load organizations");
    }
    availableOrgs = (data.data && data.data.organizations) || [];
    return availableOrgs;
  }

  function renderOrgOptions(organizations) {
    hideOrgError();
    const orgSelect = document.getElementById("orgSelect");
    const continueBtn = document.getElementById("orgContinueBtn");
    if (!orgSelect) return;

    orgSelect.innerHTML = '<option value="">Select Organization</option>';
    organizations.forEach(function (org) {
      const option = document.createElement("option");
      option.value = org.id;
      option.textContent = org.name || "Unnamed organization";
      orgSelect.appendChild(option);
    });

    if (continueBtn) continueBtn.disabled = true;

    // Wire once — the select/button are static markup, so a re-render must not
    // stack duplicate listeners.
    if (!orgSelect.dataset.wired) {
      orgSelect.addEventListener("change", function () {
        if (continueBtn) continueBtn.disabled = !orgSelect.value;
      });
      orgSelect.dataset.wired = "1";
    }
    if (continueBtn && !continueBtn.dataset.wired) {
      continueBtn.addEventListener("click", function () {
        const org = availableOrgs.find(function (o) {
          return o.id === orgSelect.value;
        });
        if (!org) return;
        storeOrg(org).then(function () {
          hideOrgView();
          enterUpworkPanel();
        });
      });
      continueBtn.dataset.wired = "1";
    }
  }

  // Entry point after authentication: resolve which organization to use, then
  // open the Upwork panel. Shows the selector only when the user has >1 org and
  // hasn't already got a valid remembered selection.
  async function enterAuthenticated() {
    hide(logInCard);
    if (logOutButton) logOutButton.style.display = "";

    let organizations;
    try {
      organizations = await loadOrganizations();
    } catch (err) {
      console.error("Failed to load organizations:", err);
      showOrgView();
      showOrgError("Could not load your organizations. Please try again.");
      return;
    }

    if (!organizations || organizations.length === 0) {
      showOrgView();
      showOrgError(
        "You do not have access to any organization. Please contact your administrator."
      );
      return;
    }

    if (organizations.length === 1) {
      await storeOrg(organizations[0]);
      hideOrgView();
      enterUpworkPanel();
      return;
    }

    // Multiple orgs — reuse a still-valid remembered selection if present.
    const stored = await getStoredOrg();
    const remembered =
      stored &&
      organizations.find(function (o) {
        return o.id === stored.id;
      });
    if (remembered) {
      await storeOrg(remembered); // refresh name in case it changed
      hideOrgView();
      enterUpworkPanel();
      return;
    }

    renderOrgOptions(organizations);
    showOrgView();
  }

  function enterUpworkPanel() {
    updateUIAfterLogin();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTabUrl = tabs[0]?.url;
      if (!currentTabUrl) {
        console.error("No active tab URL found.");
        return;
      }
      const siteName = new URL(currentTabUrl).hostname.replace(/^www\./, "");
      replacePopupScript(siteName);
    });
  }

  // ---- boot --------------------------------------------------------------

  (async function onPanelLoad() {
    const token = await getStoredAuthToken();
    if (token) {
      // Keep the legacy mirror in sync for panels that were authenticated
      // before this key existed.
      chrome.storage.local.set({ [STORAGE_KEY_LEGACY_TOKEN]: token });
      enterAuthenticated();
    } else {
      showLoginView();
    }
  })();

  // ---- site/script loader (UNCHANGED) ------------------------------------

  const siteScriptMap = {
    "upwork.com": { html: "upwork.html" },
    "upwork.in": { html: "upwork.html" },
    "https://www.upwork.com/nx/find-work/best-matches": { html: "upwork.html" }
  };

  function replacePopupScript(siteName) {
    chrome.storage.local.get(STORAGE_KEY_TOKEN, (result) => {
      if (!result[STORAGE_KEY_TOKEN]) {
        errorImage.classList.add("hidden");
        errorImage.classList.remove("block");
        return;
      }

      const siteConfig = siteScriptMap[siteName];
      if (!siteConfig) {
        errorImage.classList.add("block");
        errorImage.classList.remove("hidden");

        document.getElementById("backButton").addEventListener("click", () => {
          chrome.runtime.sendMessage("closeSidePanel");
        });
        return;
      }

      const { html } = siteConfig;
      loadHTML(html);
      detectAndLoadScript();
    });
  }

  function loadHTML(htmlFileName) {
    fetch(chrome.runtime.getURL(htmlFileName))
      .then((response) => response.text())
      .then((htmlContent) => {
        const htmlContainer = document.getElementById("htmlContainer");
        if (htmlContainer) {
          htmlContainer.innerHTML = htmlContent;
          htmlContainer.classList.remove("hidden");
          // UI only: the panel's header has a slot for the Logout control, so
          // MOVE the existing #logOut node into it rather than rendering a
          // second one. Moving preserves both the `logOutButton` reference
          // captured at DOMContentLoaded and its already-bound click handler —
          // logout behaviour is untouched.
          const slot = document.getElementById("logoutSlot");
          if (slot && logOutButton) slot.appendChild(logOutButton);
        }
      })
      .catch((error) => console.error("Error loading HTML:", error));
  }

  function detectAndLoadScript() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      const activeTabUrl = tabs[0].url;
      if (activeTabUrl.includes("upwork.com")) {
        changeScript("upwork.js");
      } else {
        console.log("No matching URL found, keeping the default script.");
      }
    });
  }

  function changeScript(scriptFile) {
    const scriptTag = document.getElementById("dynamicScript");
    if (scriptTag) {
      scriptTag.remove();
    }
    const newScript = document.createElement("script");
    newScript.src = scriptFile;
    newScript.id = "dynamicScript";
    document.body.appendChild(newScript);
  }

  function updateUIAfterLogin() {
    if (fetchSection) fetchSection.style.display = "";
    hide(logInCard);
    if (output) output.style.display = "";
    if (logOutButton) logOutButton.style.display = "";
  }

  // ---- toasts (UNCHANGED) ------------------------------------------------

  function showToast(toastId, message, bgColorClass) {
    const toast = document.getElementById(toastId);
    if (toast) {
      toast.innerText = message;

      // Apply the dynamic classes: "hidden" (initially) and "flex" (visible)
      toast.classList.remove("hidden");
      toast.classList.add("flex", bgColorClass);

      // Add custom styles for positioning and appearance
      toast.classList.add(
        "fixed",
        "bottom-8",
        "left-1/2",
        "transform",
        "-translate-x-1/2",
        "text-white",
        "text-sm",
        "font-medium",
        "py-2",
        "px-4",
        "rounded",
        "shadow-md"
      );

      // Hide the toast after 1 second
      setTimeout(() => {
        toast.classList.add("hidden");
        toast.classList.remove("flex", bgColorClass); // Remove the bgColorClass dynamically
      }, 1000);
    }
  }

  function errormsg(msg) {
    showToast("errortoaster", msg, "bg-red-500");
  }

  function sucessmsg(data) {
    showToast("sucesstoaster", data, "bg-green-500");
  }
});
