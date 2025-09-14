// Common.js  (shared utilities for TornPDA userscripts)
(function (w) {
  "use strict";

  // Abort early if essentials are not present.
  if (!w.document || !w.location || !w.navigator) return;

  // Create/extend a single shared namespace
  const TornPDA =
    w.TornPDA ||
    (w.TornPDA = {
      Common: {
        /* TornPDA Integration Stub */
        PDA_KEY: "###PDA-APIKEY###",
        IS_PDA:
          !this.Common.PDA_KEY.includes("###") && typeof w.flutter_inappwebview !== "undefined" && typeof w.flutter_inappwebview.callHandler === "function",

        /* Common Constants */
        DEBUG_MODE: true, // Turn on to log to console.
        DEFERRAL_LIMIT: 250, // Maximum amount of times the script will defer.
        DEFERRAL_INTERVAL: 100, // Amount of time in milliseconds deferrals will last.

        /* Common Utilities */
        /**
         * setClipboard - Copies text to the clipboard if document is focused.
         * (Kept global on window for convenience across script)
         * @param {string} text
         * @returns {boolean} true if a write operation was attempted without throwing.
         */
        setClipboard: (text) => {
          if (!w.document.hasFocus()) {
            throw new DOMException("Document is not focused");
          }
          try {
            // Optional chaining on call is supported in modern engines.
            // Will no-op silently if Clipboard API is unavailable.
            w.navigator.clipboard?.writeText?.(text);
            return true;
          } catch {
            return false;
          }
        },

        /**
         * Returns the current Unix timestamp (seconds since epoch).
         * @returns {number}
         */
        getUnixTimestamp: () => {
          return Math.floor(Date.now() / 1000);
        },

        /**
         * Wait for a single element matching selector to appear.
         * Times out after DEFERRAL_LIMIT * DEFERRAL_INTERVAL ms.
         * @param {string} selector
         * @returns {Promise<Element>}
         */
        defer: (selector) => {
          let count = 0;
          return new Promise((resolve, reject) => {
            const check = () => {
              count++;
              if (count > w.TornPDA.Common.DEFERRAL_LIMIT) {
                reject(new Error("Deferral timed out."));
                return;
              }
              const result = w.document.querySelector(selector);
              if (result) {
                resolve(result);
              } else {
                if (w.TornPDA.Common.DEBUG_MODE) {
                  console.log(`[Racing+]: '${selector}' - Deferring...`);
                }
                setTimeout(check, w.TornPDA.Common.DEFERRAL_INTERVAL);
              }
            };
            check();
          });
        },

        /**
         * Wait for all elements matching selector to appear.
         * @param {string} selector
         * @returns {Promise<NodeListOf<Element>>}
         */
        deferAll: (selector) => {
          let count = 0;
          return new Promise((resolve, reject) => {
            const check = () => {
              if (count > w.TornPDA.Common.DEFERRAL_LIMIT) {
                reject(new Error("Deferral timed out."));
                return;
              }
              const result = w.document.querySelectorAll(selector);
              if (result && result.length > 0) {
                resolve(result);
              } else {
                if (w.TornPDA.Common.DEBUG_MODE) {
                  console.log(`[Racing+]: '${selector}' - Deferring...`);
                }
                count++;
                setTimeout(check, w.TornPDA.Common.DEFERRAL_INTERVAL);
              }
            };
            check();
          });
        },

        /* LocalStorage Wrapper */
        STORE: {
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
              rplus_addlinks: "RACINGPLUS_ADDPROFILELINKS",
              rplus_showskill: "RACINGPLUS_SHOWRACINGSKILL",
              rplus_showspeed: "RACINGPLUS_SHOWCARSPEED",
              rplus_showracelink: "RACINGPLUS_SHOWRACELINK",
              rplus_showexportlink: "RACINGPLUS_SHOWEXPORTLINK",
              rplus_showwinrate: "RACINGPLUS_SHOWCARWINRATE",
              rplus_showparts: "RACINGPLUS_SHOWCARPARTS",
            }[id];
          },
        },
      },
    });
})(window);
