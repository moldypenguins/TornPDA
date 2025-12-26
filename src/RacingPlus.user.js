// ==UserScript==
// @name         TornPDA.Racing+
// @namespace    TornPDA.RacingPlus
// @version      1.0.6-alpha
// @license      MIT
// @description  Show racing skill, current speed, race results, precise skill, upgrade parts.
// @author       moldypenguins [2881784] - Adapted from Lugburz [2386297] + styles from TheProgrammer [2782979]
// @match        https://www.torn.com/page.php?sid=racing*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @updateURL    https://github.com/moldypenguins/TornPDA/raw/refs/heads/main/dist/RacingPlus.user.js
// @downloadURL  https://github.com/moldypenguins/TornPDA/raw/refs/heads/main/dist/RacingPlus.user.js
// @connect      api.torn.com
// @run-at       document-start
// ==/UserScript==
"use strict";

/* ------------------------------------------------------------------------
 * Constants
 * --------------------------------------------------------------------- */
const SCRIPT_START = Date.now();

const MS_PER_SECOND = 1000; // Number of milliseconds in 1 second.
const MS_PER_MINUTE = 60000; // Number of milliseconds in 1 minute.
const MS_PER_HOUR = 3600000; // Number of milliseconds in 1 hour.
const SECONDS_PER_HOUR = 3600; // Number of seconds in 1 hour.
const KMS_PER_MI = 1.609344; // Number of kilometers in 1 mile.

const API_KEY_LENGTH = 16; // Number of characters in a valid API key.
const API_FETCH_TIMEOUT = 10 * MS_PER_SECOND; // Number of milliseconds to wait for an API request.
const DEFERRAL_TIMEOUT = MS_PER_MINUTE / 2; // Number of milliseconds to wait for a selector to appear. Default = 1 minute.
const SPEED_INTERVAL = MS_PER_SECOND; // Number of milliseconds to update speed. Default = 1 second.
const CACHE_TTL = MS_PER_HOUR; // Number of milliseconds to cache API responses. Default = 1 hour.

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
 * Logger - Static methods for console.log()
 * @class
 */
class Logger {
  /** logs a debug-level message. */
  static debug(...args) {
    if (LOG_MODE > LOG_LEVEL.debug) return;
    console.log("%c[DEBUG][TornPDA.Racing+]: ", "color:#6aa84f;font-weight:600", ...args);
  }
  /** logs an info-level message. */
  static info(...args) {
    if (LOG_MODE > LOG_LEVEL.info) return;
    console.log("%c[INFO][TornPDA.Racing+]: ", "color:#3d85c6;font-weight:600", ...args);
  }
  /** Logs a warning-level message. */
  static warn(...args) {
    if (LOG_MODE > LOG_LEVEL.WARN) return;
    console.log("%c[WARN][TornPDA.Racing+]: ", "color:#e69138;font-weight:600", ...args);
  }
  /** Logs an error-level message. */
  static error(...args) {
    if (LOG_MODE > LOG_LEVEL.ERROR) return;
    console.log("%c[ERROR][TornPDA.Racing+]: ", "color:#d93025;font-weight:600", ...args);
  }
}

/* ------------------------------------------------------------------------
 * Type Methods
 * --------------------------------------------------------------------- */
/**
 * Date.unix - Returns the current Unix timestamp (seconds since epoch).
 * @returns {number} Current Unix timestamp
 */
if (!Date.unix) {
  Object.defineProperty(Date, "unix", {
    value: () => Math.floor(Date.now() / MS_PER_SECOND),
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

/**
 * Number.formatDate - Returns a formatted date (yyyy-MM-dd).
 * @returns {string} Formatted date
 */
if (!Number.formatDate) {
  Object.defineProperty(Number, "formatDate", {
    value: (s) => {
      const dt = new Date(s);
      return `${String(dt.getFullYear())}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

/**
 * Number.formatTime - Returns a formatted time.
 * @returns {string} Formatted time
 */
if (!Number.formatTime) {
  Object.defineProperty(Number, "formatTime", {
    value: (ms) =>
      `${("00" + Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))).toString().slice(-2)}` +
      `:${("00" + Math.floor((ms % (1000 * 60)) / 1000)).toString().slice(-2)}` +
      `.${("000" + Math.floor(ms % 1000)).toString().slice(3)}`,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

/**
 * Number.isValid - returns true for number primitives (excludes NaN).
 * @returns {boolean}
 */
if (!Number.isValid) {
  Object.defineProperty(Number, "isValid", {
    value: (n) => typeof n === "number" && Number.isFinite(n),
    writable: true,
    configurable: true,
    enumerable: false,
  });
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
    rplus_apikey: "RACINGPLUS_APIKEY",
    rplus_units: "RACINGPLUS_DISPLAYUNITS",
    rplus_addlinks: "RACINGPLUS_ADDPROFILELINKS",
    rplus_showskill: "RACINGPLUS_SHOWRACINGSKILL",
    rplus_showspeed: "RACINGPLUS_SHOWCARSPEED",
    rplus_showracelink: "RACINGPLUS_SHOWRACELINK",
    rplus_showexportlink: "RACINGPLUS_SHOWEXPORTLINK",
    rplus_showwinrate: "RACINGPLUS_SHOWCARWINRATE",
    rplus_showparts: "RACINGPLUS_SHOWCARPARTS",
  });
}

/**
 * Distance class - Stores distance and formats value based on preferred units
 * @class
 */
class Distance {
  /**
   * Creates a Distance instance
   * @param {object} [args={}] - Constructor arguments
   * @param {number} [args.miles=null] - Distance in miles
   * @param {number} [args.kilometers=null] - Distance in kilometers
   * @throws {TypeError} If miles is not a finite number
   */
  constructor(args = {}) {
    const { miles, kilometers } = args;
    if (miles == null && kilometers == null) {
      throw new TypeError("One of miles or kilometers must be specified.");
    }
    const mi = miles ?? (kilometers != null ? kilometers / KMS_PER_MI : 0);
    if (!Number.isValid(mi)) {
      throw new TypeError("Miles or Kilometers must be a number.");
    }
    this._mi = mi;
    this._units = kilometers != null ? "km" : "mi";
  }

  /**
   * Get distance in miles
   * @returns {number} Distance in miles
   */
  get mi() {
    return this._mi;
  }

  /**
   * Get distance in kilometers
   * @returns {number} Distance in kilometers
   */
  get km() {
    return this._mi * KMS_PER_MI;
  }

  /**
   * Format distance as string according to chosen units
   * @returns {string} Formatted distance with units
   */
  toString() {
    const val = this._units === "km" ? this.km : this.mi;
    return `${val.toFixed(2)} ${this._units}`;
  }
}

/**
 * Speed class - Computes speed from Distance and elapsed time
 * @class
 */
class Speed {
  /**
   * Creates a Speed instance
   * @param {object} args - Constructor arguments
   * @param {Distance} args.distance - Distance traveled
   * @param {number} args.seconds - Elapsed time in seconds (> 0)
   * @throws {TypeError} If distance is not a Distance instance or seconds invalid
   */
  constructor(args = {}) {
    const { distance, seconds } = args;
    if (!(distance instanceof Distance)) {
      throw new TypeError("distance must be a Distance instance.");
    }
    if (!Number.isInteger(seconds) || seconds <= 0) {
      throw new TypeError("seconds must be an integer > 0.");
    }
    this._mph = distance.mi / (seconds / SECONDS_PER_HOUR);
    this._units = Store.getValue(Store.keys.rplus_units) ?? "mph";
  }

  /**
   * Get speed in miles per hour
   * @returns {number} Speed in mph
   */
  get mph() {
    return this._mph;
  }

  /**
   * Get speed in kilometers per hour
   * @returns {number} Speed in kph
   */
  get kph() {
    return this._mph * KMS_PER_MI;
  }

  /**
   * Format speed according to preferred units
   * @returns {string} Formatted speed with units
   */
  toString() {
    const val = this._units === "kph" ? this.kph : this.mph;
    return `${val.toFixed(2)} ${this._units}`;
  }
}

/* ------------------------------------------------------------------------
 * Torn racing data
 * --------------------------------------------------------------------- */
// Colours for car parts.
const RACE_COLOURS = ["#5D9CEC", "#48CFAD", "#FFCE54", "#ED5565", "#EC87C0", "#AC92EC", "#FC6E51", "#A0D468", "#4FC1E9"];

// Tracks metadata with Distance instances
const RACE_TRACKS = {
  6: { name: "Uptown", distance: new Distance({ miles: 2.25 }), laps: 7 },
  7: { name: "Withdrawal", distance: new Distance({ miles: 3.4 }), laps: 5 },
  8: { name: "Underdog", distance: new Distance({ miles: 1.73 }), laps: 9 },
  9: { name: "Parkland", distance: new Distance({ miles: 3.43 }), laps: 5 },
  10: { name: "Docks", distance: new Distance({ miles: 3.81 }), laps: 5 },
  11: { name: "Commerce", distance: new Distance({ miles: 1.09 }), laps: 15 },
  12: { name: "Two Islands", distance: new Distance({ miles: 2.71 }), laps: 6 },
  15: { name: "Industrial", distance: new Distance({ miles: 1.35 }), laps: 12 },
  16: { name: "Vector", distance: new Distance({ miles: 1.16 }), laps: 14 },
  17: { name: "Mudpit", distance: new Distance({ miles: 1.06 }), laps: 15 },
  18: { name: "Hammerhead", distance: new Distance({ miles: 1.16 }), laps: 14 },
  19: { name: "Sewage", distance: new Distance({ miles: 1.5 }), laps: 11 },
  20: { name: "Meltdown", distance: new Distance({ miles: 1.2 }), laps: 13 },
  21: { name: "Speedway", distance: new Distance({ miles: 0.9 }), laps: 18 },
  23: { name: "Stone Park", distance: new Distance({ miles: 2.08 }), laps: 8 },
  24: { name: "Convict", distance: new Distance({ miles: 1.64 }), laps: 10 },
};

// Car part categories (used by the CSS injector).
const PART_CATEGORIES = {
  "Aerodynamics": ["Spoiler", "Engine Cooling", "Brake Cooling", "Front Diffuser", "Rear Diffuser"],
  "Brakes": ["Pads", "Discs", "Fluid", "Brake Accessory", "Brake Control", "Callipers"],
  "Engine": ["Gasket", "Engine Porting", "Engine Cleaning", "Fuel Pump", "Camshaft", "Turbo", "Pistons", "Computer", "Intercooler"],
  "Exhaust": ["Exhaust", "Air Filter", "Manifold"],
  "Fuel": ["Fuel"],
  "Safety": ["Overalls", "Helmet", "Fire Extinguisher", "Safety Accessory", "Roll cage", "Cut-off", "Seat"],
  "Suspension": ["Springs", "Front Bushes", "Rear Bushes", "Upper Front Brace", "Lower Front Brace", "Rear Brace", "Front Tie Rods", "Rear Control Arms"],
  "Transmission": ["Shifting", "Differential", "Clutch", "Flywheel", "Gearbox"],
  "Weight Reduction": ["Strip out", "Steering wheel", "Interior", "Windows", "Roof", "Boot", "Hood"],
  "Wheels & Tires": ["Tyres", "Wheels"],
};

/* ------------------------------------------------------------------------
 * Torn models
 * --------------------------------------------------------------------- */
/**
 * Comment shown in Torn API recent usage.
 */
const API_COMMENT = "RacingPlus";

/**
 * List of valid Torn API root strings.
 * @readonly
 * @type {readonly ["user","faction","market","racing","forum","property","key","torn"]}
 */
const API_VALID_ROOTS = Object.freeze(/** @type {const} */ (["user", "faction", "market", "racing", "forum", "property", "key", "torn"]));

/**
 * Union type of valid roots, derived from API_VALID_ROOTS.
 * @typedef {typeof API_VALID_ROOTS[number]} ApiRoot
 */

/**
 * TornAPI access level enumeration
 * @readonly
 * @enum {number}
 */
const ACCESS_LEVEL = Object.freeze({
  Public: 0,
  Minimal: 1,
  Limited: 2,
  Full: 3,
});

/**
 * TornAPI class - Wrapper for authenticated Torn API calls with caching and timeouts
 * @see https://www.torn.com/swagger/index.html
 * @class
 */
class TornAPI {
  /**
   * Creates a TornAPI instance
   */
  constructor() {
    /** @type {Map<string, {data:any, timestamp:number}>} */
    this.cache = new Map();
    /** @type {string|null} */
    this.key = null;
  }

  /**
   * Makes a Torn API request (with caching) after validating the path and root.
   * @param {ApiRoot} root - API root
   * @param {string} path - API path (e.g., 'key/info' or '/user/stats')
   * @param {object|string} [args={}] - Query parameters object or a prebuilt query string
   * @returns {Promise<object|null>} API response data if available
   * @throws {Error} If path/root inputs are invalid
   */
  async request(root, path, params = {}) {
    // validate root
    if (!API_VALID_ROOTS.includes(root)) {
      throw new Error(`Invalid API root. Must be one of: ${API_VALID_ROOTS.join(", ")}`);
    }
    // validate path
    if (typeof path !== "string") throw new Error("Invalid path. Must be a string.");
    // validate args
    // ...
    // build query string
    let queryString = "";
    if (params != null && typeof params === "object" && Object.entries(params).length > 0) {
      queryString = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
    } else {
      throw new Error("Invalid argument. Params must be an object.");
    }
    // build query url
    const queryURL =
      "https://api.torn.com/v2" +
      `/${root}/${path.replace(/^\/+|\/+$/g, "")}` +
      `?comment=${API_COMMENT}${this.key ? `&key=${this.key}` : ""}${queryString ? `&${queryString}` : ""}`;

    // check for cached copy, then return results
    const cached = this.cache.get(queryURL);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;

    // no cached copy, request new copy
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT);

    try {
      // get response
      const response = await fetch(queryURL, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText || ""}`.trim());
      }
      // parse response
      const results = await response.json().catch((err) => {
        throw new Error(`Invalid JSON response: ${err}`);
      });
      if (!results || results.error) {
        throw new Error(`API request failed: ${results?.error?.error ?? "Unknown error."}`);
      }
      // cache new copy, then return results
      this.cache.set(queryURL, { data: results, timestamp: Date.now() });
      return results;
    } catch (err) {
      Logger.warn(`API request failed: ${err}`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Validates a Torn API key by calling /key/info
   * @param {string} key - API key to validate
   * @returns {Promise<boolean>} True if valid with sufficient access
   * @throws {Error}
   */
  async validate(key) {
    Logger.debug("Validating Torn API key...");
    if (!key || typeof key !== "string" || key.length !== API_KEY_LENGTH) {
      throw new Error("Invalid API key: local validation.");
    }
    // use candidate key for probe call, store current key
    const prev_key = this.key;
    this.key = key;
    const data = await this.request("key", "info", {
      timestamp: `${Date.unix()}`,
    });
    if (data?.info?.access && Number(data.info.access.level) >= ACCESS_LEVEL.Minimal) {
      Logger.debug("Valid API key.");
      return true;
    }
    // invalid key, reset to previous key
    this.key = prev_key;
    throw new Error("Invalid API key: unexpected response.");
  }
}

/**
 * TornDriver - Stores skill and per-track best records for current user
 * @class
 */
class TornDriver {
  /**
   * Creates a TornDriver instance for a driver id.
   * @param {string|number} driver_id - Driver user ID
   */
  constructor(driver_id) {
    this.id = driver_id;
    this.skill = 0;
    this.records = {};
    this.cars = {};
  }
}

/* ------------------------------------------------------------------------
 * Application start
 * --------------------------------------------------------------------- */
(async (w) => {
  Logger.info(`Application loading... ${new Date(SCRIPT_START).toISOString()}`);

  // TornPDA Integration Stub
  const PDA_KEY = "###PDA-APIKEY###";

  // IS_PDA is a boolean indicating whether script is running in TornPDA.
  const IS_PDA = !PDA_KEY.includes("###") && typeof w.flutter_inappwebview !== "undefined" && typeof w.flutter_inappwebview.callHandler === "function";

  /* ------------------------------------------------------------------------
   * Helpers
   * --------------------------------------------------------------------- */
  /**
   * defer - Wait for a selector to appear using MutationObserver with timeout.
   * @param {string} selectors - CSS selector(s)
   * @returns {Promise<Element>} Resolved element
   */
  const defer = (selectors) =>
    new Promise((resolve, reject) => {
      const found = w.document.querySelector(selectors);
      if (found) return resolve(found);

      let obs;
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`deferral timed out: '${selectors}'`));
      }, DEFERRAL_TIMEOUT);

      const cleanup = () => {
        clearTimeout(timer);
        obs?.disconnect();
      };

      obs = new MutationObserver(() => {
        const el = w.document.querySelector(selectors);
        if (el) {
          cleanup();
          resolve(el);
        }
      });

      obs.observe(w.document.documentElement || w.document, { childList: true, subtree: true });
    });

  /**
   * addStyles - Injects Racing+ CSS into document head.
   * @returns {Promise<void>}
   */
  const addStyles = async () => {
    Logger.debug(`Injecting styles... ${Date.now() - SCRIPT_START} msec`);

    const s = w.document.createElement("style");
    s.innerHTML = `__MINIFIED_CSS__`;

    // Dynamic per-part color hints (batched for fewer string writes).
    if (Store.getValue(Store.keys.rplus_showparts) === "1") {
      const dynRules = [];
      Object.entries(PART_CATEGORIES).forEach(([, parts]) => {
        parts.forEach((g, i) => {
          dynRules.push(
            `.d .racing-plus-parts-available span[data-part="${g}"]{color:${RACE_COLOURS[i]};}`,
            `.d .racing-main-wrap .pm-items-wrap .pm-items li[data-part="${g}"]:not(.bought):not(.active) .status{background-color:${RACE_COLOURS[i]};background-image:unset;}`,
            `.d .racing-main-wrap .pm-items-wrap .pm-items li[data-part="${g}"]:not(.bought):not(.active) .bg-wrap .title{background-color:${RACE_COLOURS[i]}40;}`
          );
        });
      });
      s.innerHTML += dynRules.join("");
    }

    w.document.head.appendChild(s);
    Logger.debug(`Styles injected. ${Date.now() - SCRIPT_START} msec`);
  };

  const loadDriverData = async () => {
    Logger.debug("Loading Driver Data...");
    // Load driver data - Typically a hidden input with JSON { id, ... }
    const scriptData = await defer("#torn-user");
    let parsed;
    try {
      parsed = JSON.parse(scriptData.value);
    } catch (err) {
      throw new Error(`Failed to parse #torn-user JSON: ${err}`);
    }
    if (!parsed?.id) throw new Error("Missing driver id in #torn-user payload.");

    return new TornDriver(parsed.id);
  };

  const addRacingPlusPanel = async () => {
    Logger.debug("Adding settings panel...");
  };

  const addRacingPlusButton = async () => {
    Logger.debug("Adding settings panel toggle button...");
  };

  const loadDomElements = async () => {
    Logger.debug("Loading DOM...");
    // Normalize the top banner structure & update skill snapshot
    Logger.debug("Fixing top banner...");
    const banner = await defer(".banner");
    const leftBanner = w.document.createElement("div");
    leftBanner.className = "left-banner";
    const rightBanner = w.document.createElement("div");
    rightBanner.className = "right-banner";

    const elements = Array.from(banner.children);
    elements.forEach((el) => {
      if (el.classList.contains("skill-desc") || el.classList.contains("skill") || el.classList.contains("lastgain")) {
        if (el.classList.contains("skill")) {
          // Update driver skill snapshot (persist only if higher)
          this_driver.updateSkill(el.textContent);
          el.textContent = String(this_driver.skill);
        }
        leftBanner.appendChild(el);
      } else if (el.classList.contains("class-desc") || el.classList.contains("class-letter")) {
        rightBanner.appendChild(el);
      }
    });
    banner.innerHTML = "";
    banner.appendChild(leftBanner);
    banner.appendChild(rightBanner);
    Logger.debug("DOM loaded.");
  };

  /* ------------------------------------------------------------------------
   * App lifecycle
   * --------------------------------------------------------------------- */
  // Singletons / shared state
  /** @type {TornAPI} */ let torn_api;
  /** @type {TornDriver} */ let this_driver;

  /**
   * start - Main entry point for the application.
   */
  const start = async () => {
    try {
      Logger.info(`Application loaded. Starting... ${Date.now() - SCRIPT_START} msec`);

      // add styles
      await addStyles();

      torn_api = new TornAPI();
      torn_api.validate(IS_PDA ? PDA_KEY : (Store.getValue(Store.keys.rplus_apikey) ?? ""));

      // load driver data
      this_driver = await loadDriverData();
      this_driver.load();

      // Add the Racing+ panel and button to the DOM
      Promise.allSettled([addRacingPlusPanel, addRacingPlusButton, loadDomElements]).then((results) =>
        results.forEach((result) => {
          switch (result.status) {
            case "fulfilled":
              Logger.debug(`Fulfilled: ${result.value}`);
              break;
            case "rejected":
              Logger.warn(`Rejected: ${result.value}`);
              break;
          }
        })
      );

      Logger.info(`Application started. ${Date.now() - SCRIPT_START} msec`);
    } catch (err) {
      Logger.error(err);
    }
  };

  await start();
})(window);

// End of file: RacingPlus.user.js
