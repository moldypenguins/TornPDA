// ==UserScript==
// @name         TornPDA.Fatality+
// @namespace    TornPDA.FatalityPlus
// @version      0.99.1-alpha
// @license      MIT
// @description  Shows execute limit in health bar.
// @author       moldypenguins [2881784]
// @match        https://www.torn.com/loader.php?sid=attack*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @updateURL    https://raw.githubusercontent.com/moldypenguins/TornPDA/refs/heads/main/dist/FatalityPlus.user.js
// @downloadURL  https://raw.githubusercontent.com/moldypenguins/TornPDA/refs/heads/main/dist/FatalityPlus.user.js
// @run-at       document-end
// ==/UserScript==
"use strict";

/* ------------------------------------------------------------------------
 * Constants
 * --------------------------------------------------------------------- */
/* Application start time. */
const APP_START = Date.now();

/* Number of milliseconds in 1 second. */
const MS_PER_SECOND = 1000;
/* Number of milliseconds in 1 minute. */
const MS_PER_MINUTE = 60000;
/* Number of milliseconds in 1 hour. */
const MS_PER_HOUR = 3600000;
/* Number of seconds in 1 hour. */
const SECONDS_PER_HOUR = 3600;

/* Common Constants */
const DEBUG_MODE = true; // Turn on to log to console.
const DEFERRAL_LIMIT = 250; // Maximum amount of times the script will defer.
const DEFERRAL_INTERVAL = 100; // Amount of time in milliseconds deferrals will last.

/* ------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------- */
/**
 * unixTimestamp
 * Description: Returns the current Unix timestamp (seconds since epoch).
 * @returns {number} Current Unix timestamp (seconds)
 */
const unixTimestamp = () => Math.floor(Date.now() / 1000);

/**
 * isNumber
 * Description: Returns true for number primitives that are finite (excludes NaN and ±Infinity).
 * @param {unknown} n - Value to test.
 * @returns {boolean} True if n is a finite number primitive.
 */
const isNumber = (n) => typeof n === "number" && Number.isFinite(n);

/**
 * Format helper
 * @class
 */
class Format {
  /**
   * Formats a timestamp as "YYYY-MM-DD" in local time.
   * @param {number} ms - Timestamp in milliseconds since epoch.
   * @returns {string} Formatted date string ("YYYY-MM-DD")
   */
  static date = (timestamp) => {
    const dt = new Date(timestamp);
    return `${String(dt.getFullYear())}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  };

  /**
   * Formats a timestamp as "MM:SS.mmm".
   * @param {number} ms - Duration in milliseconds.
   * @returns {string} Formatted time string ("MM:SS.mmm")
   */
  static time = (timestamp) => {
    const dt = new Date(timestamp);
    return `${String(dt.getMinutes()).padStart(2, "0")}:${String(dt.getSeconds()).padStart(2, "0")}.${String(dt.getMilliseconds()).padStart(3, "0")}`;
  };

  /**
   * Formats a duration (ms) as "MM:SS.mmm".
   * @param {number} ms - Duration in milliseconds.
   * @returns {string} Formatted time string ("MM:SS.mmm")
   */
  static duration = (duration) => {
    return `${String(Math.floor((duration % MS_PER_HOUR) / MS_PER_MINUTE)).padStart(2, "0")}:${String(Math.floor((duration % MS_PER_MINUTE) / MS_PER_SECOND)).padStart(2, "0")}.${String(Math.floor(duration % MS_PER_SECOND)).padStart(3, "0")}`;
  };

  /**
   * Returns a human-readable error string (name + message).
   * @returns {string}
   */
  static error = (error) => {
    return `${error?.name ? String(error.name) : "Error"}: ${error?.message ? String(error.message) : error}`;
  };
}

/* ------------------------------------------------------------------------
 * Logger
 * --------------------------------------------------------------------- */
/**
 * LOG_LEVEL - Log level enumeration
 * @readonly
 * @enum {number}
 */
const LOG_LEVEL = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40, silent: 50 });

/**
 * LOG_MODE - Log level threshold LOG_LEVEL[debug|info|warn|error|silent]
 * @type {number}
 */
const LOG_MODE = LOG_LEVEL.debug;

/**
 * Static methods for leveled console logging.
 * @class
 */
class Logger {
  /** logs a debug-level message. */
  static debug(message, time = null) {
    if (LOG_MODE > LOG_LEVEL.debug) return;
    const dt = Date.now();
    console.log("%c[DEBUG][TornPDA.Racing+]: ", "color:#6aa84f;font-weight:600", message, time ? ` ${Format.duration(dt - time)}` : ` ${Format.date(dt)}`);
  }
  /** logs an info-level message. */
  static info(message, time = null) {
    if (LOG_MODE > LOG_LEVEL.info) return;
    const dt = Date.now();
    console.log("%c[INFO][TornPDA.Racing+]: ", "color:#3d85c6;font-weight:600", message, time ? ` ${Format.duration(dt - time)}` : ` ${Format.date(dt)}`);
  }
  /** Logs a warning-level message. */
  static warn(message, time = null) {
    if (LOG_MODE > LOG_LEVEL.warn) return;
    const dt = Date.now();
    console.log("%c[WARN][TornPDA.Racing+]: ", "color:#e69138;font-weight:600", message, time ? ` ${Format.duration(dt - time)}` : ` ${Format.date(dt)}`);
  }
  /** Logs an error-level message. */
  static error(message, time = null) {
    if (LOG_MODE > LOG_LEVEL.error) return;
    const dt = Date.now();
    console.log("%c[ERROR][TornPDA.Racing+]: ", "color:#d93025;font-weight:600", message, time ? ` ${Format.duration(dt - time)}` : ` ${Format.date(dt)}`);
  }
}

/* ------------------------------------------------------------------------
 * Helper Classes
 * --------------------------------------------------------------------- */
/**
 * Store Wrapper classs for localStorage.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
 * @class
 */
class Store {
  /**
   * Get a value by key from localStorage
   * @param {string} key - Storage key
   * @returns {string|null} Stored value or null
   */
  static getValue = (key) => localStorage.getItem(key);

  /**
   * Set a value by key in localStorage
   * @param {string} key - Storage key
   * @param {string} value - Value to store
   */
  static setValue = (key, value) => localStorage.setItem(key, value);

  /**
   * Delete a value by key from localStorage
   * @param {string} key - Storage key
   */
  static deleteValue = (key) => localStorage.removeItem(key);

  /**
   * Clears all keys out of the storage.
   */
  static deleteAll = () => localStorage.clear();

  /**
   * List all stored values (for debugging)
   * @returns {Array<string>} Array of stored values
   */
  static listValues = () => Object.values(localStorage);

  /**
   * Map from toggle/control ids to persistent localStorage keys.
   */
  static keys = Object.freeze({
    fplus_executelevel: "FATALITYPLUS_EXECUTELEVEL",
  });
}

(async (w) => {
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
    /* Watch healthBar for changes */
    if (DEBUG_MODE) console.log("[Execute+]: Adding HealthBar Observer...");
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
