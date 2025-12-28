// ==UserScript==
// @name         TornPDA - Execute+
// @namespace    TornPDA.ExecutePlus
// @version      0.99.0
// @license      MIT
// @description  Shows execute limit in health bar.
// @author       moldypenguins [2881784]
// @match        https://www.torn.com/loader.php?sid=attack*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @updateURL    https://raw.githubusercontent.com/moldypenguins/TornPDA/refs/heads/main/dist/ExecutePlus.user.js
// @downloadURL  https://raw.githubusercontent.com/moldypenguins/TornPDA/refs/heads/main/dist/ExecutePlus.user.js
// @run-at       document-end
// ==/UserScript==

(async (w) => {
  ("use strict");

  // Abort early if essentials are not present.
  if (!w.document || !w.location || !w.navigator) return;

  /* Common Constants */
  const DEBUG_MODE = true; // Turn on to log to console.
  const DEFERRAL_LIMIT = 250; // Maximum amount of times the script will defer.
  const DEFERRAL_INTERVAL = 100; // Amount of time in milliseconds deferrals will last.

  /* Common Utilities */
  /**
   * Returns the current Unix timestamp (seconds since epoch).
   * @returns {number}
   */
  const unixTimestamp = () => Math.floor(Date.now() / 1000);

  /**
   * Wait for a single element matching selector to appear.
   * Times out after DEFERRAL_LIMIT * DEFERRAL_INTERVAL ms.
   * @param {string} selector
   * @returns {Promise<Element>}
   */
  const defer = (selector) => {
    let count = 0;
    return new Promise((resolve, reject) => {
      const check = () => {
        count++;
        if (count > DEFERRAL_LIMIT) {
          reject(new Error("Deferral timed out."));
          return;
        }
        const result = w.document.querySelector(selector);
        if (result) {
          resolve(result);
        } else {
          if (DEBUG_MODE) console.log(`[TornPDA+]: '${selector}' - Deferring...`);
          setTimeout(check, DEFERRAL_INTERVAL);
        }
      };
      check();
    });
  };

  /* LocalStorage Wrapper */
  const STORE = {
    /** Get a value by key (string or null). */
    getValue: (key) => localStorage.getItem(key),

    /** Set a value by key (string). */
    setValue: (key, value) => localStorage.setItem(key, value),

    /** Delete a value by key. */
    deleteValue: (key) => localStorage.removeItem(key),

    /** List stored values (strings). Mainly for debugging. */
    listValues() {
      return Object.values(localStorage);
    },

    /** Map logical toggle IDs to persistent keys. */
    getKey(id) {
      return {
        eplus_level: "EXECUTEPLUS_LEVEL",
      }[id];
    },
  };

  if (DEBUG_MODE) console.log(`[TornPDA+]: Common loaded.`);

  if (w.execute_plus) return;
  w.execute_plus = unixTimestamp();

  const EXECUTE_LEVEL = 15;

  const checkExecute = async (progress) => {
    if (DEBUG_MODE) {
      console.log("[Execute+]: Checking HealthBar...");
    }
    if (!progress) {
      console.log("[Execute+]: Error - Invalid progress.");
      return;
    }
    //let progress = healthBar.querySelector('[aria-label^="Progress:"]');
    let targetHealth = parseFloat(progress.ariaLabel.replace(/Progress: (\d{1,3}\.?\d{0,2})%/, "$1"));
    if (targetHealth <= EXECUTE_LEVEL) {
      progress.classList.toggle("execute", true);
    } else {
      progress.classList.toggle("execute", false);
    }
  };

  let user = await defer("#torn-user");
  let userdata = JSON.parse(user.value);

  let healthBar = await defer(`div[class^="playersModelWrap_"] div[class^="header_"]:not([aria-describedby^="player-name_${userdata.playername}"])`);
  if (healthBar) {
    // Watch healthBar for changes
    if (DEBUG_MODE) {
      console.log("[Execute+]: Adding HealthBar Observer...");
    }
    let healthBarObserver = new MutationObserver(async (mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "aria-label" &&
          mutation.target.ariaLabel &&
          mutation.target.ariaLabel.startsWith("Progress:")
        ) {
          await checkExecute(mutation.target);
        }
      }
    });
    healthBarObserver.observe(healthBar.parentElement, {
      subtree: true,
      attributes: true,
    });
    await checkExecute(healthBar.querySelector('[aria-label^="Progress:"]'));
  }

  if (DEBUG_MODE) console.log("[Execute+]: Adding styles...");
  if (!w.document.head) await new Promise((r) => w.addEventListener("DOMContentLoaded", r, { once: true }));
  const s = w.document.createElement("style");
  s.innerHTML = `__MINIFIED_CSS__`;
  w.document.head.appendChild(s);
  if (DEBUG_MODE) console.log("[Execute+]: Styles added.");
})();
