// ==UserScript==
// @name         TornPDA.Racing+
// @namespace    TornPDA.RacingPlus
// @copyright    Copyright © 2025 moldypenguins
// @license      MIT
// @version      1.0.82-alpha
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
/** Millisecond conversion constants */
const MS = Object.freeze({
  second: 1000,
  minute: 60000,
  hour: 3600000,
  day: 86400000,
});
/** Number of kilometers in 1 mile. */
const KMS_PER_MI = 1.609344;
/** Number of milliseconds to wait for an API request. */
const API_FETCH_TIMEOUT = 10 * MS.second;
/** Number of milliseconds to wait for a selector to appear. Default = 15 seconds. */
const DEFERRAL_TIMEOUT = 15 * MS.second;
/** Number of milliseconds to update speed. Default = 1 second. */
const SPEED_INTERVAL = MS.second;
/** Number of milliseconds to cache API responses. Default = 1 hour. */
const CACHE_TTL = MS.hour;
/** CSS Selectors */
const SELECTORS = Object.freeze({
  header_root: "#racing-leaderboard-header-root",
  main_container: "#racingMainContainer",
  main_banner: "#racingMainContainer .header-wrap div.banner",
  tabs_container: "#racingMainContainer .header-wrap ul.categories",
  content_container: "#racingAdditionalContainer",
  car_selected: "#racingupdates .car-selected",
  drivers_list: "#racingupdates .drivers-list",
  drivers_list_title: "#racingupdates .drivers-list div[class^='title']",
  drivers_list_leaderboard: "#racingupdates .drivers-list #leaderBoard",
});
/* ------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------- */
/**
 * Returns the current Unix timestamp (seconds since epoch).
 * @returns {number} Current Unix timestamp (seconds)
 */
const unixTimestamp = () => Math.floor(Date.now() / 1000);

/**
 * Returns true for number primitives that are finite (excludes NaN and ±Infinity).
 * @param {unknown} n - Value to test.
 * @returns {boolean} True if n is a finite number primitive.
 */
const isNumber = (n) => typeof n === "number" && Number.isFinite(n);

/**
 * Static formatting utilities.
 * @class
 */
class Format {
  /**
   * Formats timestamp as "YYYY-MM-DD".
   * @param {number} timestamp - Milliseconds since epoch
   * @returns {string} "YYYY-MM-DD"
   */
  static date(timestamp) {
    const dt = new Date(timestamp);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }
  /**
   * Formats timestamp as "HH:MM:SS.mmm".
   * @param {number} timestamp - Milliseconds since epoch
   * @returns {string} "HH:MM:SS. mmm"
   */
  static time(timestamp) {
    const dt = new Date(timestamp);
    return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}:${String(dt.getSeconds()).padStart(2, "0")}.${String(dt.getMilliseconds()).padStart(3, "0")}`;
  }
  /**
   * Formats duration as "MM:SS.mmm".
   * @param {number} duration - Milliseconds
   * @returns {string} "MM:SS.mmm"
   */
  static duration(duration) {
    const mins = Math.floor((duration % MS.hour) / MS.minute);
    const secs = Math.floor((duration % MS.minute) / MS.second);
    const ms = Math.floor(duration % MS.second);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  }
  /**
   * Formats error as readable string.
   * @param {Error|object|string} error
   * @returns {string} "ErrorName: message"
   */
  static error(error) {
    const name = error?.name || "Error";
    const msg = error?.message || error;
    return `${name}: ${msg}`;
  }
}

/**
 * Stores distance with unit conversion support.
 * @class
 */
class Distance {
  /**
   * Creates Distance from miles or kilometers.
   * @param {object} [args={}] - Constructor arguments
   * @param {number} [args.miles=null] - Distance in miles
   * @param {number} [args.kilometers=null] - Distance in kilometers
   * @throws {TypeError} If neither or both units provided, or non-numeric
   */
  constructor(args = {}) {
    const { miles, kilometers } = args;
    if (miles == null && kilometers == null) {
      throw new TypeError("One of miles or kilometers must be specified.");
    }
    const mi = miles ?? (kilometers != null ? kilometers / KMS_PER_MI : 0);
    if (!isNumber(mi)) {
      throw new TypeError("Miles or Kilometers must be a number.");
    }
    this._mi = mi;
    this._units = kilometers != null ? "km" : "mi";
  }
  /** @returns {number} Distance in miles */
  get mi() {
    return this._mi;
  }
  /** @returns {number} Distance in kilometers */
  get km() {
    return this._mi * KMS_PER_MI;
  }
  /** @returns {string} Formatted distance with units */
  toString() {
    const val = this._units === "km" ? this.km : this.mi;
    return `${val.toFixed(2)} ${this._units}`;
  }
}

/**
 * Calculates speed from distance and elapsed time.
 * @class
 */
class Speed {
  /**
   * Creates Speed from distance and duration.
   * @param {object} args - Constructor arguments
   * @param {Distance} args.distance - Distance traveled
   * @param {number} args.seconds - Elapsed time in seconds (> 0)
   * @param {"mph"|"kph"} [args.units="mph"] - Display units
   * @throws {TypeError} If distance not Distance instance or invalid seconds
   */
  constructor(args = {}) {
    const { distance, seconds, units = "mph" } = args;
    if (!(distance instanceof Distance)) {
      throw new TypeError("distance must be a Distance instance.");
    }
    if (!Number.isInteger(seconds) || seconds <= 0) {
      throw new TypeError("seconds must be an integer > 0.");
    }
    this._mph = distance.mi / (seconds / (MS.hour / MS.second));
    this._units = units;
  }
  /** @returns {number} Speed in mph */
  get mph() {
    return this._mph;
  }
  /** @returns {number} Speed in kph */
  get kph() {
    return this._mph * KMS_PER_MI;
  }
  /** @returns {string} Formatted speed with units */
  toString() {
    const val = this._units === "kph" ? this.kph : this.mph;
    return `${val.toFixed(2)} ${this._units}`;
  }
}

/* ------------------------------------------------------------------------
 * Leveled console logging utility
 * --------------------------------------------------------------------- */
/**
 * Log level enumeration with values and colors.
 * @readonly
 * @enum {{value: number, color: string}}
 */
const LOG_LEVEL = Object.freeze({
  debug: Object.freeze({ value: 10, color: "#6aa84f" }),
  info: Object.freeze({ value: 20, color: "#3d85c6" }),
  warn: Object.freeze({ value: 30, color: "#e69138" }),
  error: Object.freeze({ value: 40, color: "#d93025" }),
  silent: Object.freeze({ value: 50, color: "#000000" }),
});

/**
 * @typedef {typeof LOG_LEVEL[keyof typeof LOG_LEVEL]} LogLevel
 */

/**
 * Reverse lookup map: value -> name.
 * @readonly
 */
const LEVEL_NAMES = Object.freeze(Object.fromEntries(Object.entries(LOG_LEVEL).map(([k, v]) => [v.value, k])));

/**
 * Configurable leveled logger.
 * @class
 */
class Logger {
  /**
   * Creates logger with threshold.
   * @param {LogLevel} mode - Minimum level to log
   */
  constructor(log_mode = LOG_LEVEL.warn, is_pda = false) {
    this.log_mode = log_mode;
    this.is_pda = is_pda;
  }
  /**
   * Logs if level meets threshold.
   * @param {LogLevel} level - Log level
   * @param {string} message - Message
   * @param {boolean} is_pda - PDA context
   * @param {number|null} time - Start time for duration
   */
  log(level, message, time = null) {
    if (this.log_mode.value > level.value) return;

    const dt = Date.now();
    const lvl = LEVEL_NAMES[level.value].toUpperCase();
    const suffix = time ? ` ${dt - time}ms` : ` ${Format.date(dt)} ${Format.time(dt)}`;

    if (this.is_pda) {
      console.log(`${lvl}[TornPDA. Racing+]: ${message}${suffix}`);
    } else {
      console.log(`%c${lvl}[TornPDA.Racing+]: `, `color:${level.color};font-weight:600`, `${message}${suffix}`);
    }
  }
  /**
   * Logs at debug level.
   * @param {string} message
   * @param {boolean} is_pda
   * @param {number|null} time
   */
  debug(message, time = null) {
    this.log(LOG_LEVEL.debug, message, time);
  }
  /**
   * Logs at info level.
   * @param {string} message
   * @param {boolean} is_pda
   * @param {number|null} time
   */
  info(message, time = null) {
    this.log(LOG_LEVEL.info, message, time);
  }
  /**
   * Logs at warn level.
   * @param {string} message
   * @param {boolean} is_pda
   * @param {number|null} time
   */
  warn(message, time = null) {
    this.log(LOG_LEVEL.warn, message, time);
  }
  /**
   * Logs at error level.
   * @param {string} message
   * @param {boolean} is_pda
   * @param {number|null} time
   */
  error(message, time = null) {
    this.log(LOG_LEVEL.error, message, time);
  }
}

/* ------------------------------------------------------------------------
 * localStorage wrapper
 * --------------------------------------------------------------------- */
/**
 * Wrapper class for localStorage with typed keys and convenience methods.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
 * @class
 */
class Store {
  /**
   * Creates store instance.
   * @param {Storage} storage - Storage object (localStorage/sessionStorage)
   */
  constructor(storage) {
    this.storage = storage;
  }
  /**
   * Gets value from storage.
   * @param {string} key - Storage key
   * @returns {string|null} Stored value or null
   */
  getValue(key) {
    return this.storage.getItem(key);
  }
  /**
   * Sets value in storage.
   * @param {string} key - Storage key
   * @param {string} value - Value to store
   */
  setValue(key, value) {
    this.storage.setItem(key, value);
  }
  /**
   * Deletes value from storage.
   * @param {string} key - Storage key
   */
  deleteValue(key) {
    this.storage.removeItem(key);
  }
  /**
   * Clears all storage keys.
   */
  deleteAll() {
    this.storage.clear();
  }
  /**
   * Lists all stored values (debug).
   * @returns {Array<string>} All values
   */
  listValues() {
    return Object.values(this.storage);
  }
  /**
   * Persistent storage key mappings.
   * @readonly
   */
  static keys = Object.freeze({
    rplus_apikey: "RACINGPLUS_APIKEY",
    rplus_units: "RACINGPLUS_DISPLAYUNITS",
    rplus_addlinks: "RACINGPLUS_ADDPROFILELINKS",
    rplus_showskill: "RACINGPLUS_SHOWRACINGSKILL",
    rplus_showspeed: "RACINGPLUS_SHOWCARSPEED",
    rplus_showracelink: "RACINGPLUS_SHOWRACELINK",
    rplus_showresults: "RACINGPLUS_SHOWRESULTS",
    rplus_showexportlink: "RACINGPLUS_SHOWEXPORTLINK",
    rplus_showwinrate: "RACINGPLUS_SHOWCARWINRATE",
    rplus_highlightcar: "RACINGPLUS_HIGHLIGHTCAR",
    rplus_showparts: "RACINGPLUS_SHOWCARPARTS",
    rplus_driver: "RACINGPLUS_DRIVER",
  });
}

/* ------------------------------------------------------------------------
 * Torn racing data
 * --------------------------------------------------------------------- */
/**
 * Color palette for car parts (used in CSS generation)
 * @readonly
 */
const RACE_COLOURS = ["#5D9CEC", "#48CFAD", "#FFCE54", "#ED5565", "#EC87C0", "#AC92EC", "#FC6E51", "#A0D468", "#4FC1E9"];

/**
 * Track metadata indexed by track ID with pre-instantiated Distance objects
 * @readonly
 */
const RACE_TRACKS = Object.freeze({
  6: Object.freeze({ title: "Uptown", distance: new Distance({ miles: 2.25 }), laps: 7 }),
  7: Object.freeze({ title: "Withdrawal", distance: new Distance({ miles: 3.4 }), laps: 5 }),
  8: Object.freeze({ title: "Underdog", distance: new Distance({ miles: 1.73 }), laps: 9 }),
  9: Object.freeze({ title: "Parkland", distance: new Distance({ miles: 3.43 }), laps: 5 }),
  10: Object.freeze({ title: "Docks", distance: new Distance({ miles: 3.81 }), laps: 5 }),
  11: Object.freeze({ title: "Commerce", distance: new Distance({ miles: 1.09 }), laps: 15 }),
  12: Object.freeze({ title: "Two Islands", distance: new Distance({ miles: 2.71 }), laps: 6 }),
  15: Object.freeze({ title: "Industrial", distance: new Distance({ miles: 1.35 }), laps: 12 }),
  16: Object.freeze({ title: "Vector", distance: new Distance({ miles: 1.16 }), laps: 14 }),
  17: Object.freeze({ title: "Mudpit", distance: new Distance({ miles: 1.06 }), laps: 15 }),
  18: Object.freeze({ title: "Hammerhead", distance: new Distance({ miles: 1.16 }), laps: 14 }),
  19: Object.freeze({ title: "Sewage", distance: new Distance({ miles: 1.5 }), laps: 11 }),
  20: Object.freeze({ title: "Meltdown", distance: new Distance({ miles: 1.2 }), laps: 13 }),
  21: Object.freeze({ title: "Speedway", distance: new Distance({ miles: 0.9 }), laps: 18 }),
  23: Object.freeze({ title: "Stone Park", distance: new Distance({ miles: 2.08 }), laps: 8 }),
  24: Object.freeze({ title: "Convict", distance: new Distance({ miles: 1.64 }), laps: 10 }),
});

/**
 * @typedef {typeof LOG_LEVEL[keyof typeof LOG_LEVEL]} RaceTrack
 */

/**
 * Car parts grouped by category (used for CSS injection and part filtering)
 * @readonly
 */
const PART_CATEGORIES = Object.freeze({
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
});

/* ------------------------------------------------------------------------
 * Torn models
 * --------------------------------------------------------------------- */
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

/* Number of characters in a valid API key. */
const API_KEY_LENGTH = 16;

/* Url for the Torn API */
const API_URL = "https://api.torn.com/v2";

/* Comment shown in Torn API recent usage. */
const API_COMMENT = "RacingPlus";

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
  constructor(key) {
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
    /* Validate root against allowed API endpoints */
    if (!API_VALID_ROOTS.includes(root)) {
      throw new Error(`Invalid API root. Must be one of: ${API_VALID_ROOTS.join(", ")}`);
    }
    /* Validate path is a string */
    if (typeof path !== "string") throw new Error("Invalid path. Must be a string.");

    // TODO: validate args

    /* Build query string from params object */
    let queryString = "";
    if (params != null && typeof params === "object" && Object.entries(params).length > 0) {
      queryString = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
    } else {
      throw new Error("Invalid argument. Params must be an object.");
    }
    /* build query url */
    const fullQuery = `?comment=${API_COMMENT}${this.key ? `&key=${this.key}` : ""}${queryString ? `&${queryString}` : ""}`;
    const fullURL = API_URL + `/${root}/${path.replace(/^\/+|\/+$/g, "")}` + fullQuery;

    /* check for cached copy, then return results */
    const cached = this.cache.get(fullURL);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;

    /* no cached copy, request new copy */
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT);

    try {
      /* Fetch from API with abort signal for timeout */
      const response = await fetch(fullURL, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText || ""}`.trim());
      }
      /* Parse JSON response and check for API errors */
      const results = await response.json().catch((err) => {
        throw new Error(`Invalid JSON response: ${err}`);
      });
      if (!results || results.error) {
        throw new Error(`API request failed: ${results?.error?.error ?? "Unknown error."}`);
      }
      /* Cache valid response and return data */
      this.cache.set(fullURL, { data: results, timestamp: Date.now() });
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
  async validate(store, key) {
    if (!key || typeof key !== "string" || key.length !== API_KEY_LENGTH) {
      throw new Error("Invalid API key: local validation.");
    }
    /* Temporarily use candidate key for validation probe, storing current key */
    const prev_key = this.key;
    this.key = key;
    const data = await this.request("key", "info", {
      timestamp: `${unixTimestamp()}`,
    });
    if (data?.info?.access && Number(data.info.access.level) >= ACCESS_LEVEL.Minimal) {
      /* Valid key; persist to localStorage */
      store.setValue(Store.keys.rplus_apikey, this.key);
      return true;
    }
    /* Invalid key; restore previous key and throw error */
    this.key = prev_key;
    throw new Error("Invalid API key: unexpected response.");
  }
  /**
   * Clear the key and localStorage
   */
  clear(store) {
    store.deleteValue(Store.keys.rplus_apikey);
    this.key = null;
  }
}

/**
 * Stores skill and per-track best records for current user
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
  load(data) {
    try {
      const driver = JSON.parse(data);
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

  /**
   * Save driver data to localStorage
   */
  save(store) {
    const payload = JSON.stringify({
      id: this.id,
      skill: this.skill,
      records: this.records,
      cars: this.cars,
    });
    store.setValue(Store.keys.rplus_driver, payload);
  }

  /**
   * Update stored skill if newer value is higher (skill increases only)
   * @param {number|string} skill - New skill value
   */
  updateSkill(store, racing_skill) {
    if (isNumber(racing_skill)) {
      const skill = Number(racing_skill).toFixed(5);
      this.skill = Math.max(this.skill, skill);
      this.save(store);
      return this.skill - skill;
    }
  }

  /**
   * Fetch racing records from API and store best lap per car/track
   * @returns {Promise<void>}
   */
  async updateRecords(store, torn_api) {
    // TODO: add logging
    try {
      if (!torn_api.key) throw new Error("TornAPI not initialized.");
      const results = await torn_api.request("user", "racingrecords", {
        timestamp: `${unixTimestamp()}`,
      });
      if (Array.isArray(results?.racingrecords)) {
        /* Parse records array and store best lap time per car per track */
        results.racingrecords.forEach(({ track, records }) => {
          if (!track?.id || !Array.isArray(records)) return;
          this.records[track.id] = records.reduce((acc, rec) => {
            if (!acc[rec.car_id]) {
              acc[rec.car_id] = {
                name: rec.car_name,
                lap_time: rec.lap_time,
                count: 1,
              };
            } else {
              acc[rec.car_id].lap_time = Math.min(acc[rec.car_id].lap_time, rec.lap_time);
              acc[rec.car_id].count += 1;
            }
            return acc;
          }, {});
        });
        this.save(store);
      } else {
        Logger.debug("Racing records response missing 'racingrecords' array.");
      }
    } catch (err) {
      Logger.warn(`Racing records fetch failed.\n${err}`);
    }
  }

  /**
   * Fetch and store enlisted cars with win rate calculation
   * @returns {Promise<void>}
   */
  async updateCars(store, torn_api) {
    // TODO: add logging
    try {
      if (!torn_api.key) throw new Error("TornAPI not initialized.");
      const results = await torn_api.request("user", "enlistedcars", {
        timestamp: `${unixTimestamp()}`,
      });
      if (Array.isArray(results?.enlistedcars)) {
        /* Filter active cars and reduce to object indexed by car_item_id with win rate calculation */
        this.cars = results.enlistedcars
          .filter((car) => !car.is_removed)
          .reduce((acc, car) => {
            acc[car.car_item_id] = {
              name: car.car_item_name,
              top_speed: car.top_speed,
              acceleration: car.acceleration,
              braking: car.braking,
              handling: car.handling,
              safety: car.safety,
              dirt: car.dirt,
              tarmac: car.tarmac,
              class: car.car_class,
              worth: car.worth,
              points_spent: car.points_spent,
              races_entered: car.races_entered,
              races_won: car.races_won,
              win_rate: car.races_entered > 0 ? car.races_won / car.races_entered : 0,
            };
            return acc;
          }, {});
        this.save(store);
      } else {
        Logger.debug("Enlisted cars response missing 'enlistedcars' array.");
      }
    } catch (err) {
      Logger.warn(`Enlisted cars fetch failed.\n${err}`);
    }
  }
}

/**
 * Helper to compile race metadata and compute status
 * @class
 */
class TornRace {
  /**
   * Creates a TornRace instance
   * @param {object} [args={}] - Race properties
   * @param {string} [args.id] - Race ID
   * @param {RaceTrack} [args.track] - Race Track
   */
  constructor(args = {}) {
    this.id = args.id;
    this.track = args.track;
    this.status = "joined";
  }

  /**
   * Updates race status from info spot text
   * @param {string} info_spot - Info spot text content
   * @returns {'unknown'|'racing'|'finished'|'waiting'|'joined'} Updated status
   */
  updateStatus(info_spot) {
    const text = (info_spot ?? "").toLowerCase();
    switch (text) {
      case "":
        this.status = "unknown";
        break;
      case "race started":
      case "race in progress":
        this.status = "racing";
        break;
      case "race finished":
        this.status = "finished";
        break;
      default:
        // Case-insensitive check for "Race will Start in" marker
        this.status = text.includes("Race will Start in") ? "waiting" : "joined";
        break;
    }
    return this.status;
  }
}

// ########################################################################################################################################################## //

/* ------------------------------------------------------------------------
 * Userscript start
 * --------------------------------------------------------------------- */
(async (w) => {
  /* Check if userscript has been initialized */
  if (w.racing_plus) return;
  /** @type {number} timestamp representing the userscript start time */
  w.racing_plus = Date.now();

  /* TornPDA Integration Stub */
  const PDA_KEY = "###PDA-APIKEY###";
  /* A boolean indicating whether userscript is running in TornPDA. */
  const IS_PDA = await (async () => {
    if (typeof w.flutter_inappwebview !== "undefined" && typeof w.flutter_inappwebview.callHandler === "function") {
      try {
        return await w.flutter_inappwebview.callHandler("isTornPDAF");
      } catch (error) {
        console.error("isTornPDA - ", error);
        return false;
      }
    }
    return false;
  })();

  /* Singletons */
  /** @type {Store} */ const store = new Store(w.localStorage);
  /** @type {Logger} */ const logger = new Logger(LOG_LEVEL.debug, IS_PDA);
  /** @type {TornAPI} */ let torn_api = null;
  /** @type {TornDriver} */ let torn_driver = null;
  /** @type {TornRace} */ let torn_race = null;

  /* ------------------------------------------------------------------------
   * DOM methods
   * --------------------------------------------------------------------- */
  /**
   * Wait for a selector to appear using MutationObserver with timeout.
   * @param {string} selectors - CSS selector(s)
   * @returns {Promise<Element>} Resolved element
   */
  const defer = async (selectors) => {
    return new Promise((resolve, reject) => {
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
  };

  /**
   * Wait for a selector to appear with children using MutationObserver with timeout.
   * @param {string} selectors - CSS selector(s)
   * @returns {Promise<Element>} Resolved element
   */
  const deferChild = async (parentSelector, childSelector) => {
    const parent = await defer(parentSelector);
    return new Promise((resolve, reject) => {
      const found = parent.querySelector(childSelector);
      if (found) return resolve(parent);
      let obs;
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`deferral timed out: '${parent}' -> '${childSelector}'`));
      }, DEFERRAL_TIMEOUT);
      const cleanup = () => {
        clearTimeout(timer);
        obs?.disconnect();
      };
      obs = new MutationObserver(() => {
        const el = parent.querySelector(childSelector);
        if (el) {
          cleanup();
          resolve(parent);
        }
      });
      obs.observe(parent, { childList: true, subtree: true });
    });
  };

  /**
   * Creates an element with supplied properties.
   * @param {keyof HTMLElementTagNameMap} tag - The HTML tag to create.
   * @param {Object} props - HTML element properties + optional 'children' array/element.
   * @returns {HTMLElement} The constructed element.
   */
  const newElement = (tag, props = {}) => {
    const { children, ...rest } = props;
    const el = Object.assign(w.document.createElement(tag), rest);
    if (children) {
      /* Convert single child to array and append all */
      const childrenArray = Array.isArray(children) ? children : [children];
      el.append(...childrenArray);
    }
    return el;
  };

  /**
   * Normalizes leaderboard DOM entries and adds driver info
   */
  const updateLeaderboard = async (leaderboard) => {
    // Logger.debug("Updating Leaderboard...");

    // TODO: FIX THIS

    /* Process each driver entry in the leaderboard */
    for (const driver of Array.from(leaderboard.childNodes)) {
      const driverItem = driver.querySelector("ul.driver-item");
      //Array.from(drivers).forEach(async (drvr) => {
      /* Cache frequently used lookups to avoid repeated DOM queries */
      const driverId = (driver.id || "").substring(4);
      const driverStatus = driver.querySelector(".status");
      const drvrName = driver.querySelector("li.name");
      // TODO: better null safety check
      const nameLink = drvrName?.querySelector("a");
      const nameSpan = drvrName?.querySelector("span");
      const drvrColour = driver.querySelector("li.color");

      /* Update status icon based on current race state */
      // TODO: FIX THIS
      if (driverStatus) {
        switch (torn_race.status) {
          case "joined":
            driverStatus.classList.toggle("success", true);
            driverStatus.classList.toggle("waiting", false);
            driverStatus.classList.toggle("racing", false);
            driverStatus.textContent = "";
            break;
          case "waiting":
            driverStatus.classList.toggle("success", false);
            driverStatus.classList.toggle("waiting", true);
            driverStatus.classList.toggle("racing", false);
            driverStatus.textContent = "";
            break;
          case "racing":
            driverStatus.classList.toggle("success", false);
            driverStatus.classList.toggle("waiting", false);
            driverStatus.classList.toggle("racing", true);
            driverStatus.textContent = "";
            break;
          case "finished":
          default:
            break;
        }
      }

      /* Move color styling from separate element to name span */
      if (drvrColour && nameSpan) {
        drvrColour.classList.remove("color");
        nameSpan.className = drvrColour.className;
      }

      /* Conditionally add clickable profile links to driver names */
      if (store.getValue(Store.keys.rplus_addlinks) === "1") {
        if (!nameLink && nameSpan?.outerHTML) {
          nameSpan.outerHTML = `<a target="_blank" href="/profiles.php?XID=${driverId}">${nameSpan.outerHTML}</a>`;
        }
      } else {
        if (nameLink) {
          drvrName.innerHTML = `${nameLink.innerHTML}`;
        }
      }

      /* Create stats container if missing */
      if (!driver.querySelector(".statistics")) {
        drvrName.insertAdjacentHTML("beforeEnd", `<div class="statistics"></div>`);
      }
      const stats = driver.querySelector(".statistics");

      /* Move time element into separate container next to stats */
      const timeLi = driver.querySelector("li.time");
      if (timeLi) {
        if (timeLi.textContent === "") {
          timeLi.textContent = "0.00 %";
        }
        const timeContainer = w.document.createElement("ul");
        timeContainer.appendChild(timeLi);
        stats.insertAdjacentElement("afterEnd", timeContainer);
      }

      /* Add real-time speed display if enabled */
      if (store.getValue(Store.keys.rplus_showspeed) === "1") {
        if (!stats.querySelector(".speed")) {
          stats.insertAdjacentHTML("beforeEnd", '<div class="speed">0.00mph</div>');
        }
        // if (!["joined", "finished"].includes(racestatus) && !speedIntervalByDriverId.has(driverId)) {
        //   Logger.debug(`Adding speed interval for driver ${driverId}.`);
        //   speedIntervalByDriverId.set(driverId, setInterval(updateSpeed, SPEED_INTERVAL, trackData, driverId));
        // }
      }
      /* Add racing skill display if enabled */
      if (store.getValue(Store.keys.rplus_showskill) === "1") {
        if (!stats.querySelector(".skill")) {
          stats.insertAdjacentHTML("afterBegin", '<div class="skill">RS: ?</div>');
        }
        if (torn_api.key) {
          /* Fetch racing skill from API and update display */
          try {
            let user = await torn_api.request("user", `${driverId}/personalStats`, { stat: "racingskill" });
            if (user) {
              let skill = stats.querySelector(".skill");
              skill.textContent = `RS: ${user.personalstats?.racing?.skill ?? "?"}`;
            }
          } catch (err) {
            console.log(`[TornPDA.Racing+]: ${err.error ?? err}`);
          }
        }
      }
      driverItem.classList.toggle("show", true);
    } //);
  };

  /* ------------------------------------------------------------------------
   * Userscript lifecycle
   * --------------------------------------------------------------------- */
  /** Main entry point for the application. */
  const start = async () => {
    try {
      /** Check userscript context */
      logger.debug(IS_PDA ? "Torn PDA context detected." : "Browser context detected.", w.racing_plus);

      /** Inject CSS into document head */
      logger.debug(`Injecting styles...`, w.racing_plus);
      /* Build dynamic CSS rules for part colors if parts display is enabled */
      const dynRules = [];
      if (store.getValue(Store.keys.rplus_showparts) === "1") {
        Object.entries(PART_CATEGORIES).forEach(([, parts]) => {
          parts.forEach((g, i) => {
            dynRules.push(
              `.d .racing-plus-parts-available span[data-part="${g}"]{color:${RACE_COLOURS[i]};}`,
              `.d .racing-main-wrap .pm-items-wrap .pm-items li[data-part="${g}"]:not(.bought):not(.active) .status{background-color:${RACE_COLOURS[i]};background-image:unset;}`,
              `.d .racing-main-wrap .pm-items-wrap .pm-items li[data-part="${g}"]:not(.bought):not(.active) .bg-wrap .title{background-color:${RACE_COLOURS[i]}40;}`
            );
          });
        });
      }
      w.document.head.appendChild(newElement("style", { innerHTML: `__MINIFIED_CSS__` + dynRules.join("") }));
      logger.info(`Styles injected.`, w.racing_plus);

      /** Initialize Torn API client with stored key or PDA key if applicable */
      logger.debug(`Initializing Torn API client...`, w.racing_plus);
      try {
        torn_api = new TornAPI(store.getValue(Store.keys.rplus_apikey));
        if (torn_api.key?.length == 0 && IS_PDA && PDA_KEY.length > 0) {
          await torn_api.validate(store, PDA_KEY);
          logger.debug("Valid API key.");
        }
        logger.info(`Torn API client nitialized.`, w.racing_plus.start);
      } catch (err) {
        logger.error(err);
      }

      /* Load or initialize current driver data */
      logger.debug(`Loading driver data...`, w.racing_plus.start);
      try {
        /* Attempt to load from storage else get driver data from DOM */
        /* '#torn-user' a hidden input with JSON { id, ... } */
        let scriptData = store.getValue(Store.keys.rplus_driver);
        if (!scriptData) scriptData = await defer("#torn-user").value;
        /* Instantiate new driver */
        torn_driver = new TornDriver(JSON.parse(scriptData).id);
        torn_driver.load(store.getValue(Store.keys.rplus_driver));
        logger.info(`Driver data loaded.`, w.racing_plus.start);
      } catch (err) {
        logger.error(`Failed to load driver data. ${err}`);
      }

      /* Fix header banner (racing skill + class) */
      if (!IS_PDA) {
        logger.debug("Fixing header banner...", w.racing_plus.start);
        const banner = await defer(SELECTORS.main_banner);
        const leftBanner = newElement("div", { className: "left-banner" });
        const rightBanner = newElement("div", { className: "right-banner" });
        // TODO: add comment here */
        const elements = Array.from(banner.children);
        elements.forEach((el) => {
          if (el.classList.contains("skill-desc") || el.classList.contains("skill") || el.classList.contains("lastgain")) {
            if (el.classList.contains("skill")) {
              /* Update cached skill value (only if higher) and replace DOM content */
              torn_driver.updateSkill(store, el.textContent);
              el.textContent = String(torn_driver.skill);
            }
            leftBanner.appendChild(el);
          } else if (el.classList.contains("class-desc") || el.classList.contains("class-letter")) {
            rightBanner.appendChild(el);
          }
        });
        banner.innerHTML = "";
        banner.appendChild(leftBanner);
        banner.appendChild(rightBanner);
        logger.info("Header banner fixed.", w.racing_plus.start);
      }

      // #################################################################################################################################################### //
      /**
       * Start content for 'Official Events'
       */

      /* Load or init current race data */
      logger.debug(`Loading track data...`, w.racing_plus.start);
      try {
        /* Initialize race object from current track if not already set */
        const drivers_list = await defer(SELECTORS.drivers_list);
        const leaderboard = await deferChild(SELECTORS.drivers_list_leaderboard, "li[id^=lbr-]");

        //
        if (!torn_race) {
          /* Find this_driver in leaderboard */
          const driver = Array.from(leaderboard.childNodes).find((d) => d.id === `lbr-${torn_driver.id}`);
          /* Parse race ID from driver row's data-id attribute */
          const dataId = driver.getAttribute("data-id");
          const raceId = dataId?.split("-")[0] ?? -1;
          /* Use track-info to find track object */
          const trackInfo = drivers_list.querySelector(".track-info");
          const trackId = Object.values(RACE_TRACKS).indexOf((t) => t.name === trackInfo.getAttribute("title"));

          //
          torn_race = new TornRace({ id: raceId, track: trackId });
        }

        // sfdsdf
        // torn_driver.load();
        //
        updateLeaderboard(leaderboard);

        logger.info(`Track data loaded.`, w.racing_plus.start);
      } catch (err) {
        logger.error(`Failed to load track data. ${err}`);
      }

      /**
       * End content for 'Official Events'
       */
      // #################################################################################################################################################### //

      //
      logger.info(`Userscript started.`, w.racing_plus.start);
    } catch (err) {
      logger.error(err);
    }
  };

  /* Start userscript */
  logger.info(`Userscript loaded. Starting...`, w.racing_plus.start);
  await start();
  /* End userscript */
})(window);

/* End of file: RacingPlus.user.js */
