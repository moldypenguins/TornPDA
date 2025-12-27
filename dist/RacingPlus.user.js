// ==UserScript==
// @name         TornPDA.Racing+
// @namespace    TornPDA.RacingPlus
// @version      1.0.8-alpha
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

const SELECTORS = Object.freeze({
  links_container: "#racing-leaderboard-header-root div[class^='linksContainer']",
  main_container: "#racingMainContainer",
  additional_container: "#racingAdditionalContainer",
  drivers_title: "#racingupdates .drivers-list div[class^='title']",
  drivers_leaderboard: "#racingupdates .drivers-list #leaderBoard",
});

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
 * Polyfill / Shim Extensions
 * --------------------------------------------------------------------- */
/**
 * Date.unix
 * Description: Returns the current Unix timestamp (seconds since epoch).
 * @returns {number} Current Unix timestamp (seconds)
 */
if (typeof Date.unix !== "function") {
  Object.defineProperty(Date, "unix", {
    value: () => Math.floor(Date.now() / 1000),
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

/**
 * Number.formatDate
 * Description: Formats a timestamp (ms since epoch) as "YYYY-MM-DD" in local time.
 * @param {number} ms - Timestamp in milliseconds since epoch.
 * @returns {string} Formatted date string ("YYYY-MM-DD")
 */
if (typeof Number.formatDate !== "function") {
  Object.defineProperty(Number, "formatDate", {
    value: (ms) => {
      const dt = new Date(ms);
      return `${String(dt.getFullYear())}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

/**
 * Number.formatTime
 * Description: Formats a duration (ms) as "MM:SS.mmm".
 * @param {number} ms - Duration in milliseconds.
 * @returns {string} Formatted time string ("MM:SS.mmm")
 */
if (typeof Number.formatTime !== "function") {
  Object.defineProperty(Number, "formatTime", {
    value: (ms) => {
      const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((ms % (1000 * 60)) / 1000);
      const millis = Math.floor(ms % 1000);

      return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

/**
 * Number.isValid
 * Description: Returns true for number primitives that are finite (excludes NaN and ±Infinity).
 * @param {unknown} n - Value to test.
 * @returns {boolean} True if n is a finite number primitive.
 */
if (typeof Number.isValid !== "function") {
  Object.defineProperty(Number, "isValid", {
    value: (n) => typeof n === "number" && Number.isFinite(n),
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

/**
 * Error.prototype.toString
 * Description: Returns a human-readable error string (name + message).
 * @returns {string}
 */
if (typeof Error.prototype.toString !== "function") {
  Object.defineProperty(Error.prototype, "toString", {
    value: function toString() {
      const name = this && this.name ? String(this.name) : "Error";
      const msg = this && this.message ? String(this.message) : "";
      return msg ? `${name}: ${msg}` : name;
    },
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
    rplus_driver: "RACINGPLUS_DRIVER",
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
   * @param {string|null} key
   */
  constructor(key = null) {
    /** @type {Map<string, {data:any, timestamp:number}>} */
    this.cache = new Map();
    /** @type {string|null} */
    this.key = key;
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

  /**
   * Load driver data from localStorage
   */
  load() {
    const raw = Store.getValue(Store.keys.rplus_driver);
    if (raw) {
      try {
        const driver = JSON.parse(raw);
        if (driver && driver.id === this.id) {
          this.skill = Number(driver.skill) || 0;
          this.records = driver.records || {};
          this.cars = driver.cars || {};
        }
      } catch (err) {
        // Log parse errors in debug mode
        Logger.warn(`Failed to load driver cache.\n${err}`);
      }
    }
  }

  /**
   * Save driver data to localStorage
   */
  save() {
    const payload = JSON.stringify({
      id: this.id,
      skill: this.skill,
      records: this.records,
      cars: this.cars,
    });
    Store.setValue(Store.keys.rplus_driver, payload);
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
   * @typedef {Object} DivOptions
   * @description Named-arguments container for common <div> attributes and optional content.
   * @property {string} [id] - Value for the div's `id` attribute.
   * @property {string} [name] - Value for the div's `name` attribute.
   * @property {string} [class] - Value for the div's `class` attribute.
   * @property {string} [style] - Inline CSS for the div's `style` attribute.
   * @property {string} [title] - Value for the div's `title` attribute.
   * @property {string|Node|(string|Node)[]|null} [html=null] - Content to insert/append into the div as HTML/nodes.
   * @property {string|null} [text=null] - Plain text to set as the div's textContent.
   */

  /**
   * Creates a div using DivOptions.
   * @param {DivOptions} options - Div configuration (attributes + content).
   * @returns {HTMLDivElement} The constructed div element.
   */
  const createDiv = (options) => {
    const el = w.document.createElement("div");
    if (options.id) el.id = options.id;
    if (options.name) el.setAttribute("name", options.name);
    if (options.className) el.className = options.className;
    if (options.style) el.setAttribute("style", options.style);
    if (options.title) el.title = options.title;
    /**
     * Append a supported item to the container div.
     * @param {string|Node|null|undefined} item - Item to append.
     * @returns {void}
     */
    const append = (item) => {
      if (item == null) return;
      if (typeof item === "string") el.insertAdjacentHTML("beforeend", item);
      else if (item instanceof Node) el.appendChild(item);
    };

    const content = options.innerHTML;
    if (Array.isArray(content)) content.forEach(append);
    else append(content);
    return el;
  };

  /**
   * @typedef {Object} CheckboxOptions
   * @description Named-arguments container for common label and checkbox.
   * @property {string} [id] - Value for the `id` attributes.
   * @property {string} [label] - Value for the `label` content.
   */

  /**
   * Creates a label and checkbox HTML string from a required options object.
   * @param {CheckboxOptions} options - Label/checkbox configuration (id + label).
   * @returns {string} HTML string for the label + checkbox.
   */
  const createCheckbox = (options) => {
    return `<label for="${options.id}">${options.label}</label><div><input type="checkbox" id="${options.id}" /></div>`;
  };

  /**
   * addStyles - Injects Racing+ CSS into document head.
   * @returns {Promise<void>}
   */
  const addStyles = async () => {
    Logger.debug(`Injecting styles... ${Date.now() - SCRIPT_START} msec`);

    const s = w.document.createElement("style");
    s.innerHTML = `.d .racing-plus-footer::before,.d .racing-plus-header::after{position:absolute;display:block;content:"";height:0;width:100%;left:0}.d .racing-plus-panel{margin:10px 0;padding:0;display:none}.d .racing-plus-panel .show{display:block}.d .racing-plus-header{position:relative;padding-left:10px;height:30px;line-height:30px;font-size:12px;font-weight:700;letter-spacing:0;text-shadow:0 0 2px rgba(0,0,0,.5019607843);text-shadow:var(--tutorial-title-shadow);color:#fff;color:var(--tutorial-title-color);border:0!important;border-radius:5px 5px 0 0;background:linear-gradient(180deg,#888 0,#444 100%)}.d.dark-mode .racing-plus-header{background:linear-gradient(180deg,#555 0,#333 100%)}.d .racing-plus-header::after{bottom:-1px;border-top:1px solid #999;border-bottom:1px solid #ebebeb}.d.dark-mode .racing-plus-header::after{border-bottom:1px solid #222;border-top:1px solid #444}.d .racing-plus-footer{position:relative;margin:0;padding:0;height:10px;border:0!important;border-radius:0 0 5px 5px;background:linear-gradient(0deg,#888 0,#444 100%)}.d.dark-mode .racing-plus-footer{background:linear-gradient(0deg,#555 0,#333 100%)}.d .racing-plus-footer::before{top:-1px;border-bottom:1px solid #999;border-top:1px solid #ebebeb}.d.dark-mode .racing-plus-footer::before{border-top:1px solid #222;border-bottom:1px solid #444}.d .racing-plus-main{margin:0;padding:5px 10px;background-color:#f2f2f2}.d.dark-mode .racing-plus-main{background-color:#2e2e2e}.d .racing-plus-settings{display:grid;grid-template-columns:auto min-content;grid-template-rows:repeat(6,min-content);gap:0}.d .racing-plus-settings label{padding:6px 5px;font-size:.7rem;white-space:nowrap}.d .racing-plus-settings div{padding:0 5px;font-size:.7rem;text-align:right;position:relative}.d .racing-plus-settings div.flex-col{padding:0;margin-top:2px}.d .racing-plus-settings div,.d .racing-plus-settings label{border-bottom:2px groove #ebebeb}.d.dark-mode .racing-plus-settings div,.d.dark-mode .racing-plus-settings label{border-bottom:2px groove #444}.d .racing-plus-settings div:last-of-type,.d .racing-plus-settings label:last-of-type{border-bottom:0}.d .racing-plus-settings div input[type=checkbox]{height:12px;margin:5px 0;accent-color:#c00}#rplus-apikey{text-align:right;width:120px;height:12px;margin:0;padding:1px 2px;border-radius:3px;border:1px solid #767676;vertical-align:text-bottom}#rplus-apikey .valid{border-color:#090!important}#rplus-apikey .invalid{border-color:#c00!important}.d .flex-col{display:flex;flex-direction:column}.d .nowrap{white-space:nowrap!important}.d .racing-plus-apikey-actions{margin-right:10px}.d .racing-plus-apikey-status{color:red;padding:2px 5px;font-size:.6rem;display:none}.d .racing-plus-apikey-reset,.d .racing-plus-apikey-save{cursor:pointer;margin:0 0 2px;padding:0;height:16px;width:16px;display:none}.d .racing-plus-apikey-reset.show,.d .racing-plus-apikey-save.show,.d .racing-plus-apikey-status.show{display:inline-block!important}.d .racing-plus-apikey-reset svg path,.d .racing-plus-apikey-save svg path{fill:#666;fill:var(--top-links-icon-svg-fill);filter:drop-shadow(0 1px 0 rgba(255, 255, 255, .6509803922));filter:var(--top-links-icon-svg-shadow)}.d .racing-plus-apikey-reset:hover svg path,.d .racing-plus-apikey-save:hover svg path{fill:#444;fill:var(--top-links-icon-svg-hover-fill);filter:drop-shadow(0 1px 0 rgba(255, 255, 255, .6509803922));filter:var(--top-links-icon-svg-hover-shadow)}.d .racing-plus-parts-available{display:flex;flex-direction:row;gap:10px;font-style:italic;padding:10px;font-size:.7rem;background:url("/images/v2/racing/header/stripy_bg.png") #2e2e2e}.d .left-banner,.d .right-banner{height:57px;top:44px;z-index:9999;position:absolute;border-top:1px solid #424242;border-bottom:1px solid #424242;background:url("/images/v2/racing/header/stripy_bg.png")}.d .racing-plus-parts-available::after{position:absolute;left:0;bottom:-1px;content:"";display:block;height:0;width:100%;border-bottom:1px solid #222;border-top:1px solid #444}.d .racing-plus-link-wrap .export-link,.d .racing-plus-link-wrap .race-link{width:20px;float:right;filter:drop-shadow(0 0 1px rgba(17, 17, 17, .5803921569));height:20px}.d .pm-categories .link .icons .parts{position:absolute;bottom:5px;left:5px;color:#00bfff}.d .pm-categories .link .icons .parts.bought{color:#0c0}.d .racing-main-wrap .pm-items-wrap .part-wrap .l-delimiter,.d .racing-main-wrap .pm-items-wrap .part-wrap .r-delimiter,.d .racing-main-wrap .pm-items-wrap .pm-items>li .b-delimiter{height:0!important;width:0!important}.d .racing-main-wrap .pm-items-wrap .pm-items .active .properties-wrap>li .name,.d .racing-main-wrap .pm-items-wrap .pm-items .active .properties-wrap>li .progress-bar,.d .racing-main-wrap .pm-items-wrap .pm-items .bought .properties-wrap>li .name,.d .racing-main-wrap .pm-items-wrap .pm-items .bought .properties-wrap>li .progress-bar{background:unset!important}.d .racing-main-wrap .pm-items-wrap .pm-items .active,.d .racing-main-wrap .pm-items-wrap .pm-items .active .title{background:rgba(0,191,255,.07)}.d .racing-main-wrap .pm-items-wrap .pm-items .active .info{color:#00bfff}.d .racing-main-wrap .pm-items-wrap .pm-items .name .positive{color:#9c0}.d .racing-main-wrap .pm-items-wrap .pm-items .active .name .positive{color:#00a9f9}.d .racing-main-wrap .pm-items-wrap .pm-items .name .negative{color:#e54c19}.d .racing-main-wrap .pm-items-wrap .pm-items .active .name .negative{color:#ca9800}.d .racing-main-wrap .pm-items-wrap .pm-items .bought,.d .racing-main-wrap .pm-items-wrap .pm-items .bought .title{background:rgba(133,178,0,.07)}.d .racing-main-wrap .pm-items-wrap .pm-items .bought .desc{color:#85b200}.d .racing-plus-link-wrap{cursor:pointer;float:right}.d .racing-plus-link-wrap .race-link{margin:4px 5px 6px}.d .racing-plus-link-wrap .export-link:hover,.d .racing-plus-link-wrap .race-link:hover{filter:drop-shadow(1px 1px 1px rgba(17, 17, 17, .5803921569))}.d .racing-plus-link-wrap .export-link{margin:5px}.d .racing-main-wrap .car-selected-wrap #drivers-scrollbar{overflow:hidden!important;max-height:none!important}.d .racing-main-wrap .car-selected-wrap .driver-item>li.status-wrap .status{margin:5px!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item{font-size:.7rem!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.car{padding:0 5px}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name{width:unset!important;display:flex;align-items:center;flex-grow:1;border-right:0}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name a{flex-basis:fit-content;width:unset!important;height:20px;padding:0;margin:0;display:block;text-decoration:none}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name a:hover{text-decoration:underline}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span{display:block;flex-basis:fit-content;width:unset!important;height:20px;line-height:1.3rem;font-size:.7rem;padding:0 7px;margin:0;border-radius:3px;white-space:nowrap;color:#fff;background:rgba(0,0,0,.25)}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-1{background:rgba(116,232,0,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-2{background:rgba(255,38,38,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-3{background:rgba(255,201,38,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-4{background:rgba(0,217,217,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-5{background:rgba(0,128,255,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-6{background:rgba(153,51,255,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-7{background:rgba(255,38,255,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-8{background:rgba(85,85,85,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-9{background:rgba(242,141,141,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-10{background:rgba(225,201,25,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-11{background:rgba(160,207,23,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-12{background:rgba(24,217,217,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-13{background:rgba(111,175,238,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-14{background:rgba(176,114,239,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-15{background:rgba(240,128,240,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-16{background:rgba(97,97,97,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-17{background:rgba(178,0,0,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-18{background:rgba(204,153,0,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-19{background:rgba(78,155,0,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-20{background:rgba(0,157,157,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-21{background:rgba(0,0,183,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-22{background:rgba(140,0,140,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name div.statistics{display:flex;flex-grow:1;list-style:none;align-items:center;justify-content:space-between;padding:0 10px;margin:0}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.time{display:none}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name div.statistics div,.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name li.time{flex-basis:fit-content;line-height:22px;height:22px;width:unset!important;padding:0 5px;margin:0;border-radius:3px;white-space:nowrap;background-color:rgba(0,0,0,.25)}.d .left-banner{width:150px;left:0;border-right:1px solid #424242;border-top-right-radius:5px;border-bottom-right-radius:5px;box-shadow:5px 0 10px -2px rgba(0,0,0,.5),0 5px 10px -2px rgba(0,0,0,.5)}.d .racing-main-wrap .header-wrap .banner .skill-desc{width:130px!important;top:15px!important;left:8px!important;font-size:1rem!important}.d .racing-main-wrap .header-wrap .banner .skill{top:33px!important;left:10px!important;font-size:.8rem!important}.d .racing-main-wrap .header-wrap .banner .lastgain{top:33px;left:75px;color:#0f0;position:absolute;font-size:.6rem!important}.d .right-banner{width:115px;right:0;border-left:1px solid #424242;border-top-left-radius:5px;border-bottom-left-radius:5px;box-shadow:-5px 0 10px -2px rgba(0,0,0,.5),0 5px 10px -2px rgba(0,0,0,.5)}.d .racing-main-wrap .header-wrap .banner .class-desc{right:40px!important;top:23px!important;font-size:1rem!important}.d .racing-main-wrap .header-wrap .banner .class-letter{right:12px!important;top:22px!important;font-size:1.5rem!important}@media screen and (max-width:784px){.d .racing-main-wrap .header-wrap .banner .class-desc,.d .racing-main-wrap .header-wrap .banner .skill-desc{font-size:.8rem!important;top:10px!important}.d .racing-main-wrap .header-wrap .banner .skill{top:10px!important;left:125px!important}.d .racing-main-wrap .header-wrap .banner .lastgain{top:10px!important;left:190px}.d .racing-main-wrap .header-wrap .banner .class-letter{top:10px!important;font-size:1.25rem!important}.d .left-banner,.d .right-banner{top:0;background-image:none!important;border:none!important;box-shadow:none!important}}`;

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

  /**
   * Adds the Racing+ settings panel to the UI.
   * @param {Element} main_container - Main container element
   * @returns {Promise<void>}
   */
  const addRacingPlusPanel = async (main_container) => {
    Logger.debug("Adding settings panel...");
    // Check if panel already exists
    if (w.document.querySelector(".racing-plus-panel")) return;

    // Load Torn API key (from PDA or local storage)
    let apikey = IS_PDA ? PDA_KEY : (Store.getValue(Store.keys.rplus_apikey) ?? "");
    if (apikey) {
      Logger.debug("Loading Torn API...");
      // validate torn api key; if invalid, we'll leave the input editable
      if (!(await torn_api.validate(apikey))) {
        torn_api.deleteKey();
        apikey = "";
      }
    }

    // create panel
    const rplus_panel = createDiv({ class: "racing-plus-panel" });
    // append header to panel
    rplus_panel.appendChild(createDiv({ class: "racing-plus-header", text: "Racing+" }));
    // create body
    const api_actions = createDiv({
      class: "nowrap",
      html: [
        IS_PDA
          ? ""
          : '<span class="racing-plus-apikey-actions">' +
            '<button type="button" class="racing-plus-apikey-save" aria-label="Save">' +
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="2 2 20 20" version="1.1">' +
            '<path fill-rule="evenodd" clip-rule="evenodd" d="M7 2C4.23858 2 2 4.23858 2 7V17C2 19.7614 4.23858 22 7 22H17C19.7614 22 22 19.7614 22 17V8.82843C22 8.03278 21.6839 7.26972 21.1213 6.70711L17.2929 2.87868C16.7303 2.31607 15.9672 2 15.1716 2H7ZM7 4C6.44772 4 6 4.44772 6 5V7C6 7.55228 6.44772 8 7 8H15C15.5523 8 16 7.55228 16 7V5C16 4.44772 15.5523 4 15 4H7ZM12 17C13.6569 17 15 15.6569 15 14C15 12.3431 13.6569 11 12 11C10.3431 11 9 12.3431 9 14C9 15.6569 10.3431 17 12 17Z" />' +
            "</svg>" +
            "</button>" +
            '<button type="button" class="racing-plus-apikey-reset" aria-label="Reset">' +
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" version="1.1">' +
            '<path d="M790.2 590.67l105.978 32.29C847.364 783.876 697.86 901 521 901c-216.496 0-392-175.504-392-392s175.504-392 392-392c108.502 0 206.708 44.083 277.685 115.315l-76.64 76.64C670.99 257.13 599.997 225 521.5 225 366.032 225 240 351.032 240 506.5 240 661.968 366.032 788 521.5 788c126.148 0 232.916-82.978 268.7-197.33z"/>' +
            '<path d="M855.58 173.003L650.426 363.491l228.569 32.285z"/>' +
            "</svg>" +
            "</button>" +
            "</span>",
        `<input type="text" id="rplus-apikey" maxlength="${API_KEY_LENGTH}" />`,
      ],
    });
    const flex_div = createDiv({ class: "flex-col", html: [api_actions, '<span class="racing-plus-apikey-status"></span>'] });
    const rplus_main = createDiv({ class: "racing-plus-main" });
    rplus_main.appendChild(
      createDiv({
        class: "racing-plus-settings",
        html: [
          '<label for="rplus-apikey">API Key</label>',
          flex_div,
          createCheckbox({ id: "rplus_addlinks", label: "Add profile links" }),
          createCheckbox({ id: "rplus_showskill", label: "Show racing skill" }),
          createCheckbox({ id: "rplus_showspeed", label: "Show current speed" }),
          createCheckbox({ id: "rplus_showracelink", label: "Add race link" }),
          createCheckbox({ id: "rplus_showexportlink", label: "Add export link" }),
          createCheckbox({ id: "rplus_showwinrate", label: "Show car win rate" }),
          createCheckbox({ id: "rplus_showparts", label: "Show available parts" }),
        ],
      })
    );
    // append body to panel
    rplus_panel.appendChild(rplus_main);
    // append footer to panel
    rplus_panel.appendChild(createDiv({ class: "racing-plus-footer" }));
    // append panel to container
    main_container.insertAdjacentElement("beforeBegin", rplus_panel);

    /** @type {HTMLInputElement} */
    const apiInput = w.document.querySelector("#rplus-apikey");
    const apiSave = w.document.querySelector(".racing-plus-apikey-save");
    const apiReset = w.document.querySelector(".racing-plus-apikey-reset");
    const apiStatus = w.document.querySelector(".racing-plus-apikey-status");

    // Initialize API key UI
    if (IS_PDA) {
      if (apikey && apiInput) apiInput.value = apikey;
      if (apiInput) {
        apiInput.disabled = true;
        apiInput.readOnly = true;
      }
      if (apiStatus) {
        apiStatus.textContent = "Edit in TornPDA settings.";
        apiStatus.classList.toggle("show", true);
      }
      apiSave?.classList.toggle("show", false);
      apiReset?.classList.toggle("show", false);
    } else {
      if (apikey && apiInput) {
        apiInput.value = apikey;
        apiInput.disabled = true;
        apiInput.readOnly = true;
        if (apiStatus) {
          apiStatus.textContent = "";
          apiStatus.classList.toggle("show", false);
        }
        apiSave?.classList.toggle("show", false);
        apiReset?.classList.toggle("show", true);
      } else {
        if (apiInput) {
          apiInput.disabled = false;
          apiInput.readOnly = false;
        }
        if (apiStatus) {
          apiStatus.textContent = "";
          apiStatus.classList.toggle("show", false);
        }
        apiSave?.classList.toggle("show", true);
        apiReset?.classList.toggle("show", false);
      }

      // Save button handler: validate and persist key.
      apiSave?.addEventListener("click", async (ev) => {
        ev.preventDefault();
        if (!apiInput) return;
        apiInput.classList.remove("valid", "invalid");
        const candidate = apiInput.value.trim();

        if (
          await torn_api.validateKey(candidate).catch((err) => {
            Logger.warn(err);
            apiInput.classList.add("invalid");
            if (apiStatus) {
              apiStatus.textContent = err.message ?? err;
              apiStatus.classList.toggle("show", true);
            }
            return false;
          })
        ) {
          Logger.debug("Valid API key.");
          apiInput.classList.add("valid");
          torn_api.saveKey();
          apiInput.disabled = true;
          apiInput.readOnly = true;
          apiSave.classList.toggle("show", false);
          apiReset?.classList.toggle("show", true);
          if (apiStatus) {
            apiStatus.textContent = "";
            apiStatus.classList.toggle("show", false);
          }
        }
      });

      // Reset button handler: clear stored key and make input editable.
      apiReset?.addEventListener("click", (ev) => {
        ev.preventDefault();
        if (!apiInput) return;
        apiInput.value = "";
        apiInput.disabled = false;
        apiInput.readOnly = false;
        apiInput.classList.remove("valid", "invalid");
        torn_api.deleteKey();
        apiSave?.classList.toggle("show", true);
        apiReset.classList.toggle("show", false);
        if (apiStatus) {
          apiStatus.textContent = "";
          apiStatus.classList.toggle("show", false);
        }
      });
    }

    // Initialize toggles from storage & persist on click.
    w.document.querySelectorAll(".racing-plus-settings input[type=checkbox]").forEach((el) => {
      const key = Store.keys[el.id];
      if (!key) return;
      el.checked = Store.getValue(key) === "1";
      el.addEventListener("click", (ev) => {
        const t = /** @type {HTMLInputElement} */ (ev.currentTarget);
        Store.setValue(key, t.checked ? "1" : "0");
        Logger.debug(`${el.id} saved.`);
      });
    });

    Logger.debug("Settings panel added.");
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

      // load TornAPI
      Logger.debug(`Loading Torn API... ${Date.now() - SCRIPT_START} msec`);
      torn_api = new TornAPI(IS_PDA ? PDA_KEY : Store.getValue(Store.keys.rplus_apikey));

      // load driver data
      Logger.debug(`Loading Driver Data... ${Date.now() - SCRIPT_START} msec`);
      // check for stored driver
      const stored = Store.getValue(Store.keys.rplus_driver);
      if (!stored) {
        // create new driver - '#torn-user' a hidden input with JSON { id, ... }
        const scriptData = await defer("#torn-user");
        try {
          this_driver = new TornDriver(JSON.parse(scriptData.value).id);
          this_driver.load();
        } catch (err) {
          Logger.error(`Failed to load driver data. ${err}`);
        }
      }

      const main_container = await defer(SELECTORS.main_container);

      // Add the Racing+ panel and button to the DOM
      Promise.allSettled([addRacingPlusPanel(main_container), addRacingPlusButton(), loadDomElements()]).then((results) =>
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

      // ...
      // TODO: more code goes here
      // ...

      Logger.info(`Application started. ${Date.now() - SCRIPT_START} msec`);
    } catch (err) {
      Logger.error(err);
    }
  };

  await start();
})(window);

// End of file: RacingPlus.user.js
