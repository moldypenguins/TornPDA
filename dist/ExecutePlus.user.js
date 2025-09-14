// ==UserScript==
// @name         TornPDA - Execute+
// @namespace    TornPDA.ExecutePlus
// @version      0.4
// @license      MIT
// @description  Shows execute limit in health bar.
// @author       moldypenguins [2881784]
// @match        https://www.torn.com/loader.php?sid=attack*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @updateURL    https://github.com/moldypenguins/TornPDA/raw/main/ExecutePlus.user.js
// @downloadURL  https://github.com/moldypenguins/TornPDA/raw/main/ExecutePlus.user.js
// @run-at       document-end
// ==/UserScript==

(async () => {
  'use strict';

  // Aliases for window primitives.
  const d = w.document;
  const l = w.location;
  const n = w.navigator;

  // Abort early if essentials are not present.
  if (!d || !l || !n) return;

  // TornPDA integration stub.
  const PDA_KEY = '###PDA-APIKEY###';
  const IS_PDA = !PDA_KEY.includes('###') && typeof w.flutter_inappwebview !== 'undefined' && typeof w.flutter_inappwebview.callHandler === 'function';

  /* ------------------------------------------------------------------------
  * Common Constants
  * --------------------------------------------------------------------- */
  const DEBUG_MODE = true; // Turn on to log to console.
  const DEFERRAL_LIMIT = 250; // Maximum amount of times the script will defer.
  const DEFERRAL_INTERVAL = 100; // Amount of time in milliseconds deferrals will last.

  /* ------------------------------------------------------------------------
   * Common Utilities
   * --------------------------------------------------------------------- */

  /**
   * setClipboard - Copies text to the clipboard if document is focused.
   * (Kept global on window for convenience across script)
   * @param {string} text
   * @returns {boolean} true if a write operation was attempted without throwing.
   */
  w.setClipboard = (text) => {
    if (!d.hasFocus()) {
      throw new DOMException('Document is not focused');
    }
    try {
      // Optional chaining on call is supported in modern engines.
      // Will no-op silently if Clipboard API is unavailable.
      n.clipboard?.writeText?.(text);
      return true;
    } catch {
      return false;
    }
  };

  /**
   * Returns the current Unix timestamp (seconds since epoch).
   * @returns {number}
   */
  w.getUnixTimestamp = () => {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * Wait for a single element matching selector to appear.
   * Times out after DEFERRAL_LIMIT * DEFERRAL_INTERVAL ms.
   * @param {string} selector
   * @returns {Promise<Element>}
   */
  function defer(selector) {
    let count = 0;
    return new Promise((resolve, reject) => {
      const check = () => {
        count++;
        if (count > DEFERRAL_LIMIT) {
          reject(new Error('Deferral timed out.'));
          return;
        }
        const result = d.querySelector(selector);
        if (result) {
          resolve(result);
        } else {
          if (DEBUG_MODE) console.log(`[Racing+]: '${selector}' - Deferring...`);
          setTimeout(check, DEFERRAL_INTERVAL);
        }
      };
      check();
    });
  }

  /**
   * Wait for all elements matching selector to appear.
   * @param {string} selector
   * @returns {Promise<NodeListOf<Element>>}
   */
  function deferAll(selector) {
    let count = 0;
    return new Promise((resolve, reject) => {
      const check = () => {
        if (count > DEFERRAL_LIMIT) {
          reject(new Error('Deferral timed out.'));
          return;
        }
        const result = d.querySelectorAll(selector);
        if (result && result.length > 0) {
          resolve(result);
        } else {
          if (DEBUG_MODE) console.log(`[Racing+]: '${selector}' - Deferring...`);
          count++;
          setTimeout(check, DEFERRAL_INTERVAL);
        }
      };
      check();
    });
  }

  /* ------------------------------------------------------------------------
   * localStorage wrapper
   * --------------------------------------------------------------------- */
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
        rplus_addlinks: 'RACINGPLUS_ADDPROFILELINKS',
        rplus_showskill: 'RACINGPLUS_SHOWRACINGSKILL',
        rplus_showspeed: 'RACINGPLUS_SHOWCARSPEED',
        rplus_showracelink: 'RACINGPLUS_SHOWRACELINK',
        rplus_showexportlink: 'RACINGPLUS_SHOWEXPORTLINK',
        rplus_showwinrate: 'RACINGPLUS_SHOWCARWINRATE',
        rplus_showparts: 'RACINGPLUS_SHOWCARPARTS',
      }[id];
    },
  };



  const EXECUTE_LEVEL = 15;
  const PDA = {
    addStyle: (style) => {
      if (!style) {
        return;
      }
      const s = document.createElement('style');
      s.innerHTML = style;
      document.head.appendChild(s);
    },
  };
  const checkExecute = async (progress) => {
    if (DEBUG_MODE) {
      console.log('Execute+: Checking HealthBar...');
    }
    if (!progress) {
      console.log('Execute+ Error: Invalid progress.');
      return;
    }
    //let progress = healthBar.querySelector('[aria-label^="Progress:"]');
    let targetHealth = parseFloat(progress.ariaLabel.replace(/Progress: (\d{1,3}\.?\d{0,2})%/, '$1'));
    if (targetHealth <= EXECUTE_LEVEL) {
      progress.classList.toggle('execute', true);
    } else {
      progress.classList.toggle('execute', false);
    }
  };

  let userdata = JSON.parse((await defer('#torn-user')).value);
  let healthBar = await defer(`div[class^="playersModelWrap_"] div[class^="header_"]:not([aria-describedby^="player-name_${userdata.playername}"])`);
  if (healthBar) {
    // Watch healthBar for changes
    if (DEBUG_MODE) {
      console.log('Execute+: Adding HealthBar Observer...');
    }
    let healthBarObserver = new MutationObserver(async (mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'aria-label' && mutation.target.ariaLabel && mutation.target.ariaLabel.startsWith('Progress:')) {
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
  PDA.addStyle(`
    .execute {
      background-image: linear-gradient(#FFB46C,#FFA737) !important;
    }
  `);
})();
