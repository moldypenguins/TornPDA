// ==UserScript==
// @name         TornPDA - Racing+
// @namespace    TornPDA.RacingPlus
// @version      0.99.1
// @license      MIT
// @description  Show racing skill, current speed, race results, precise skill, upgrade parts.
// @author       moldypenguins [2881784] - Adapted from Lugburz [2386297] - With flavours from TheProgrammer [2782979]
// @match        https://www.torn.com/loader.php?sid=racing*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @updateURL    https://github.com/moldypenguins/TornPDA/raw/main/RacingPlus.user.js
// @downloadURL  https://github.com/moldypenguins/TornPDA/raw/main/RacingPlus.user.js
// @connect      api.torn.com
// @run-at       document-start
// ==/UserScript==

/* --------------------------------------------------------------------------
 * Racing+ userscript
 * Notes:
 *  - This version fixes several guard/logic issues (||, fallbacks),
 *    improves robustness of DOM handling, and keeps feature flags intact.
 *  - Commented-out feature hooks remain (race link copy, winrate, parts).
 * ------------------------------------------------------------------------ */

(function (w) {
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



  /* ------------------------------------------------------------------------
   * Constants
   * --------------------------------------------------------------------- */
  const API_COMMENT = 'RacingPlus'; // Comment shown in Torn API recent usage.
  const CACHE_TTL = 60 * 60 * 1000; // Cache duration for API responses (ms). Default = 1 hour.
  const SPEED_INTERVAL = 1000; // (Reserved) Sample rate for speed updates (ms).

  // Colours for car parts.
  const COLOURS = ['#5D9CEC', '#48CFAD', '#FFCE54', '#ED5565', '#EC87C0', '#AC92EC', '#FC6E51', '#A0D468', '#4FC1E9'];

  // Car part categories (used by the CSS injector).
  const CATEGORIES = {
    Aerodynamics: ['Spoiler', 'Engine Cooling', 'Brake Cooling', 'Front Diffuser', 'Rear Diffuser'],
    Brakes: ['Pads', 'Discs', 'Fluid', 'Brake Accessory', 'Brake Control', 'Callipers'],
    Engine: ['Gasket', 'Engine Porting', 'Engine Cleaning', 'Fuel Pump', 'Camshaft', 'Turbo', 'Pistons', 'Computer', 'Intercooler'],
    Exhaust: ['Exhaust', 'Air Filter', 'Manifold'],
    Fuel: ['Fuel'],
    Safety: ['Overalls', 'Helmet', 'Fire Extinguisher', 'Safety Accessory', 'Roll cage', 'Cut-off', 'Seat'],
    Suspension: ['Springs', 'Front Bushes', 'Rear Bushes', 'Upper Front Brace', 'Lower Front Brace', 'Rear Brace', 'Front Tie Rods', 'Rear Control Arms'],
    Transmission: ['Shifting', 'Differential', 'Clutch', 'Flywheel', 'Gearbox'],
    'Weight Reduction': ['Strip out', 'Steering wheel', 'Interior', 'Windows', 'Roof', 'Boot', 'Hood'],
    'Wheels & Tires': ['Tyres', 'Wheels'],
  };

  const TRACKS = {
    21: {
      name: 'Speedway',
    },
  };

  const AccessLevel = Object.freeze({
    Public: 0,
    Minimal: 1,
    Limited: 2,
    Full: 3,
  });

  /* ------------------------------------------------------------------------
   * Torn API helper
   * --------------------------------------------------------------------- */
  class TornAPI {
    constructor() {
      /** @type {Map<string, {data:any, timestamp:number}>} */
      this.cache = new Map();
      /** @type {string|null} */
      this.key = null;
    }

    /**
     * Makes a Torn API request and caches the response.
     * @param {string} path - e.g. 'key/info' or '/user/stats'
     * @param {object|string} [args] - query parameters or prebuilt query string.
     * @returns {Promise<object>}
     */
    async request(path, args = {}) {
      if (!this.key) throw new Error('Invalid API key.');
      const validRoots = ['user', 'faction', 'market', 'racing', 'forum', 'property', 'key', 'torn'];
      if (typeof path !== 'string') throw new Error('Invalid path. Must be a string.');
      const pathPrefixed = path.startsWith('/') ? path : `/${path}`;
      const root = pathPrefixed.split('/')[1];
      if (!validRoots.includes(root)) {
        throw new Error(`Invalid API path. Must start with one of: ${validRoots.join(', ')}`);
      }

      let queryString = '';
      if (typeof args === 'object' && args !== null) {
        queryString = Object.entries(args)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&');
      } else if (typeof args === 'string') {
        queryString = args;
      } else {
        throw new Error('Invalid args. Must be an object or a query string.');
      }

      const queryPrefixed = queryString && !queryString.startsWith('&') ? `&${queryString}` : queryString;
      const queryURL = `https://api.torn.com/v2${pathPrefixed}?comment=${API_COMMENT}&key=${this.key}${queryPrefixed}`;

      const cached = this.cache.get(queryURL);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;

      const controller = new AbortController();
      const options = { signal: controller.signal };
      const timeout = 10000;
      const timer = setTimeout(() => controller.abort(), timeout);

      let response;
      try {
        response = await fetch(queryURL, options);
      } catch (err) {
        clearTimeout(timer);
        if (err?.name === 'AbortError') throw new Error('Fetch timeout');
        throw err;
      }
      clearTimeout(timer);

      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

      const result = await response.json();
      if (result?.error) {
        const code = result.error?.code ?? 'API_ERROR';
        const msg = result.error?.error ?? 'Unknown error';
        throw new Error(`[TornAPI] ${code}: ${msg}`);
      }

      this.cache.set(queryURL, { data: result, timestamp: Date.now() });
      return result;
    }

    /**
     * Validates a Torn API key by calling /key/info.
     * On success, stores the key in this instance (not persisted).
     * @param {string} api_key
     * @returns {Promise<boolean>} true if valid, false otherwise.
     */
    async validateKey(api_key) {
      if (!api_key || typeof api_key !== 'string' || api_key.length < 8) {
        if (DEBUG_MODE) console.log('[Racing+]: API key rejected by local validation.');
        return false;
      }
      const prevKey = this.key;
      this.key = api_key; // use candidate key for the probe call
      try {
        const data = await this.request('key/info', { timestamp: `${getUnixTimestamp()}` });
        if (data?.info?.access && Number(data.info.access.level) >= AccessLevel.Minimal) {
          if (DEBUG_MODE) console.log('[Racing+]: API key validated.');
          return true;
        }
        if (DEBUG_MODE) console.log('[Racing+]: API key invalid (unexpected response).');
        this.key = prevKey;
        return false;
      } catch (err) {
        if (DEBUG_MODE) console.log(`Racing+ ${err}`);
        this.key = prevKey;
        return false;
      }
    }

    // Stores API key in local settings (idempotent).
    saveKey() {
      if (!this.key) return;
      STORE.setValue('RACINGPLUS_APIKEY', this.key);
      if (DEBUG_MODE) console.log('[Racing+]: API Key saved.');
    }

    // Removes API key from settings and memory.
    deleteKey() {
      this.key = null;
      STORE.deleteValue('RACINGPLUS_APIKEY');
      if (DEBUG_MODE) console.log('[Racing+]: API Key deleted.');
    }
  }

  /* ------------------------------------------------------------------------
   * Models
   * --------------------------------------------------------------------- */

  /**
   * TornRace - helper to compile race meta and compute status.
   * @param {object} init
   */
  class TornRace {
    constructor(init = {}) {
      this.id = init.id ?? null;
      this.trackid = init.trackid ?? null;
      this.title = init.title ?? '';
      this.distance = init.distance ?? null;
      this.laps = init.laps ?? null;
      this.status = 'unknown';
    }

    /**
     * Updates the track status from the info spot text.
     * @param {string} info_spot
     * @returns {'unknown'|'racing'|'finished'|'waiting'|'joined'}
     */
    updateStatus(info_spot) {
      const text = (info_spot ?? '').toLowerCase();
      switch (text) {
        case '':
          this.status = 'unknown';
          break;
        case 'race started':
        case 'race in progress':
          this.status = 'racing';
          break;
        case 'race finished':
          this.status = 'finished';
          break;
        default:
          // Case-insensitive check for "Starts:" marker
          if (text.includes('starts:')) {
            this.status = 'waiting';
          } else {
            this.status = 'joined';
          }
          break;
      }
    }

    updateLeaderBoard(drivers) {
      if (DEBUG_MODE) console.log('[Racing+]: Updating Leaderboard...');

      // Wait for racers to load then enumerate
      Array.from(drivers).forEach(async (drvr) => {
        let driverId = drvr.id.substring(4);
        let driverStatus = drvr.querySelector('.status');
        if (driverStatus) {
          // fix status icon
          switch (this.status) {
            case 'joined':
              driverStatus.className = 'status success';
              driverStatus.textContent = '';
              break;
            case 'waiting':
              driverStatus.className = 'status waiting';
              driverStatus.textContent = '';
              break;
            case 'racing':
              driverStatus.className = 'status racing';
              driverStatus.textContent = '';
              break;
            case 'finished':
            default:
              break;
          }
        }
        // Fix driver colours
        let drvrColour = drvr.querySelector('li.color');
        if (drvrColour) {
          drvrColour.classList.remove('color');
          drvr.querySelector('li.name span').className = drvrColour.className;
        }
        // Add driver profile links
        if (STORE.getValue('rplus_addlinks') === '1') {
          // Add links
          if (!drvr.querySelector('li.name a')) {
            drvr.querySelector('li.name span').outerHTML = `<a target="_blank" href="/profiles.php?XID=${driverId}">${drvr.querySelector('li.name span').outerHTML}</a>`;
          }
        } else {
          // Remove links
          if (drvr.querySelector('li.name a')) {
            drvr.querySelector('li.name').innerHTML = `${drvr.querySelector('li.name a').innerHTML}`;
          }
        }
        // Fix driver race stats
        if (!drvr.querySelector('.statistics')) {
          // Add stats container
          drvr.querySelector('.name').insertAdjacentHTML('beforeEnd', `<div class="statistics"></div>`);
        }
        let stats = drvr.querySelector('.statistics');
        // Adjust time
        let timeLi = drvr.querySelector('li.time');
        if (timeLi) {
          if (timeLi.textContent === '') {
            timeLi.textContent = '0.00 %';
          }
          let timeContainer = document.createElement('ul');
          timeContainer.appendChild(timeLi);
          stats.insertAdjacentElement('afterEnd', timeContainer);
        }
        // Show driver speed
        if (STORE.getValue('rplus_showspeed') === '1') {
          if (!drvr.querySelector('.speed')) {
            stats.insertAdjacentHTML('beforeEnd', '<div class="speed">0.00mph</div>');
          }
          if (!['joined', 'finished'].includes(racestatus) && !speedIntervalByDriverId.has(driverId)) {
            if (DEBUG_MODE) {
              console.log(`Racing+: Adding speed interval for driver ${driverId}.`);
            }
            speedIntervalByDriverId.set(driverId, setInterval(updateSpeed, SPEED_INTERVAL, trackData, driverId));
          }
        }
        // Show driver skill
        if (STORE.getValue('rplus_showskill') === '1') {
          if (!drvr.querySelector('.skill')) {
            stats.insertAdjacentHTML('afterBegin', '<div class="skill">RS: ?</div>');
          }
          if (apikey) {
            // Fetch racing skill data from the Torn API for the given driver id
            try {
              let user = await torn_api(apikey, `user/${driverId}/personalStats`, 'stat=racingskill');
              if (user) {
                let skill = stats.querySelector('.skill');
                skill.textContent = `RS: ${user.personalstats.racing.skill}`;
              }
            } catch (err) {
              console.log(`Racing+ Error: ${err.error ?? err}`);
            }
          }
        }
      });
    }
  }

  /**
   * TornDriver - Stores skill and per-track best records for current user.
   */
  class TornDriver {
    constructor(driver_id) {
      this.id = driver_id;
      this.skill = 0;
      this.records = {};
      this.cars = {};
    }

    /** Load cached driver data from localStorage (idempotent). */
    load() {
      const raw = STORE.getValue('RACINGPLUS_DRIVER');
      if (!raw) return;
      try {
        const driver = JSON.parse(raw);
        if (driver && driver.id === this.id) {
          this.skill = Number(driver.skill) || 0;
          this.records = driver.records || {};
          this.cars = driver.cars || {};
        }
      } catch {
        // Ignore corrupt cache
      }
    }

    /** Persist driver data. */
    save() {
      const payload = JSON.stringify({
        id: this.id,
        skill: this.skill,
        records: this.records,
        cars: this.cars,
      });
      STORE.setValue('RACINGPLUS_DRIVER', payload);
    }

    /**
     * Update stored skill if newer value is higher (skill increases only).
     * @param {number|string} skill
     */
    updateSkill(skill) {
      const v = Number(skill);
      if (Number.isFinite(v)) {
        this.skill = Math.max(this.skill, v);
        this.save();
      }
    }

    /**
     * Store the best lap record for a given track.
     * Keeps the smallest lap_time; ties can be handled elsewhere if needed.
     */
    async updateRecords() {
      try {
        const results = await torn_api.request('user/racingrecords', { timestamp: `${getUnixTimestamp()}` });
        if (Array.isArray(results?.racingrecords)) {
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
          this.save();
        }
      } catch (err) {
        if (DEBUG_MODE) console.warn('[Racing+]: racing records fetch failed:', err);
      }
    }

    /** Fetch and store enlisted cars. Hooks win-rate calc if feature flag is enabled. */
    async updateCars() {
      try {
        const results = await torn_api.request('user/enlistedcars', { timestamp: `${getUnixTimestamp()}` });
        if (Array.isArray(results?.enlistedcars)) {
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
                win_rate: car.races_won / car.races_entered,
              };
              return acc;
            }, {});
          this.save();
        }
      } catch (err) {
        if (DEBUG_MODE) console.warn('[Racing+]: enlisted cars fetch failed:', err);
      }
    }
  }

  /* ------------------------------------------------------------------------
   * Utilities
   * --------------------------------------------------------------------- */

  /**
   * Returns an array of record objects with the best (smallest) lap_time.
   * Includes multiple records if they tie on lap_time but have different car_id.
   * @param {Array<{lap_time:number,car_id?:number}>} records
   * @returns {Array}
   */
  function getBestLapCars(records) {
    if (!Array.isArray(records) || records.length === 0) return [];
    const minLap = Math.min(...records.map((r) => r.lap_time));
    return records.filter((r) => r.lap_time === minLap);
  }

  /* ------------------------------------------------------------------------
   * Helper Methods
   * --------------------------------------------------------------------- */

  /**
   * addRaceLinkCopyButton -
   */
  async function addRaceLinkCopyButton(raceId) {
    // Check if the race link already exists
    if (!document.querySelector('.racing-plus-link-wrap .race-link')) {
      let trackInfo = await defer('.track-info-wrap');
      let racelink_html =
        '<div class="racing-plus-link-wrap">' +
        `<a class="race-link" title="Copy link" href="https://www.torn.com/loader.php?sid=racing&tab=log&raceID=${raceId}">` +
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-2 -2 20 20" fill="currentColor" stroke-width="0">' +
        '<g><path d="M4.126,5.813a4.279,4.279,0,0,1,6.593.655l-1.5,1.5a2.257,2.257,0,0,0-2.556-1.3,2.22,2.22,0,0,0-1.089.6l-2.87,2.871a2.235,2.235,0,0,0,3.16,3.16l.885-.885a5.689,5.689,0,0,0,2.52.383L7.319,14.746A4.287,4.287,0,0,1,1.256,8.684l2.87-2.871ZM8.684,1.256,6.731,3.208a5.69,5.69,0,0,1,2.52.383l.884-.884a2.235,2.235,0,0,1,3.16,3.16l-2.87,2.87a2.239,2.239,0,0,1-3.16,0,2.378,2.378,0,0,1-.485-.7l-1.5,1.5a4.026,4.026,0,0,0,.531.655,4.282,4.282,0,0,0,6.062,0l2.87-2.87A4.286,4.286,0,1,0,8.684,1.256Z"></path></g>' +
        '</svg>' +
        '</a>' +
        '</div>';
      // Append the link to the info container
      trackInfo.insertAdjacentHTML('afterEnd', racelink_html);

      // Add click event listener to the race link
      let raceLink = await defer('.racing-plus-link-wrap .race-link');
      raceLink.addEventListener('click', async (event) => {
        event.preventDefault();
        // Copy the race link to clipboard using w.setClipboard
        w.setClipboard(`https://www.torn.com/loader.php?sid=racing&tab=log&raceID=${raceId}`);
        // Try to find the tooltip and update its content
        const tooltipId = event.currentTarget.getAttribute('aria-describedby');
        if (tooltipId) {
          const tooltip = document.querySelector(`#${tooltipId} .ui-tooltip-content`);
          if (tooltip && tooltip.firstChild) {
            tooltip.firstChild.nodeValue = 'Copied';
            const tooltipDiv = tooltip.closest('div');
            if (tooltipDiv) {
              const currentLeft = parseFloat(tooltipDiv.style.left || '0');
              tooltipDiv.style.left = `${currentLeft + 6}px`;
            }
          }
        }
      });
    }
  }

  /* ------------------------------------------------------------------------
   * Feature loaders
   * --------------------------------------------------------------------- */

  /**
   * loadPartsAndModifications - Injects/updates the Parts and Modifications tab content.
   */
  async function loadPartsAndModifications() {
    let categories = {};
    // Select all category list items except those with .empty or .clear
    let elems = await deferAll('.pm-categories li:not(.empty):not(.clear)');
    Array.from(elems).forEach((category) => {
      // Get the category id
      const cat = category.getAttribute('data-category');
      // Get the category name from classList (excluding 'unlock')
      let categoryName = [...category.classList].find((c) => c !== 'unlock');
      // Initialize bought and unbought arrays for this category
      categories[cat] = { bought: [], unbought: [] };
      // Select all parts that belong to this category and have a valid data-part attribute
      const parts = document.querySelectorAll(`.pm-items li.${categoryName}[data-part]:not([data-part=""])`);
      parts.forEach((part) => {
        let groupName = part.getAttribute('data-part');
        if (part.classList.contains('bought')) {
          // Add to bought if not already included
          if (!categories[cat].bought.includes(groupName)) {
            categories[cat].bought.push(groupName);
          }
          // Replace 'bought' with 'active' on the control.
          part.classList.toggle('bought', false);
          part.classList.toggle('active', true);
        } else {
          // Add to unbought if not already included
          if (!categories[cat].unbought.includes(groupName)) {
            categories[cat].unbought.push(groupName);
          }
        }
      });
      // Remove any group from unbought that exists in bought
      categories[cat].bought.forEach((b) => {
        if (categories[cat].unbought.includes(b)) {
          let bought = document.querySelectorAll(`.pm-items li.${categoryName}[data-part="${b}"]`);
          bought.forEach((el) => {
            if (!el.classList.contains('active')) {
              el.classList.toggle('bought', true);
            }
          });
          // Remove from unbought
          categories[cat].unbought.splice(categories[cat].unbought.indexOf(b), 1);
        }
      });
      // Create a div showing the count of bought/unbought parts
      const divParts = document.createElement('div');
      let boughtParts = Object.keys(categories[cat].bought).length;
      let totalParts = boughtParts + Object.keys(categories[cat].unbought).length;
      divParts.className = boughtParts === totalParts ? 'parts bought' : 'parts';
      divParts.innerHTML = `${boughtParts} / ${totalParts}`;
      // Insert the parts count div after the icon element
      const iconContainer = category.querySelector('a.link div.icons div.icon');
      if (iconContainer) {
        iconContainer.insertAdjacentElement('afterend', divParts);
      }
    });
    // Add available parts sections
    const links = await deferAll('.pm-categories li a.link');
    Array.from(links).forEach(async (link) => {
      let catId = link.parentElement?.getAttribute('data-category');
      let partscat = await defer(`.pm-items-wrap[category="${catId}"]`);
      // Remove existing parts available section.
      const existing = partscat.querySelectorAll('.racing-plus-parts-available');
      existing.forEach((ex) => {
        ex.remove();
      });
      // Create new parts available section.
      const div = document.createElement('div');
      div.className = 'racing-plus-parts-available';
      let content = Object.entries(categories[catId].unbought)
        .sort(([, a], [, b]) => a.localeCompare(b)) // Sort by value
        .map(([key, val]) => `<span data-part="${val}">${val.replace('Tyres', 'Tires')}</span>`)
        .join(', ');
      div.innerHTML = `<span class="bold nowrap">Parts Available:</span><span>${content.length > 0 ? content : 'None'}</span>`;
      let titlediv = partscat.querySelector('.title-black');
      titlediv.insertAdjacentHTML('afterEnd', div.outerHTML);
    });

    let props = await deferAll('.properties-wrap .properties');
    Array.from(props).forEach((prop) => {
      let propName = prop.querySelector('.name');
      let propVal = prop
        .querySelector('.progress-bar .progressbar-wrap[title]')
        .getAttribute('title')
        .replace(/\s/g, '')
        .match(/[+-]\d+/);
      if (propVal) {
        let propNum = parseInt(propVal[0]);
        propName.insertAdjacentHTML('afterBegin', `<span class="${propNum > 0 ? 'positive' : propNum < 0 ? 'negative' : ''}">${propVal[0]}%</span> `);
      }
    });
  }

  /**
   * loadOfficialEvents - Injects/updates the Official Events tab content.
   */
  async function loadOfficialEvents() {
    if (DEBUG_MODE) console.log('[Racing+]: Loading Official Events tab...');

    // Fix active tab
    d.querySelectorAll('#racingMainContainer ul.categories li').forEach((c) => {
      c.classList.toggle('active', c.querySelector('.official-events') ? true : false);
    });

    // Resolve the current race ID for this driver
    const thisDriverBoard = await defer(`.drivers-list #leaderBoard #lbr-${this_driver.id}`);
    const dataId = thisDriverBoard.getAttribute('data-id') || '';
    const raceId = dataId.split('-')[0];

    // If new race track, capture the track meta
    if (!this_race || this_race.id !== raceId) {
      if (DEBUG_MODE) console.log('[Racing+]: Loading Race Data...');
      const racingupdates = await defer('#racingupdates .drivers-list .title-black');
      const trackInfo = racingupdates.querySelector('.track-info');

      const distRaw = (trackInfo?.getAttribute('data-length') ?? '').trim(); // e.g., "2.42mi"
      const distNum = parseFloat(distRaw);
      const lapsText = (racingupdates.textContent ?? '').split(' - ')[1]?.split(' ')[0] ?? '';
      const lapsNum = Number.parseInt(lapsText, 10);

      this_race = new TornRace({
        raceid: raceId,
        title: trackInfo?.getAttribute('title') ?? '',
        distance: Number.isFinite(distNum) ? distNum : null,
        laps: Number.isFinite(lapsNum) ? lapsNum : null,
      });
    }

    let drivers = await deferAll('#leaderBoard li[id^=lbr-]');
    drivers.forEach((drvr) => {
      drvr.addEventListener('click', async (event) => {
        event.preventDefault();
        //await setBestLap(event.currentTarget.id.substring(4));
      });
    });
    // Update the leaderboard
    this_race.updateLeaderBoard(drivers || []);

    // Add race link copy button
    if (STORE.getValue(STORE.getKey('rplus_showracelink')) === '1') {
      await addRaceLinkCopyButton(this_race.id);
    }

    // Update labels (save some horizontal space).
    d.querySelectorAll('#racingdetails li.pd-name').forEach((detail) => {
      if (detail.textContent === 'Name:') detail.remove();
      if (detail.textContent === 'Position:') detail.textContent = 'Pos:';
      if (detail.textContent === 'Last Lap:') {
        detail.textContent = 'Last:';
        detail.classList.toggle('t-hide', false);
      }
      if (detail.textContent === 'Completion:') {
        detail.textContent = 'Best:';
        detail.classList.toggle('m-hide', false);
      }
    });

    // Update laptime value
    let laptime = document.querySelector('#racingdetails li.pd-laptime');
    laptime.classList.toggle('t-hide', false);
    // Update best laptime value
    let besttime = document.querySelector('#racingdetails li.pd-completion');
    besttime.classList.toggle('t-hide', false);
    besttime.textContent = '--:--';
  }

  /**
   * loadEnlistedCars - Injects/updates the Enlisted Cars tab content.
   */
  async function loadEnlistedCars() {
    document.querySelectorAll('.enlist-list .enlist-info .enlisted-stat').forEach((ul) => {
      let wonRaces = ul.children[0].textContent.replace(/[\n\s]/g, '').replace('•Raceswon:', '');
      let totalRaces = ul.children[1].textContent.replace(/[\n\s]/g, '').replace('•Racesentered:', '');
      ul.children[0].textContent = `• Races won: ${wonRaces} / ${totalRaces}`;
      ul.children[1].textContent = `• Win rate: ${totalRaces <= 0 ? 0 : Math.round((wonRaces / totalRaces) * 10000) / 100}%`;
    });
  }

  /**
   * addStyles - Injects Racing+ CSS into document head.
   * (Original stylesheet retained; dynamic color rules generated for categories)
   */
  async function addStyles() {
    if (DEBUG_MODE) console.log('[Racing+]: Adding styles...');
    if (!d.head) await new Promise((r) => w.addEventListener('DOMContentLoaded', r, { once: true }));

    const s = d.createElement('style');
    s.innerHTML = `.d .racing-plus-footer:before,.d .racing-plus-header:after{position:absolute;display:block;content:"";height:0;width:100%;left:0}.d .racing-plus-window{margin:10px 0;padding:0;display:none}.d .racing-plus-window .show{display:block}.d .racing-plus-header{position:relative;padding-left:10px;height:30px;line-height:30px;font-size:12px;font-weight:700;letter-spacing:0;text-shadow:0 0 2px rgba(0,0,0,.5019607843);text-shadow:var(--tutorial-title-shadow);color:#fff;color:var(--tutorial-title-color);border:0!important;border-radius:5px 5px 0 0;background:linear-gradient(180deg,#888 0,#444 100%)}.d.dark-mode .racing-plus-header{background:linear-gradient(180deg,#555 0,#333 100%)}.d .racing-plus-header:after{bottom:-1px;border-top:1px solid #999;border-bottom:1px solid #ebebeb}.d.dark-mode .racing-plus-header:after{border-bottom:1px solid #222;border-top:1px solid #444}.d .racing-plus-footer{position:relative;margin:0;padding:0;height:10px;border:0!important;border-radius:0 0 5px 5px;background:linear-gradient(0deg,#888 0,#444 100%)}.d.dark-mode .racing-plus-footer{background:linear-gradient(0deg,#555 0,#333 100%)}.d .racing-plus-footer:before{top:-1px;border-bottom:1px solid #999;border-top:1px solid #ebebeb}.d.dark-mode .racing-plus-footer:before{border-top:1px solid #222;border-bottom:1px solid #444}.d .racing-plus-main{margin:0;padding:5px 10px;background-color:#f2f2f2}.d.dark-mode .racing-plus-main{background-color:#2e2e2e}.d .racing-plus-settings{display:grid;grid-template-columns:auto min-content;grid-template-rows:repeat(6,min-content);grid-gap:0}.d .racing-plus-settings label{padding:6px 5px;font-size:.7rem;white-space:nowrap}.d .racing-plus-settings div{padding:0 5px;font-size:.7rem;text-align:right;position:relative}.d .racing-plus-settings div.flex-col{padding:6px 0 0}.d .racing-plus-settings div,.d .racing-plus-settings label{border-bottom:2px groove #ebebeb}.d.dark-mode .racing-plus-settings div,.d.dark-mode .racing-plus-settings label{border-bottom:2px groove #444}.d .racing-plus-settings div:last-of-type,.d .racing-plus-settings label:last-of-type{border-bottom:0}.d .racing-plus-settings div input[type=checkbox]{vertical-align:middle;height:11px;margin:5px 0}#rplus_apikey{text-align:right;vertical-align:middle;width:120px;height:13px;margin:0;padding:0 4px;border-radius:3px;border:1px solid #ccc;border-color:var(--input-disabled-border-color)}#rplus_apikey .valid{border-color:#0c0!important}#rplus_apikey .invalid{border-color:red!important}.d .flex-col{display:flex;flex-direction:column}.d .nowrap{white-space:nowrap!important}.d .racing-plus-apikey-actions{margin-right:10px;vertical-align:middle}.d .racing-plus-apikey-status{vertical-align:middle;color:red;padding:5px;font-size:.6rem}.d .racing-plus-apikey-reset,.d .racing-plus-apikey-save{cursor:pointer;vertical-align:middle;margin:0 0 2px;padding:0;height:15px;width:15px;display:none}.d .racing-plus-apikey-reset.show,.d .racing-plus-apikey-save.show{display:inline-block!important}.d .racing-plus-apikey-reset svg path,.d .racing-plus-apikey-save svg path{fill:#666;fill:var(--top-links-icon-svg-fill);filter:drop-shadow(0 1px 0 rgba(255, 255, 255, .6509803922));filter:var(--top-links-icon-svg-shadow)}.d .racing-plus-apikey-reset:hover svg path,.d .racing-plus-apikey-save:hover svg path{fill:#444;fill:var(--top-links-icon-svg-hover-fill);filter:drop-shadow(0 1px 0 rgba(255, 255, 255, .6509803922));filter:var(--top-links-icon-svg-hover-shadow)}.d .racing-plus-parts-available{display:flex;flex-direction:row;gap:10px;font-style:italic;padding:10px;font-size:.7rem;background:url("/images/v2/racing/header/stripy_bg.png") #2e2e2e}.d .left-banner,.d .right-banner{height:57px;top:44px;position:absolute;border-top:1px solid #424242;border-bottom:1px solid #424242;background:url(/images/v2/racing/header/stripy_bg.png)}.d .racing-plus-parts-available:after{position:absolute;left:0;bottom:-1px;content:"";display:block;height:0;width:100%;border-bottom:1px solid #222;border-top:1px solid #444}.d .racing-plus-link-wrap .export-link,.d .racing-plus-link-wrap .race-link{width:20px;float:right;filter:drop-shadow(0px 0px 1px rgba(17, 17, 17, .5803921569));height:20px}.d .pm-categories .link .icons .parts{position:absolute;bottom:5px;left:5px;color:#00bfff}.d .pm-categories .link .icons .parts.bought{color:#0c0}.d .racing-main-wrap .pm-items-wrap .part-wrap .l-delimiter,.d .racing-main-wrap .pm-items-wrap .part-wrap .r-delimiter,.d .racing-main-wrap .pm-items-wrap .pm-items>li .b-delimiter{height:0!important;width:0!important}.d .racing-main-wrap .pm-items-wrap .pm-items .active .properties-wrap>li .name,.d .racing-main-wrap .pm-items-wrap .pm-items .active .properties-wrap>li .progress-bar,.d .racing-main-wrap .pm-items-wrap .pm-items .bought .properties-wrap>li .name,.d .racing-main-wrap .pm-items-wrap .pm-items .bought .properties-wrap>li .progress-bar{background:unset!important}.d .racing-main-wrap .pm-items-wrap .pm-items .active,.d .racing-main-wrap .pm-items-wrap .pm-items .active .title{background:rgba(0,191,255,.07)}.d .racing-main-wrap .pm-items-wrap .pm-items .active .info{color:#00bfff}.d .racing-main-wrap .pm-items-wrap .pm-items .name .positive{color:#9c0}.d .racing-main-wrap .pm-items-wrap .pm-items .active .name .positive{color:#00a9f9}.d .racing-main-wrap .pm-items-wrap .pm-items .name .negative{color:#e54c19}.d .racing-main-wrap .pm-items-wrap .pm-items .active .name .negative{color:#ca9800}.d .racing-main-wrap .pm-items-wrap .pm-items .bought,.d .racing-main-wrap .pm-items-wrap .pm-items .bought .title{background:rgba(133,178,0,.07)}.d .racing-main-wrap .pm-items-wrap .pm-items .bought .desc{color:#85b200}.d .racing-plus-link-wrap{cursor:pointer;float:right}.d .racing-plus-link-wrap .race-link{margin:4px 5px 6px}.d .racing-plus-link-wrap .export-link:hover,.d .racing-plus-link-wrap .race-link:hover{filter:drop-shadow(1px 1px 1px rgba(17, 17, 17, .5803921569))}.d .racing-plus-link-wrap .export-link{margin:5px}.d .racing-main-wrap .car-selected-wrap #drivers-scrollbar{overflow:hidden!important;max-height:none!important}.d .racing-main-wrap .car-selected-wrap .driver-item>li.status-wrap .status{margin:5px!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item{font-size:.7rem!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.car{padding:0 5px}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name{width:unset!important;display:flex;align-items:center;flex-grow:1;border-right:0}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name a{flex-basis:fit-content;width:unset!important;height:20px;padding:0;margin:0;display:block;text-decoration:none}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name a:hover{text-decoration:underline}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span{display:block;flex-basis:fit-content;width:unset!important;height:20px;line-height:1.3rem;font-size:.7rem;padding:0 7px;margin:0;border-radius:3px;white-space:nowrap;color:#fff;background:rgba(0,0,0,.25)}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-1{background:rgba(116,232,0,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-2{background:rgba(255,38,38,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-3{background:rgba(255,201,38,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-4{background:rgba(0,217,217,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-5{background:rgba(0,128,255,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-6{background:rgba(153,51,255,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-7{background:rgba(255,38,255,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-8{background:rgba(85,85,85,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-9{background:rgba(242,141,141,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-10{background:rgba(225,201,25,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-11{background:rgba(160,207,23,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-12{background:rgba(24,217,217,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-13{background:rgba(111,175,238,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-14{background:rgba(176,114,239,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-15{background:rgba(240,128,240,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-16{background:rgba(97,97,97,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-17{background:rgba(178,0,0,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-18{background:rgba(204,153,0,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-19{background:rgba(78,155,0,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-20{background:rgba(0,157,157,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-21{background:rgba(0,0,183,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-22{background:rgba(140,0,140,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name div.statistics{display:flex;flex-grow:1;list-style:none;align-items:center;justify-content:space-between;padding:0 10px;margin:0}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.time{display:none}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name div.statistics div,.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name li.time{flex-basis:fit-content;line-height:22px;height:22px;width:unset!important;padding:0 5px;margin:0;border-radius:3px;white-space:nowrap;background-color:rgba(0,0,0,.25)}.d .left-banner{width:150px;left:0;border-right:1px solid #424242;border-top-right-radius:5px;border-bottom-right-radius:5px;box-shadow:5px 0 10px -2px rgba(0,0,0,.5),0 5px 10px -2px rgba(0,0,0,.5)}.d .racing-main-wrap .header-wrap .banner .skill-desc{width:130px!important;top:15px!important;left:8px!important;font-size:1rem!important}.d .racing-main-wrap .header-wrap .banner .skill{top:33px!important;left:10px!important;font-size:.8rem!important}.d .racing-main-wrap .header-wrap .banner .lastgain{top:33px;left:75px;color:#0f0;position:absolute;font-size:.6rem!important}.d .right-banner{width:115px;right:0;border-left:1px solid #424242;border-top-left-radius:5px;border-bottom-left-radius:5px;box-shadow:-5px 0 10px -2px rgba(0,0,0,.5),0 5px 10px -2px rgba(0,0,0,.5)}.d .racing-main-wrap .header-wrap .banner .class-desc{right:40px!important;top:23px!important;font-size:1rem!important}.d .racing-main-wrap .header-wrap .banner .class-letter{right:12px!important;top:22px!important;font-size:1.5rem!important}@media screen and (max-width:784px){.d .racing-main-wrap .header-wrap .banner .class-desc,.d .racing-main-wrap .header-wrap .banner .skill-desc{font-size:.8rem!important;top:10px!important}.d .racing-main-wrap .header-wrap .banner .skill{top:10px!important;left:125px!important}.d .racing-main-wrap .header-wrap .banner .lastgain{top:10px!important;left:190px}.d .racing-main-wrap .header-wrap .banner .class-letter{top:10px!important;font-size:1.25rem!important}.d .left-banner,.d .right-banner{top:0;background-image:none!important;border:none!important;box-shadow:none!important}}`;

    // Dynamic per-part color hints (batched for fewer string writes).
    const dynRules = [];
    Object.entries(CATEGORIES).forEach(([, parts]) => {
      parts.forEach((g, i) => {
        dynRules.push(
          `.d .racing-plus-parts-available span[data-part="${g}"]{color:${COLOURS[i]};}`,
          `.d .racing-main-wrap .pm-items-wrap .pm-items li[data-part="${g}"]:not(.bought):not(.active) .status{background-color:${COLOURS[i]};background-image:unset;}`,
          `.d .racing-main-wrap .pm-items-wrap .pm-items li[data-part="${g}"]:not(.bought):not(.active) .bg-wrap .title{background-color:${COLOURS[i]}40;}`
        );
      });
    });
    s.innerHTML += dynRules.join('');
    d.head.appendChild(s);
    if (DEBUG_MODE) console.log('[Racing+]: Styles added.');
  }

  /**
   * loadRacingPlus - Builds the Racing+ settings UI, binds events, wires API,
   * adjusts header banner, and primes initial content.
   */
  async function loadRacingPlus() {
    // Load Torn API key (from PDA or local storage)
    let api_key = IS_PDA ? PDA_KEY : STORE.getValue('RACINGPLUS_APIKEY');
    if (api_key) {
      if (DEBUG_MODE) console.log('[Racing+]: Loading Torn API...');
      // validate torn api key; if invalid, we'll leave the input editable
      const ok = await torn_api.validateKey(api_key);
      if (!ok) {
        torn_api.deleteKey();
        api_key = '';
      }
    }

    // Load driver data
    if (DEBUG_MODE) console.log('[Racing+]: Loading Driver Data...');
    // Typically a hidden input with JSON { id, ... }
    const scriptData = await defer('#torn-user');
    this_driver = new TornDriver(JSON.parse(scriptData.value).id);
    this_driver.load();

    if (DEBUG_MODE) console.log('[Racing+]: Loading DOM...');
    try {
      // Add the Racing+ window (settings panel)
      if (!d.querySelector('div.racing-plus-window')) {
        const raceway = await defer('#racingMainContainer');
        const rpw = d.createElement('div');
        rpw.className = 'racing-plus-window';
        rpw.innerHTML = `
<div class="racing-plus-header">Racing+</div>
<div class="racing-plus-main">
  <div class="racing-plus-settings">
    <label for="rplus_apikey">API Key</label>
    <div class="flex-col">
      <div class="nowrap">
        ${
          IS_PDA
            ? ''
            : `
        <span class="racing-plus-apikey-actions">
          <button type="button" class="racing-plus-apikey-save" aria-label="Save">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="2 2 20 20" version="1.1">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M7 2C4.23858 2 2 4.23858 2 7V17C2 19.7614 4.23858 22 7 22H17C19.7614 22 22 19.7614 22 17V8.82843C22 8.03278 21.6839 7.26972 21.1213 6.70711L17.2929 2.87868C16.7303 2.31607 15.9672 2 15.1716 2H7ZM7 4C6.44772 4 6 4.44772 6 5V7C6 7.55228 6.44772 8 7 8H15C15.5523 8 16 7.55228 16 7V5C16 4.44772 15.5523 4 15 4H7ZM12 17C13.6569 17 15 15.6569 15 14C15 12.3431 13.6569 11 12 11C10.3431 11 9 12.3431 9 14C9 15.6569 10.3431 17 12 17Z" />
            </svg>
          </button>
          <button type="button" class="racing-plus-apikey-reset" aria-label="Reset">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" version="1.1">
              <path d="M790.2 590.67l105.978 32.29C847.364 783.876 697.86 901 521 901c-216.496 0-392-175.504-392-392s175.504-392 392-392c108.502 0 206.708 44.083 277.685 115.315l-76.64 76.64C670.99 257.13 599.997 225 521.5 225 366.032 225 240 351.032 240 506.5 240 661.968 366.032 788 521.5 788c126.148 0 232.916-82.978 268.7-197.33z"/>
              <path d="M855.58 173.003L650.426 363.491l228.569 32.285z"/>
            </svg>
          </button>
        </span>
        `
        }
        <input type="text" id="rplus_apikey" maxlength="16" />
      </div>
      <span class="racing-plus-apikey-status"></span>
    </div>

    <label for="rplus_addlinks">Add profile links</label><div><input type="checkbox" id="rplus_addlinks" /></div>
    <label for="rplus_showskill">Show racing skill</label><div><input type="checkbox" id="rplus_showskill" /></div>
    <label for="rplus_showspeed">Show current speed</label><div><input type="checkbox" id="rplus_showspeed" /></div>
    <label for="rplus_showracelink">Add race link</label><div><input type="checkbox" id="rplus_showracelink" /></div>
    <label for="rplus_showexportlink">Add export link</label><div><input type="checkbox" id="rplus_showexportlink" /></div>
    <label for="rplus_showwinrate">Show car win rate</label><div><input type="checkbox" id="rplus_showwinrate" /></div>
    <label for="rplus_showparts">Show available parts</label><div><input type="checkbox" id="rplus_showparts" /></div>
  </div>
</div>
<div class="racing-plus-footer"></div>`;

        raceway.insertAdjacentElement('beforeBegin', rpw);

        /** @type {HTMLInputElement} */
        const apiInput = d.querySelector('#rplus_apikey');
        const apiSave = d.querySelector('.racing-plus-apikey-save');
        const apiReset = d.querySelector('.racing-plus-apikey-reset');
        const apiStatus = d.querySelector('.racing-plus-apikey-status');

        // Initialize API key UI
        if (IS_PDA) {
          if (api_key && apiInput) apiInput.value = api_key;
          if (apiInput) {
            apiInput.disabled = true;
            apiInput.readOnly = true;
          }
          if (apiStatus) apiStatus.textContent = 'Edit in TornPDA settings.';
          apiSave?.classList.toggle('show', false);
          apiReset?.classList.toggle('show', false);
        } else {
          if (api_key && apiInput) {
            apiInput.value = api_key;
            apiInput.disabled = true;
            apiInput.readOnly = true;
            if (apiStatus) apiStatus.textContent = '';
            apiSave?.classList.toggle('show', false);
            apiReset?.classList.toggle('show', true);
          } else {
            if (apiInput) {
              apiInput.disabled = false;
              apiInput.readOnly = false;
            }
            if (apiStatus) apiStatus.textContent = '';
            apiSave?.classList.toggle('show', true);
            apiReset?.classList.toggle('show', false);
          }

          // Save button handler
          apiSave?.addEventListener('click', async (ev) => {
            ev.preventDefault();
            if (!apiInput) return;
            const candidate = apiInput.value.trim();
            const ok = await torn_api.validateKey(candidate);
            apiInput.classList.remove('valid', 'invalid');
            if (ok) {
              apiInput.classList.add('valid');
              torn_api.saveKey();
              apiInput.disabled = true;
              apiInput.readOnly = true;
              apiSave.classList.toggle('show', false);
              apiReset?.classList.toggle('show', true);
              if (apiStatus) apiStatus.textContent = '';
            } else {
              apiInput.classList.add('invalid');
              if (apiStatus) apiStatus.textContent = 'Invalid API key.';
            }
          });

          // Reset button handler
          apiReset?.addEventListener('click', (ev) => {
            ev.preventDefault();
            if (!apiInput) return;
            apiInput.value = '';
            apiInput.disabled = false;
            apiInput.readOnly = false;
            apiInput.classList.remove('valid', 'invalid');
            torn_api.deleteKey();
            apiSave?.classList.toggle('show', true);
            apiReset.classList.toggle('show', false);
            if (apiStatus) apiStatus.textContent = '';
          });
        }

        // Initialize toggles from storage & persist on click
        d.querySelectorAll('.racing-plus-settings input[type=checkbox]').forEach((el) => {
          const key = STORE.getKey(el.id);
          el.checked = STORE.getValue(key) === '1';
          el.addEventListener('click', (ev) => {
            const t = /** @type {HTMLInputElement} */ ev.currentTarget;
            STORE.setValue(key, t.checked ? '1' : '0');
            if (DEBUG_MODE) console.log(`[Racing+]: ${el.id} saved.`);
          });
        });
      }

      // Add the "Racing+" top link button
      if (!d.querySelector('a.racing-plus-button')) {
        const topLinks = await defer('#top-page-links-list');
        const rpb = d.createElement('a');
        rpb.className = 'racing-plus-button t-clear h c-pointer line-h24 right';
        rpb.setAttribute('aria-label', 'Racing+');
        rpb.innerHTML = `
<span class="icon-wrap svg-icon-wrap">
  <span class="link-icon-svg racing">
    <svg xmlns="http://www.w3.org/2000/svg" stroke="transparent" stroke-width="0" width="15" height="14" viewBox="0 0 15 14"><path d="m14.02,11.5c.65-1.17.99-2.48.99-3.82,0-2.03-.78-3.98-2.2-5.44-2.83-2.93-7.49-3.01-10.42-.18-.06.06-.12.12-.18.18C.78,3.7,0,5.66,0,7.69c0,1.36.35,2.69,1.02,3.88.36.64.82,1.22,1.35,1.73l.73.7,1.37-1.5-.73-.7c-.24-.23-.45-.47-.64-.74l1.22-.72-.64-1.14-1.22.72c-.6-1.42-.6-3.03,0-4.45l1.22.72.64-1.14-1.22-.72c.89-1.23,2.25-2.04,3.76-2.23v1.44h1.29v-1.44c1.51.19,2.87.99,3.76,2.23l-1.22.72.65,1.14,1.22-.72c.68,1.63.58,3.48-.28,5.02-.06.11-.12.21-.19.31l-1.14-.88.48,3.5,3.41-.49-1.15-.89c.12-.18.23-.35.33-.53Zm-6.51-4.97c-.64-.02-1.17.49-1.18,1.13s.49,1.17,1.13,1.18,1.17-.49,1.18-1.13c0,0,0-.01,0-.02l1.95-1.88-2.56.85c-.16-.09-.34-.13-.52-.13h0Z"/></svg>
  </span>
</span>
<span class="linkName">Racing+</span>`;
        topLinks.insertAdjacentElement('beforeEnd', rpb);

        // Toggle the settings panel on click
        rpb.addEventListener('click', (ev) => {
          ev.preventDefault();
          d.querySelector('div.racing-plus-window')?.classList.toggle('show');
        });

        if (DEBUG_MODE) console.log('[Racing+]: Settings button added.');
      }
    } catch (err) {
      console.log(`Racing+ Error: ${err}`);
    }

    // Normalize the top banner structure & update skill snapshot
    if (DEBUG_MODE) console.log('[Racing+]: Fixing top banner...');
    const banner = await defer('.banner');
    const leftBanner = d.createElement('div');
    leftBanner.className = 'left-banner';
    const rightBanner = d.createElement('div');
    rightBanner.className = 'right-banner';

    const elements = Array.from(banner.children);
    elements.forEach((el) => {
      if (el.classList.contains('skill-desc') || el.classList.contains('skill') || el.classList.contains('lastgain')) {
        if (el.classList.contains('skill')) {
          // Update driver skill snapshot (persist only if higher)
          this_driver.updateSkill(el.textContent);
          el.textContent = String(this_driver.skill);
        }
        leftBanner.appendChild(el);
      } else if (el.classList.contains('class-desc') || el.classList.contains('class-letter')) {
        rightBanner.appendChild(el);
      }
    });
    banner.innerHTML = '';
    banner.appendChild(leftBanner);
    banner.appendChild(rightBanner);
    if (DEBUG_MODE) console.log('[Racing+]: DOM loaded.');
  }

  /* ------------------------------------------------------------------------
   * App lifecycle
   * --------------------------------------------------------------------- */

  /**
   * Main entry point for Racing+ userscript.
   */
  async function init() {
    if (DEBUG_MODE) console.log('[Racing+]: Initializing...');

    await addStyles(); // Add CSS
    await loadRacingPlus(); // Verify API and build UI

    await this_driver.updateRecords(); // Update track records from API
    await this_driver.updateCars(); // Update available cars from API

    // Add Page observer (track tab changes, race updates, etc.)
    if (DEBUG_MODE) console.log('[Racing+]: Adding Page Observer...');
    const tabContainer = await defer('#racingAdditionalContainer');

    // Use the outer-scoped pageObserver.
    pageObserver = new MutationObserver(async (mutations) => {
      for (const mutation of mutations) {
        // If infospot text changed, update status
        if (mutation.type === 'characterData' || mutation.type === 'childList') {
          /** @type {Node} */
          const tNode = mutation.target;
          const el = tNode.nodeType === Node.ELEMENT_NODE ? tNode : tNode.parentElement;
          if (el && el.id === 'infoSpot') {
            this_race?.updateStatus(el.textContent || '');
            // if (DEBUG_MODE) console.log(`[Racing+]: Race Status Update -> ${this_race.status}.`);
          }
          if (el && el.id === 'leaderBoard') {
            this_race?.updateLeaderBoard(el.childNodes || []);
            // if (DEBUG_MODE) console.log(`[Racing+]: Leader Board Update.`);
          }
        }
        // Handle injected subtrees (new tab content loaded)
        const addedNodes = mutation.addedNodes && mutation.addedNodes.length > 0 ? Array.from(mutation.addedNodes) : [];
        if (addedNodes.length > 0 && !addedNodes.some((node) => node.classList?.contains?.('ajax-preloader'))) {
          if (addedNodes.some((node) => node.id === 'racingupdates')) {
            await loadOfficialEvents();
          } else if (addedNodes.some((node) => node.classList?.contains?.('enlist-wrap'))) {
            await loadEnlistedCars();
          } else if (addedNodes.some((node) => node.classList?.contains?.('pm-categories-wrap')) && STORE.getValue(STORE.getKey('rplus_showparts')) === '1') {
            await loadPartsAndModifications();
          }
        }
      }
    });

    pageObserver.observe(tabContainer, { characterData: true, childList: true, subtree: true });

    // Belt-and-suspenders: disconnect on pagehide/unload
    w.addEventListener(
      'pagehide',
      (e) => {
        disconnectRacingPlusObserver();
        if (DEBUG_MODE) console.log('[Racing+]: pagehide fired', { persisted: e.persisted });
      },
      { once: true }
    );
    w.addEventListener(
      'beforeunload',
      (e) => {
        disconnectRacingPlusObserver();
        if (DEBUG_MODE) console.log('[Racing+]: beforeunload fired.');
      },
      { once: true }
    );

    // Prime initial content
    await loadOfficialEvents();
    if (DEBUG_MODE) console.log('[Racing+]: Initialized.');
  }

  function disconnectRacingPlusObserver() {
    try {
      pageObserver?.disconnect();
    } catch {
      console.log('[Racing+]: Page Observer disconnection error.');
    }
    pageObserver = null;
    if (DEBUG_MODE) console.log('[Racing+]: Page Observer disconnected.');
  }

  // Singletons / shared state
  const torn_api = new TornAPI();
  /** @type {TornDriver} */ let this_driver;
  /** @type {TornRace} */ let this_race;
  /** @type {MutationObserver|null} */ let pageObserver = null;

  if (DEBUG_MODE) console.log('[Racing+]: Script loaded.');

  // Kick off
  init();
})(window);

// End of file: RacingPlus.user.js
