// ==UserScript==
// @name         TornPDA.Racing+
// @namespace    TornPDA.RacingPlus
// @copyright    Copyright © 2025 moldypenguins
// @license      MIT
// @version      1.0.73-alpha
// @description  Show racing skill, current speed, race results, precise skill, upgrade parts.
// @author       moldypenguins [2881784] - Adapted from Lugburz [2386297] + some styles from TheProgrammer [2782979]
// @match        https://www.torn.com/page.php?sid=racing*
// @match        https://www.torn.com/loader.php?sid=racing*
// @icon64       https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @updateURL    https://github.com/moldypenguins/TornPDA/raw/refs/heads/main/dist/RacingPlus.user.js
// @downloadURL  https://github.com/moldypenguins/TornPDA/raw/refs/heads/main/dist/RacingPlus.user.js
// @connect      api.torn.com
// @grant        none
// @run-at       document-start
// ==/UserScript==
"use strict";

/* ------------------------------------------------------------------------
 * Constants
 * --------------------------------------------------------------------- */
/* Number of milliseconds per somethings. */
const MS = Object.freeze({
  second: 1000,
  minute: 60000,
  hour: 3600000,
  day: 86400000,
});

/* ------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------- */
/**
 * Static utility methods for formatting timestamps, durations, and errors.
 * @class
 */
class Format {
  /**
   * Formats a timestamp as "YYYY-MM-DD" in local time.
   * @param {number} timestamp - Timestamp in milliseconds since epoch.
   * @returns {string} Formatted date string ("YYYY-MM-DD")
   */
  static date = (timestamp) => {
    const dt = new Date(timestamp);
    return `${String(dt.getFullYear())}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  };
  /**
   * Formats a timestamp as "MM:SS.mmm".
   * @param {number} timestamp - Timestamp in milliseconds since epoch.
   * @returns {string} Formatted time string ("MM:SS.mmm")
   */
  static time = (timestamp) => {
    const dt = new Date(timestamp);
    return `${String(dt.getMinutes()).padStart(2, "0")}:${String(dt.getSeconds()).padStart(2, "0")}.${String(dt.getMilliseconds()).padStart(3, "0")}`;
  };
  /**
   * Formats a duration as "MM:SS.mmm".
   * @param {number} duration - Duration in milliseconds.
   * @returns {string} Formatted time string ("MM:SS.mmm")
   */
  static duration = (duration) => {
    return `${String(Math.floor((duration % MS.hour) / MS.minute)).padStart(2, "0")}:${String(Math.floor((duration % MS.minute) / MS.second)).padStart(2, "0")}.${String(Math.floor(duration % MS.second)).padStart(3, "0")}`;
  };
  /**
   * Returns a human-readable error string (name + message).
   * @param {Error|object|string} error - Error object or string
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
 * Static methods for leveled console logging with timestamp and color formatting.
 * @class
 */
class Logger {
  /**
   * Logs a debug-level message.
   * @param {string} message - Message to log
   * @param {number|null} time - Optional start timestamp for duration calculation
   */
  static debug(message, time = null) {
    if (LOG_MODE > LOG_LEVEL.debug) return;
    const dt = Date.now();
    console.log("%c[DEBUG][TornPDA.Racing+]: ", "color:#6aa84f;font-weight:600", message, time ? ` ${dt - time}ms` : ` ${Format.date(dt)} ${Format.time(dt)}`);
  }
  /**
   * Logs an info-level message.
   * @param {string} message - Message to log
   * @param {number|null} time - Optional start timestamp for duration calculation
   */
  static info(message, time = null) {
    if (LOG_MODE > LOG_LEVEL.info) return;
    const dt = Date.now();
    console.log("%c[INFO][TornPDA.Racing+]: ", "color:#3d85c6;font-weight:600", message, time ? ` ${dt - time}ms` : ` ${Format.date(dt)} ${Format.time(dt)}`);
  }
  /**
   * Logs a warning-level message.
   * @param {string} message - Message to log
   * @param {number|null} time - Optional start timestamp for duration calculation
   */
  static warn(message, time = null) {
    if (LOG_MODE > LOG_LEVEL.warn) return;
    const dt = Date.now();
    console.log("%c[WARN][TornPDA.Racing+]: ", "color:#e69138;font-weight:600", message, time ? ` ${dt - time}ms` : ` ${Format.date(dt)} ${Format.time(dt)}`);
  }
  /**
   * Logs an error-level message.
   * @param {string} message - Message to log
   * @param {number|null} time - Optional start timestamp for duration calculation
   */
  static error(message, time = null) {
    if (LOG_MODE > LOG_LEVEL.error) return;
    const dt = Date.now();
    console.log("%c[ERROR][TornPDA.Racing+]: ", "color:#d93025;font-weight:600", message, time ? ` ${dt - time}ms` : ` ${Format.date(dt)} ${Format.time(dt)}`);
  }
}

/* ------------------------------------------------------------------------
 * Application start
 * --------------------------------------------------------------------- */
(async (w, s) => {
  /* Check if userscript has already been initialized */
  if (w.racing_plus) return;
  /* Set application start time */
  w.racing_plus = Date.now();

  Logger.info(`Application loading...`);

  /* TornPDA Integration Stub */
  const PDA_KEY = "###PDA-APIKEY###";

  /* IS_PDA is a boolean indicating whether script is running in TornPDA. */
  const IS_PDA = (() => {
    if (typeof w.flutter_inappwebview !== "undefined" && typeof w.flutter_inappwebview.callHandler === "function") {
      try {
        return w.flutter_inappwebview.callHandler("isTornPDA");
      } catch (err) {
        Logger.error(err);
        return;
      }
    }
    return false;
  })();

  /**
   * Wrapper class for localStorage with typed keys and convenience methods.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
   * @class
   */
  class Store {
    /**
     * Get a value by key from localStorage
     * @param {string} key - Storage key
     * @returns {string|null} Stored value or null
     */
    static getValue = (key) => s.getItem(key);

    /**
     * Set a value by key in localStorage
     * @param {string} key - Storage key
     * @param {string} value - Value to store
     */
    static setValue = (key, value) => s.setItem(key, value);

    /**
     * Delete a value by key from localStorage
     * @param {string} key - Storage key
     */
    static deleteValue = (key) => s.removeItem(key);

    /**
     * Clears all keys out of the storage.
     */
    static deleteAll = () => s.clear();

    /**
     * List all stored values (for debugging)
     * @returns {Array<string>} Array of stored values
     */
    static listValues = () => Object.values(s);

    /**
     * Map from toggle/control ids to persistent localStorage keys.
     */
    static keys = Object.freeze({
      TORNAPIKEY: "RACINGPLUS_TORNAPIKEY",
    });
  }

  /* ------------------------------------------------------------------------
   * App lifecycle
   * --------------------------------------------------------------------- */
  /**
   * Main entry point for the application.
   */
  const start = async () => {
    try {
      Logger.info(`Application loaded. Starting...`, w.racing_plus);

      Logger.debug(`IS_PDA ? ${IS_PDA}` + (IS_PDA ? `\nkey: ${PDA_KEY}` : ""));

      Logger.info(`Application started.`, w.racing_plus);
    } catch (err) {
      Logger.error(err);
    }
  };

  /* Start application */
  await start();
})(window, localStorage);

/* End of file: RacingPlus.user.js */
