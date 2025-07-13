// ==UserScript==
// @name         Torn PDA - Racing+
// @namespace    TornPDA.RacingPlus
// @version      0.28
// @description  Show racing skill, current speed, race results, precise skill, upgrade parts.
// @author       moldypenguins [2881784] - Adapted from Lugburz [2386297]
// @match        https://www.torn.com/loader.php?sid=racing*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @updateURL    https://github.com/moldypenguins/TornPDA/raw/main/RacingPlus.user.js
// @downloadURL  https://github.com/moldypenguins/TornPDA/raw/main/RacingPlus.user.js
// @connect      api.torn.com
// @run-at       document-end
// ==/UserScript==

(async () => {
  'use strict';

  //TODO:
  // Export Link (csv)
  // Last Lap
  // Best Lap
  // Speed

  // TornPDA
  let API_KEY = '###PDA-APIKEY###';

  //const SPEED_INTERVAL = 1000; // Amount of time in milliseconds between speed updates.
  const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

  const RPS = {
    getValue(key) {
      return localStorage.getItem(key);
    },
    setValue(key, value) {
      localStorage.setItem(key, value);
    },
    deleteValue(key) {
      localStorage.removeItem(key);
    },
    addStyle(style) {
      if (!style) {
        return;
      }
      const s = document.createElement('style');
      s.innerHTML = style;
      document.head.appendChild(s);
    },
    setClipboard(text) {
      if (!document.hasFocus()) {
        throw new DOMException('Document is not focused');
      }
      navigator.clipboard.writeText(text);
    },
  };

  // Torn API wrapper with validation, fetch, object args, and caching
  // see: https://www.torn.com/swagger.php
  const torn_api = (() => {
    const cache = new Map(); // In-memory cache with timestamps

    return async (key, path, args = {}) => {
      // Validate API key (16 alphanumeric characters)
      if (!/^[a-zA-Z0-9]{16}$/.test(key)) {
        throw new Error('Invalid API key. Must be exactly 16 alphanumeric characters.');
      }
      // Validate and normalize path
      const validRoots = ['user', 'faction', 'market', 'racing', 'forum', 'property', 'key', 'torn'];
      if (typeof path !== 'string') {
        throw new Error('Invalid path. Must be a string.');
      }
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      const root = normalizedPath.split('/')[1];
      if (!validRoots.includes(root)) {
        throw new Error(`Invalid path. Must start with one of: ${validRoots.join(', ')}`);
      }
      // Convert args to query string if it's an object
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
      const queryPrefix = queryString && !queryString.startsWith('&') ? `&${queryString}` : queryString;
      // Build full URL with comment
      const url = `https://api.torn.com/v2${normalizedPath}?comment=RacingPlus&key=${key}${queryPrefix}`;
      // Check cache with TTL
      const cached = cache.get(url);
      const now = Date.now();
      if (cached && now - cached.timestamp < CACHE_TTL) {
        return cached.data;
      }
      // Fetch from API
      const response = await fetch(url);
      const result = await response.json();
      if (result.error) {
        throw result.error;
      }
      // Cache and return
      cache.set(url, { data: result, timestamp: now });
      return result;
    };
  })();

  const validateKey = async (save = false) => {
    try {
      // Attempt to call the API to retrieve the server time
      let validation = await torn_api(API_KEY.includes('###') ? document.querySelector('#rplus_apikey').value : API_KEY, 'user/timestamp', { timestamp: Math.floor(Date.now() / 1000).toString() });
      if (validation) {
        // Save API key
        if (save) {
          RPS.setValue('rplus_apikey', `${document.querySelector('#rplus_apikey').value}`);
          console.log('Racing+: rplus_apikey saved.');
        }
        // Valid API key
        document.querySelector('#rplus_apikey_status').textContent = '';
        document.querySelector('#rplus_apikey').classList.toggle('invalid', false);
        document.querySelector('#rplus_apikey').classList.toggle('valid', true);
        // Lock text input
        await setAPIKeyDisplay();
        // Return error
        return true;
      } else {
        throw new Error(validation);
      }
    } catch (err) {
      // Invalid API key or other error
      document.querySelector('#rplus_apikey_status').textContent = err;
      document.querySelector('#rplus_apikey').classList.toggle('invalid', true);
      document.querySelector('#rplus_apikey').classList.toggle('valid', false);
      // Unlock text input
      await setAPIKeyDisplay();
      // Return error
      return err;
    }
  };

  const setAPIKeyDisplay = async () => {
    if (API_KEY.includes('###')) {
      if (document.querySelector('#rplus_apikey').value.length > 0) {
        document.querySelector('#rplus_apikey').disabled = true;
        document.querySelector('#rplus_apikey').readonly = true;
        document.querySelector('#rplus_apikey_save').classList.toggle('show', false);
        document.querySelector('#rplus_apikey_reset').classList.toggle('show', true);
      } else {
        document.querySelector('#rplus_apikey').disabled = false;
        document.querySelector('#rplus_apikey').readonly = false;
        document.querySelector('#rplus_apikey_save').classList.toggle('show', true);
        document.querySelector('#rplus_apikey_reset').classList.toggle('show', false);
      }
    } else {
      document.querySelector('#rplus_apikey').disabled = true;
      document.querySelector('#rplus_apikey').readonly = true;
      document.querySelector('#rplus_apikey_save').classList.toggle('show', false);
      document.querySelector('#rplus_apikey_reset').classList.toggle('show', false);
    }
  };

  // ##############################################################################################

  // Add profile links to driver names
  const addLinks = async (drivers) => {
    drivers.forEach((driver) => {
      let username = driver.querySelector('li.name').innerHTML.replace('<span>', '').replace('</span>', '');
      driver.querySelector('li.name').innerHTML = `<a href="/profiles.php?XID=${driver.id.substring(4)}">${username}</a>`;
    });
  };

  // ##############################################################################################

  const initializeRacingPlus = async () => {
    console.log('Racing+: Initializing...');
    let mainpage = await defer('#racingMainContainer');
    // Add the Racing+ window to the DOM
    if (!document.querySelector('div.racing-plus-window')) {
      let rplus_window_html = `<div class="racing-plus-window">
          <div class="title-black top-round m-top10">Racing+ Settings</div>
          <div class="cont-black">
            <div class="model-wrap">
              <div class="racing-plus-settings">
                <label for="rplus_apikey">API Key</label>
                <div class="nowrap">
                  <span id="rplus_apikey_actions">
                    <span id="rplus_apikey_status"></span>
                    <button type="button" id="rplus_apikey_save" aria-label="Save">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="2 2 20 20" version="1.1">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M7 2C4.23858 2 2 4.23858 2 7V17C2 19.7614 4.23858 22 7 22H17C19.7614 22 22 19.7614 22 17V8.82843C22 8.03278 21.6839 7.26972 21.1213 6.70711L17.2929 2.87868C16.7303 2.31607 15.9672 2 15.1716 2H7ZM7 4C6.44772 4 6 4.44772 6 5V7C6 7.55228 6.44772 8 7 8H15C15.5523 8 16 7.55228 16 7V5C16 4.44772 15.5523 4 15 4H7ZM12 17C13.6569 17 15 15.6569 15 14C15 12.3431 13.6569 11 12 11C10.3431 11 9 12.3431 9 14C9 15.6569 10.3431 17 12 17Z" />
                      </svg>
                    </button>
                    <button type="button" id="rplus_apikey_reset" aria-label="Reset">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" version="1.1">
                        <path d="M790.2 590.67l105.978 32.29C847.364 783.876 697.86 901 521 901c-216.496 0-392-175.504-392-392s175.504-392 392-392c108.502 0 206.708 44.083 277.685 115.315l-76.64 76.64C670.99 257.13 599.997 225 521.5 225 366.032 225 240 351.032 240 506.5 240 661.968 366.032 788 521.5 788c126.148 0 232.916-82.978 268.7-197.33z"/>
                        <path d="M855.58 173.003L650.426 363.491l228.569 32.285z"/>
                      </svg>
                    </button>
                  </span>
                  <input type="text" id="rplus_apikey" maxlength="16" />
                </div>
                <label for="rplus_addlinks">Add profile links</label><div><input type="checkbox" id="rplus_addlinks" /></div>
                <label for="rplus_showskill">Show racing skill</label><div><input type="checkbox" id="rplus_showskill" /></div>
                <label for="rplus_showspeed">Show current speed</label><div><input type="checkbox" id="rplus_showspeed" /></div>
                <label for="rplus_showresults">Show race results</label><div><input type="checkbox" id="rplus_showresults" /></div>
                <label for="rplus_showwinrate">Show win rate for each car</label><div><input type="checkbox" id="rplus_showwinrate" /></div>
                <label for="rplus_showparts">Show parts & modifications</label><div><input type="checkbox" id="rplus_showparts" /></div>
              </div>
            </div>
          </div>
          <div class="cont-black bottom-round"><div class="racing-plus-footer"></div></div>
        </div>`;
      mainpage.insertAdjacentHTML('beforeBegin', rplus_window_html);
      console.log('Racing+: Settings window added.');
    }

    // Add the Racing+ button to the DOM
    if (!document.querySelector('a.racing-plus-button')) {
      let rplus_button_html = `<a aria-labelledby="Racing+ Settings" class="racing-plus-button t-clear h c-pointer line-h24 right">
          <span class="icon-wrap svg-icon-wrap">
            <span class="link-icon-svg racing">
              <svg xmlns="http://www.w3.org/2000/svg" stroke="transparent" stroke-width="0" width="15" height="14" viewBox="0 0 15 14"><path d="m14.02,11.5c.65-1.17.99-2.48.99-3.82,0-2.03-.78-3.98-2.2-5.44-2.83-2.93-7.49-3.01-10.42-.18-.06.06-.12.12-.18.18C.78,3.7,0,5.66,0,7.69c0,1.36.35,2.69,1.02,3.88.36.64.82,1.22,1.35,1.73l.73.7,1.37-1.5-.73-.7c-.24-.23-.45-.47-.64-.74l1.22-.72-.64-1.14-1.22.72c-.6-1.42-.6-3.03,0-4.45l1.22.72.64-1.14-1.22-.72c.89-1.23,2.25-2.04,3.76-2.23v1.44h1.29v-1.44c1.51.19,2.87.99,3.76,2.23l-1.22.72.65,1.14,1.22-.72c.68,1.63.58,3.48-.28,5.02-.06.11-.12.21-.19.31l-1.14-.88.48,3.5,3.41-.49-1.15-.89c.12-.18.23-.35.33-.53Zm-6.51-4.97c-.64-.02-1.17.49-1.18,1.13s.49,1.17,1.13,1.18,1.17-.49,1.18-1.13c0,0,0-.01,0-.02l1.95-1.88-2.56.85c-.16-.09-.34-.13-.52-.13h0Z"/></svg>
            </span>
          </span>
          <span class="linkName">Racing+</span>
        </a>`;
      document.querySelector('#top-page-links-list').insertAdjacentHTML('beforeEnd', rplus_button_html);
      console.log('Racing+: Settings button added.');
    }
    // Add the Racing+ button click event handler
    document.querySelector('a.racing-plus-button').addEventListener('click', (ev) => {
      ev.preventDefault();
      // Toggle show/hide racing-plus-window
      document.querySelector('div.racing-plus-window').classList.toggle('show');
    });
    // Add the Racing+ API key stored value
    let stored_apikey = API_KEY.includes('###') ? RPS.getValue('rplus_apikey') : API_KEY;
    if (stored_apikey) {
      document.querySelector('#rplus_apikey').value = stored_apikey;
      validateKey(false);
    }
    if (API_KEY.includes('###')) {
      // Add the Racing+ API key save button click event handler
      document.querySelector('#rplus_apikey_save').addEventListener('click', async (ev) => {
        ev.preventDefault();
        validateKey(true);
      });
      // Add the Racing+ API key reset button click event handler
      document.querySelector('#rplus_apikey_reset').addEventListener('click', async (ev) => {
        ev.preventDefault();
        // Clear API key
        RPS.deleteValue('rplus_apikey');
        // Clear text input
        document.querySelector('#rplus_apikey').value = '';
        await setAPIKeyDisplay();
      });
    }
    await setAPIKeyDisplay();
    // Add checkbox stored values and click events.
    document.querySelectorAll('div.racing-plus-settings input[type=checkbox]').forEach((el) => {
      el.checked = RPS.getValue(el.id) === '1';
      el.addEventListener('click', (ev) => {
        RPS.setValue(ev.target.id, ev.target.checked ? '1' : '0');
        console.log(`Racing+: ${ev.target.id} saved.`);
      });
    });
    console.log('Racing+: Initialized.');
  };

  // ##############################################################################################

  const addRacingPlusStyles = async () => {
    console.log('Racing+: Adding styles...');

    // Add styles
    await RPS.addStyle(`
      div.racing-plus-window {
        display:none;
      }
      div.racing-plus-window.show {
        display:block;
      }
      div.racing-plus-window .model-wrap {
        background: url(/images/v2/racing/header/stripy_bg.png) 0 0 repeat;
        padding: 5px 10px 0px 10px;
      }
      div.racing-plus-settings {
        display:grid;
        grid-template-columns:auto min-content;
        grid-template-rows:repeat(6, min-content);
        grid-gap:0;
      }
      div.racing-plus-settings label {
        padding:6px 5px;
        font-size:10px;
        white-space:nowrap;
      }
      div.racing-plus-settings div {
        padding:0 5px;
        font-size:10px;
        text-align:right;
        position:relative;
      }
      div.racing-plus-settings label,
      div.racing-plus-settings div {
        border-bottom: 2px groove #424242;
      }
      div.racing-plus-settings div:last-of-type,
      div.racing-plus-settings label:last-of-type {
        border-bottom:0px none;
      }
      div.racing-plus-settings div input[type=checkbox] {
        vertical-align:middle;
        height:11px;
        margin:5px 0;
      }
      .racing-plus-footer {
        height: 10px;
        border-top:2px groove #424242;
      }
      #rplus_apikey {
        text-align:right;
        vertical-align:middle;
        width:120px;
        height:13px;
        margin:0;
        padding:0 4px;
        border-style:solid;
        border-width:1px;
        border-radius:3px;
        border-color:#ccc;
        border-color:var(--input-disabled-border-color);
      }
      #rplus_apikey.valid {
        border-color:#00CC00!important;
      }
      #rplus_apikey.invalid {
        border-color:#FF0000!important;
      }
      #rplus_apikey_actions {
        margin-right:10px;
        vertical-align:middle;
      }
      #rplus_apikey_status {
        vertical-align:middle;
        color:#FF0000;
      }
      #rplus_apikey_save {
        cursor:pointer;
        vertical-align:middle;
        margin:0 0 2px 0;
        padding:0;
        height:13px;
        width:13px;
        display:none;
      }
      #rplus_apikey_reset {
        cursor:pointer;
        vertical-align:middle;
        margin:0 0 2px 0;
        padding:0;
        height:15px;
        width:15px;
        display:none;
      }
      #rplus_apikey_save.show,
      #rplus_apikey_reset.show {
        display:inline-block!important;
      }
      #rplus_apikey_save:before,
      #rplus_apikey_reset:before {
        background:unset!important;
        height:unset!important;
        left:unset!important;
        position:unset!important;
        width:unset!important;
      }
      #rplus_apikey_save svg path,
      #rplus_apikey_reset svg path {
        fill:#666;
        fill:var(--top-links-icon-svg-fill);
        filter:drop-shadow(0 1px 0 #FFFFFFA6);
        filter:var(--top-links-icon-svg-shadow);
      }
      #rplus_apikey_save:hover svg path,
      #rplus_apikey_reset:hover svg path {
        fill:#444;
        fill:var(--top-links-icon-svg-hover-fill);
        filter:drop-shadow(0 1px 0 #FFFFFFA6);
        filter:var(--top-links-icon-svg-hover-shadow);
      }
      .nowrap {
        white-space:nowrap!important;
      }
      #rplus_part_groups {
        margin-top:10px;
        font-size:0.7rem;
        font-style:italic;
      }
      .pm-categories .link .icons .parts {
        position: absolute;
        bottom: 5px;
        left: 5px;
        color:#00BFFF;
      }
      .pm-categories .link .icons .parts.bought {
        color:#00cc00;
      }
      .d .racing-main-wrap .pm-items-wrap .pm-items > li .b-delimiter,
      .d .racing-main-wrap .pm-items-wrap .part-wrap .l-delimiter,
      .d .racing-main-wrap .pm-items-wrap .part-wrap .r-delimiter {
        height:0!important;
        width:0!important;
      }
      .d .racing-main-wrap .pm-items-wrap .pm-items .active .properties-wrap > li .name,
      .d .racing-main-wrap .pm-items-wrap .pm-items .active .properties-wrap > li .progress-bar,
      .d .racing-main-wrap .pm-items-wrap .pm-items .bought .properties-wrap > li .name,
      .d .racing-main-wrap .pm-items-wrap .pm-items .bought .properties-wrap > li .progress-bar {
        background:unset!important;
      }
      .d .racing-main-wrap .pm-items-wrap .pm-items .active,
      .d .racing-main-wrap .pm-items-wrap .pm-items .active .title {
        background:rgba(0, 191, 255, 0.07);
      }
      .d .racing-main-wrap .pm-items-wrap .pm-items .bought,
      .d .racing-main-wrap .pm-items-wrap .pm-items .bought .title {
        background:rgba(133, 178, 0, 0.07);
      }

      #rplus_racelink,
      #rplus_exportlink {
        display:inline-block;
        float:right;
        margin-left:10px;
        padding-top: 2px;
      }
      .d .racing-main-wrap .car-selected-wrap .driver-item > li.status-wrap .status {
        margin:5px!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.car {
        padding: 0 5px;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.skill {
        flex-basis:65px;
        line-height:30px;
        padding:0 5px;
        white-space:nowrap;
        text-align:center;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.speed {
        flex-basis:85px;
        line-height:30px;
        padding:0 5px;
        white-space:nowrap;
        text-align:right;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.time {
        flex-basis:80px;
        line-height:30px;
        padding:0 5px;
        white-space:nowrap;
        text-align:right;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item.driver-item_NEXT {
        font-size:0.7rem!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item.driver-item_NEXT > li.skill,
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item.driver-item_NEXT > li.speed,
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item.driver-item_NEXT > li.time {
        width:unset;
        flex-grow:1;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .overview > li:hover .driver-item > li.skill,
      .d .racing-main-wrap .car-selected-wrap .drivers-list .overview > li.selected .driver-item > li.skill,
      .d .racing-main-wrap .car-selected-wrap .drivers-list .overview > li:hover .driver-item > li.speed,
      .d .racing-main-wrap .car-selected-wrap .drivers-list .overview > li.selected .driver-item > li.speed {
        background: url(/images/v2/racing/selected_driver.png) 0 0 repeat-x;
      }


      .left-banner {
        height:57px;
        width:150px;
        top:44px;
        left:0;
        position:absolute;
        border-top:1px solid #424242;
        border-bottom:1px solid #424242;
        border-right:1px solid #424242;
        border-top-right-radius:5px;
        border-bottom-right-radius:5px;
        background:url(/images/v2/racing/header/stripy_bg.png) 0 0 repeat;
        box-shadow:5px 0 10px -2px rgba(0, 0, 0, 0.5), 0 5px 10px -2px rgba(0, 0, 0, 0.5);
      }
      .d .racing-main-wrap .header-wrap .banner .skill-desc {
        width:130px!important;
        top:15px!important;
        left:8px!important;
        font-size:1rem!important;
      }
      .d .racing-main-wrap .header-wrap .banner .skill {
        top:33px!important;
        left:10px!important;
        font-size:0.8rem!important;
      }
      .d .racing-main-wrap .header-wrap .banner .lastgain {
        top:33px;
        left:75px;
        color:#00ff00;
        position:absolute;
        font-size:0.6rem!important;
      }
      .right-banner {
        height:57px;
        width:115px;
        top:44px;
        right:0;
        position:absolute;
        border-top:1px solid #424242;
        border-bottom:1px solid #424242;
        border-left:1px solid #424242;
        border-top-left-radius:5px;
        border-bottom-left-radius:5px;
        background:url(/images/v2/racing/header/stripy_bg.png) 0 0 repeat;
        box-shadow:-5px 0 10px -2px rgba(0, 0, 0, 0.5), 0 5px 10px -2px rgba(0, 0, 0, 0.5);
      }
      .d .racing-main-wrap .header-wrap .banner .class-desc {
        right:40px!important;
        top:23px!important;
        font-size:1rem!important;
      }
      .d .racing-main-wrap .header-wrap .banner .class-letter {
        right:12px!important;
        top:22px!important;
        font-size:1.5rem!important;
      }

      @media screen and (max-width: 784px) {
        .d .racing-main-wrap .header-wrap .banner .skill-desc {
          font-size:0.8rem!important;
          top:10px!important;
        }
        .d .racing-main-wrap .header-wrap .banner .skill {
          top:10px!important;
          left:125px!important;
        }
        .d .racing-main-wrap .header-wrap .banner .lastgain {
          top:10px!important;
          left:185px;
        }
        .d .racing-main-wrap .header-wrap .banner .class-desc {
          top:10px !important;
          font-size: 0.8rem !important;
        }
        .d .racing-main-wrap .header-wrap .banner .class-letter {
          top:10px!important;
          font-size:1.25rem!important;
        }
        .left-banner,
        .right-banner {
          top:0;
          background-image:none!important;
          border:none!important;
          box-shadow:none!important;
        }
      }
    `);
    if (RPS.getValue('rplus_showparts') === '1') {
      let colours = document.querySelector('body.dark-mode')
        ? ['#5D9CEC', '#48CFAD', '#FFCE54', '#ED5565', '#EC87C0', '#AC92EC', '#FC6E51', '#A0D468', '#4FC1E9']
        : ['#74e800', '#ff2626', '#ffc926', '#00d9d9', '#0080ff', '#9933ff', '#ff26ff', '#4e9b00', '#0000b7'];
      let categories = [
        ['Spoiler', 'Engine Cooling', 'Brake Cooling', 'Front Diffuser', 'Rear Diffuser'],
        ['Pads', 'Discs', 'Fluid', 'Brake Accessory', 'Brake Control', 'Callipers'],
        ['Gasket', 'Engine Porting', 'Engine Cleaning', 'Fuel Pump', 'Camshaft', 'Turbo', 'Pistons', 'Computer', 'Intercooler'],
        ['Exhaust', 'Air Filter', 'Manifold'],
        ['Fuel'],
        ['Overalls', 'Helmet', 'Fire Extinguisher', 'Safety Accessory', 'Roll cage', 'Cut-off', 'Seat'],
        ['Springs', 'Front Bushes', 'Rear Bushes', 'Upper Front Brace', 'Lower Front Brace', 'Rear Brace', 'Front Tie Rods', 'Rear Control Arms'],
        ['Shifting', 'Differential', 'Clutch', 'Flywheel', 'Gearbox'],
        ['Strip out', 'Steering wheel', 'Interior', 'Windows', 'Roof', 'Boot', 'Hood'],
        ['Tyres', 'Wheels'],
      ];
      let partsCSS = '';
      categories.forEach((groups) => {
        groups.forEach((grp, i) => {
          partsCSS += `
        #rplus_part_groups span[data-part="${grp}"] { color:${colours[i]}; }
        .d .racing-main-wrap .pm-items-wrap .pm-items li[data-part="${grp}"]:not(.bought):not(.active) .status {
          background-color:${colours[i]};
          background-image:unset;
        }
        .d .racing-main-wrap .pm-items-wrap .pm-items li[data-part="${grp}"]:not(.bought):not(.active) .bg-wrap .title {
          background-color:${colours[i]}40;
        }
        `;
        });
      });
      await RPS.addStyle(partsCSS);
    }
    console.log('Racing+: Styles added.');
  };

  const defer = (selector, interval = 100) => {
    return new Promise((resolve, reject) => {
      try {
        const check = () => {
          const result = document.querySelector(selector);
          if (result) {
            resolve(result);
          } else {
            console.log('Racing+: Deferring...');
            setTimeout(check, interval);
          }
        };
        check();
      } catch (err) {
        reject(err);
      }
    });
  };

  const deferAll = (selector, interval = 100) => {
    return new Promise((resolve, reject) => {
      try {
        const check = () => {
          const result = document.querySelectorAll(selector);
          if (result && result.length > 0) {
            resolve(result);
          } else {
            console.log('Racing+: Deferring...');
            setTimeout(check, interval);
          }
        };
        check();
      } catch (err) {
        reject(err);
      }
    });
  };

  // ##############################################################################################

  // Cache racing skill and interval object
  let racingSkillCacheByDriverId = new Map();
  let lastTimeByDriverId = new Map();
  let speedIntervalByDriverId = new Map();

  let raceResults = [];
  const parseRaceData = async (response) => {
    try {
      console.log('Racing+: Parsing Race Data...');
      let data = JSON.parse(response);
      // update driver skill
      let lastSkill = RPS.getValue('rplus_racingskill');
      let currSkill = Number(data.user.racinglevel).toFixed(5);
      if (currSkill > lastSkill) {
        let skillBanner = await defer('.banner .skill');
        let lastInc = Number(currSkill - lastSkill).toFixed(5);
        if (lastInc) {
          skillBanner.insertAdjacentHTML('afterEnd', `<div class="lastgain">+${lastInc}</div>`);
        }
        RPS.setValue('rplus_racingskill', `${currSkill}`);
        console.log('Racing+: rplus_racingskill saved.');
        skillBanner.textContent = currSkill;
      }

      // Add race link copy button
      await addRaceLinkCopyButton(data.raceID);

      // calc, sort & show race results
      if (raceResults.length <= 0 && RPS.getValue('rplus_showresults') === '1' && data.timeData.status >= 3) {
        // Populate results
        let carsData = data.raceData.cars;
        let carInfo = data.raceData.carInfo;
        let trackIntervals = data.raceData.trackData.intervals.length;
        for (let playername in carsData) {
          let userId = carInfo[playername].userID;
          let intervals = atob(carsData[playername]).split(',');
          let raceTime = 0;
          let bestLap = 9999999999;
          if (intervals.length / trackIntervals == data.laps) {
            for (let i = 0; i < data.laps; i++) {
              let lapTime = 0;
              for (let j = 0; j < trackIntervals; j++) {
                lapTime += Number(intervals[i * trackIntervals + j]);
              }
              bestLap = Math.min(bestLap, lapTime);
              raceTime += Number(lapTime);
            }
            raceResults.push([userId, playername, 'finished', raceTime, bestLap]);
          } else {
            raceResults.push([userId, playername, 'crashed', 0, 0]);
          }
        }
        // sort by status then time
        raceResults.sort((a, b) => {
          return b[2].toLocaleLowerCase().localeCompare(a[2].toLocaleLowerCase()) || a[3] - b[3];
        });
        // add export results
        await addExportButton(raceResults, data.user.id, data.raceID, data.timeData.timeEnded);
      }
    } catch (err) {
      // Exit the function if response is not valid JSON
      console.log('Racing+: Invalid JSON response...');
      return;
    }
  };

  const formatTime = (msec) => {
    let hours = Math.floor((msec % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    let minutes = Math.floor((msec % (1000 * 60 * 60)) / (1000 * 60));
    let seconds = Math.floor((msec % (1000 * 60)) / 1000);
    let mseconds = Math.floor(msec % 1000);
    return ('00' + minutes).toString().slice(-2) + ':' + ('00' + seconds).toString().slice(-2) + '.' + ('000' + mseconds).toString().slice(3);
  };

  const raceStatus = async () => {
    let info = await defer('#infoSpot');
    switch (info.textContent.toLowerCase()) {
      case 'race started':
      case 'race in progress':
        return 'racing';
      case 'race finished':
        return 'finished';
      default:
        if (info.querySelector('t-red')) {
          return 'starting';
        }
        return 'waiting';
    }
  };

  const updateLeaderboard = async () => {
    console.log('Racing+: Updating Leaderboard...');
    // Wait for racers to load
    let drivers = await deferAll('.drivers-list ul#leaderBoard li[id^=lbr]');
    // Enumerate racers
    let status = await raceStatus();
    Array.from(drivers).forEach((r) => {
      // fix waiting icons
      if (status === 'waiting') {
        r.querySelector('.status').classList.toggle('racing', false);
        r.querySelector('.status').classList.toggle('waiting', true);
      }
      // fix completed
      if (r.querySelector('.time').textContent === '') {
        r.querySelector('.time').textContent = '0.00 %';
      }
    });
    // Load selected options
    if (RPS.getValue('rplus_addlinks') === '1') {
      await addLinks(Array.from(drivers));
    }
    if (RPS.getValue('rplus_showskill') === '1') {
      await loadRacerSkill(Array.from(drivers));
    }
    if (RPS.getValue('rplus_showspeed') === '1') {
      await loadRacerSpeed(Array.from(drivers));
    }
    if (RPS.getValue('rplus_showresults') === '1' && raceResults.length > 0) {
      // set result for each driver
      raceResults.forEach(async (result, index) => {
        let driverUl = await defer(`#lbr-${result[0]} ul`);
        let place = index + 1;
        let statusLi = driverUl.querySelector('.status-wrap');
        if (result[2] === 'crashed') {
          statusLi.innerHTML = `<div class="status crash"></div>`;
        } else if (place == 1) {
          statusLi.innerHTML = '<div class="status gold"></div>';
        } else if (place == 2) {
          statusLi.innerHTML = '<div class="status silver"></div>';
        } else if (place == 3) {
          statusLi.innerHTML = '<div class="status bronze"></div>';
        } else {
          statusLi.innerHTML = `<div class="finished-${place} finished">${place}</div>`;
        }
      });
    }
  };

  const addRaceLinkCopyButton = async (raceId) => {
    // Check if the race link already exists
    if (!document.querySelector('#rplus_racelink')) {
      let trackInfo = await defer('.track-info-wrap');
      let racelink_html =
        `<div id="rplus_racelink"><a title="Copy link" href="https://www.torn.com/loader.php?sid=racing&tab=log&raceID=${raceId}">` +
        '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><g><path d="M3.09,4.36c1.25-1.25,3.28-1.26,4.54,0,.15.15.29.32.41.5l-1.12,1.12c-.32-.74-1.13-1.15-1.92-.97-.31.07-.59.22-.82.45l-2.15,2.15c-.65.66-.63,1.72.03,2.37.65.63,1.69.63,2.34,0l.66-.66c.6.24,1.25.34,1.89.29l-1.47,1.47c-1.26,1.26-3.29,1.26-4.55,0-1.26-1.26-1.26-3.29,0-4.55h0l2.15-2.15ZM6.51.94l-1.47,1.46c.64-.05,1.29.05,1.89.29l.66-.66c.65-.65,1.72-.65,2.37,0,.65.65.65,1.72,0,2.37h0l-2.15,2.15c-.66.65-1.71.65-2.37,0-.15-.15-.28-.33-.36-.53l-1.12,1.12c.12.18.25.34.4.49,1.25,1.26,3.29,1.26,4.54,0,0,0,0,0,0,0l2.15-2.15c1.26-1.26,1.25-3.29,0-4.55-1.26-1.26-3.29-1.25-4.55,0Z" fill="currentColor" stroke-width="0"></path></g></svg>' +
        '</a></div>';
      // Append the link to the info container
      trackInfo.insertAdjacentHTML('afterEnd', racelink_html);

      // Add click event listener to the race link
      let raceLink = await defer('#rplus_racelink a');
      raceLink.addEventListener('click', function (event) {
        event.preventDefault();
        // Copy the race link to clipboard using RPS.setClipboard
        RPS.setClipboard(`https://www.torn.com/loader.php?sid=racing&tab=log&raceID=${raceId}`);
        // Try to find the tooltip and update its content
        const tooltipId = event.target.getAttribute('aria-describedby');
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
  };

  const addExportButton = async (results, driverId, raceId, timeEnded) => {
    if ($('#exportResults').size() < 1) {
      let csv = 'position,id,name,status,time,best_lap,racing_skill\n';
      for (let i = 0; i < results.length; i++) {
        const timeStr = formatTime(results[i][3] * 1000);
        const bestLap = formatTime(results[i][4] * 1000);
        csv += [i + 1, results[i][0], results[i][1], results[i][2], timeStr, bestLap, results[i][0] === driverId ? RPS.getValue('racingSkill') : ''].join(',') + '\n';
      }
      const timeE = new Date();
      timeE.setTime(timeEnded * 1000);
      const fileName = `${timeE.getUTCFullYear()}${('00' + (timeE.getUTCMonth() + 1)).slice(-2)}${('00' + timeE.getUTCDate()).slice(-2)}-race_${raceId}.csv`;
      const myblob = new Blob([csv], { type: 'application/octet-stream' });
      const myurl = window.URL.createObjectURL(myblob);
      const exportBtn =
        `<a id="exportResults" title="Export CSV" href="${myurl}" download="${fileName}">` +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" height="12" width="12"><path d="M17,2.25V18H2V2.25H5.5l-2,2.106V16.5h12V4.356L13.543,2.25H17Zm-2.734,3L11.781,2.573V2.266A2.266,2.266,0,0,0,7.25,2.25v.323L4.777,5.25ZM9.5,1.5a.75.75,0,1,1-.75.75A.75.75,0,0,1,9.5,1.5ZM5.75,12.75h7.5v.75H5.75Zm0-.75h7.5v-.75H5.75Zm0-1.5h7.5V9.75H5.75Zm0-1.5h7.5V8.25H5.75Z" fill="currentColor" stroke-width="0"></path></svg>' +
        '</a>';
      document.querySelector('#rplus_exportlink').insertAdjacentHTML('afterEnd', exportBtn);
    }
  };

  const loadRacerSkill = async (drivers) => {
    drivers.forEach(async (driver) => {
      try {
        let driverId = driver.id.substring(4);
        // Fetch racing skill data from the Torn API for the given driverId
        let user = await torn_api(API_KEY.includes('###') ? RPS.getValue('rplus_apikey') : API_KEY, `user/${driverId}/personalStats`, 'stat=racingskill');
        if (user && !driver.querySelector('.skill')) {
          driver.querySelector('.name').insertAdjacentHTML('afterEnd', `<li class="skill">RS: ${user.personalstats.racing.skill}</li>`);
        }
      } catch (err) {
        //TODO: more better error handling
        console.log(err);
      }
    });
  };

  const loadRacerSpeed = async (drivers) => {
    drivers.forEach((driver) => {
      let driverId = driver.id.substring(4);

      if (!driver.querySelector('.speed')) {
        driver.querySelector('.time').insertAdjacentHTML('beforeBegin', `<li class="speed">0.00mph</li>`);
      }
    });
  };

  const officialEvents = async () => {
    // save some space
    document.querySelectorAll('#racingdetails li.pd-name').forEach((detail) => {
      if (detail.textContent === 'Name:') {
        detail.remove();
      }
      if (detail.textContent === 'Position:') {
        detail.textContent = 'Pos:';
      }
      if (detail.textContent === 'Last Lap:') {
        detail.textContent = 'Last:';
        detail.classList.toggle('t-hide', false);
      }
      if (detail.textContent === 'Completion:') {
        detail.textContent = 'Best:';
        detail.classList.toggle('m-hide', false);
      }
    });
    let laptime = document.querySelector('#racingdetails li.pd-laptime');
    laptime.classList.toggle('t-hide', false);

    let besttime = document.querySelector('#racingdetails li.pd-completion');
    besttime.classList.toggle('m-hide', false);
    besttime.classList.toggle('pd-completion', false);
    besttime.classList.toggle('pd-besttime', true);
    besttime.textContent = '--:--';

    // Load leaderboard
    await updateLeaderboard();
    // Watch leaderboard for changes
    console.log('Racing+: Adding Leaderboard Observer...');
    let leaderboardObserver = new MutationObserver(async (mutations) => {
      await updateLeaderboard();
    });
    leaderboardObserver.observe(document.querySelector('.drivers-list #leaderBoard'), { childList: true });

    console.log('Racing+: Adding XMLHttpRequest Monkey...');
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (...args) {
      this.addEventListener('load', async (ev) => {
        if (ev.target && ev.target.responseURL && ev.target.responseURL.startsWith(`${window.location.origin}${window.location.pathname}`) && ev.target.response) {
          console.log('Racing+: XMLHttpRequest caught.');
          await parseRaceData(ev.target.response);
        }
      });
      originalOpen.apply(this, args);
    };
  };

  const enlistedCars = async () => {
    document.querySelectorAll('.enlist-list .enlist-info .enlisted-stat').forEach((ul) => {
      let wonRaces = ul.children[0].textContent.replace(/[\n\s]/g, '').replace('•Raceswon:', '');
      let totalRaces = ul.children[1].textContent.replace(/[\n\s]/g, '').replace('•Racesentered:', '');
      ul.children[0].textContent = `• Races won: ${wonRaces} / ${totalRaces}`;
      ul.children[1].textContent = `• Race win rate: ${totalRaces <= 0 ? 0 : Math.round((wonRaces / totalRaces) * 10000) / 100}%`;
    });
    document.querySelectorAll('ul.overview li.name').forEach((nameItem) => {
      const parent = nameItem.parentElement?.parentElement;
      if (parent && parent.id.startsWith('lbr-')) {
        const username = nameItem.innerHTML.replace('<span>', '').replace('</span>', '');
        const user_id = parent.id.replace('lbr-', '');
        nameItem.innerHTML = `<a href="/profiles.php?XID=${user_id}">${username}</a>`;
      }
    });
  };

  const partsModifications = async () => {
    // Exit early if the .pm-categories element is not found
    if (!document.querySelector('.pm-categories')) {
      return;
    }
    let categories = {};
    // Select all category list items except those with .empty or .clear
    document.querySelectorAll('.pm-categories li:not(.empty):not(.clear)').forEach((category) => {
      // Get the category id
      const cat = category.getAttribute('data-category');
      // Get the category name from classList (excluding 'unlock')
      let categoryName = [...category.classList].find((c) => c !== 'unlock');
      // Initialize bought and unbought arrays for this category
      categories[cat] = { bought: {}, unbought: {} };
      // Select all parts that belong to this category and have a valid data-part attribute
      const parts = document.querySelectorAll(`.pm-items li.${categoryName}[data-part]:not([data-part=""])`);
      parts.forEach((part) => {
        let groupName = part.getAttribute('data-part');
        // Filter out irrelevant classes: categoryName, 'tt-modified', and 'unlock'
        let partGroup = [...part.classList].filter((c) => !['tt-modified', 'unlock'].includes(c));
        // Remove category name if not the same as group name
        if (categoryName.toLowerCase() !== groupName.toLowerCase()) {
          partGroup = partGroup.filter((c) => c !== categoryName);
        }
        if (partGroup.length > 0) {
          if (partGroup.includes('bought')) {
            // Remove 'bought' from the group
            partGroup = partGroup.filter((c) => c !== 'bought');
            // Add to bought if not already included
            if (!(partGroup[0] in categories[cat].bought)) {
              categories[cat].bought[partGroup[0]] = groupName;
            }
            // Replace 'bought' with 'active' on the control.
            part.classList.toggle('bought', false);
            part.classList.toggle('active', true);
          } else {
            // Add to unbought if not already included
            if (!(partGroup[0] in categories[cat].unbought)) {
              categories[cat].unbought[partGroup[0]] = groupName;
            }
          }
        }
      });

      // Remove any group from unbought that exists in bought
      for (const groupKey in categories[cat].bought) {
        if (groupKey in categories[cat].unbought) {
          const bought = document.querySelectorAll(`.pm-items li.${categoryName}[data-part="${categories[cat].unbought[groupKey]}"]`);
          bought.forEach((b) => {
            if (!b.classList.contains('active')) {
              b.classList.toggle('bought', true);
            }
          });
          delete categories[cat].unbought[groupKey];
        }
      }

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
    // Add click event listeners to each category link
    const links = document.querySelectorAll('.pm-categories li a.link');
    links.forEach((link) => {
      link.addEventListener('click', (event) => {
        // Get the category id
        const cat = event.currentTarget.parentElement?.getAttribute('data-category');
        if (cat) {
          // Remove existing parts info if present
          const existing = document.getElementById('rplus_part_groups');
          if (existing) {
            existing.remove();
          }
          // Append a new div showing available (unbought) parts
          const msgContainer = document.querySelector('.info-msg .msg');
          if (msgContainer) {
            const div = document.createElement('div');
            div.id = 'rplus_part_groups';
            let content = Object.entries(categories[cat].unbought)
              .sort(([, a], [, b]) => a.localeCompare(b)) // Sort by value
              .map(([key, val]) => `<span data-part="${val}">${val.replace('Tyres', 'Tires')}</span>`)
              .join(', ');
            div.innerHTML = `<strong>Parts Available:</strong> ${content.length > 0 ? content : 'None'}`;
            msgContainer.appendChild(div);
          }
        }
      });
    });
  };

  const restructureBanner = async () => {
    console.log('Racing+: Fixing top banner...');
    const banner = await defer('.banner');
    // update driver skill
    let savedSkill = RPS.getValue('rplus_racingskill');
    if (savedSkill) {
      document.querySelector('.banner .skill').textContent = savedSkill;
    }
    // Create new containers
    const leftBanner = document.createElement('div');
    leftBanner.className = 'left-banner';
    const rightBanner = document.createElement('div');
    rightBanner.className = 'right-banner';
    // Move elements into the new containers
    const elements = Array.from(banner.children);
    elements.forEach((el) => {
      if (el.classList.contains('skill-desc') || el.classList.contains('skill') || el.classList.contains('lastgain')) {
        leftBanner.appendChild(el);
      } else if (el.classList.contains('class-desc') || el.classList.contains('class-letter')) {
        rightBanner.appendChild(el);
      }
    });
    // Clear original banner and append new structure
    banner.innerHTML = '';
    banner.appendChild(leftBanner);
    banner.appendChild(rightBanner);
  };

  let pageObserver = new MutationObserver(async (mutations) => {
    // Get added nodes
    let addedNodes;
    if (mutations[0] && mutations[0].addedNodes.length > 0) {
      addedNodes = mutations[0].addedNodes;
    } else if (mutations[1] && mutations[1].addedNodes.length > 0) {
      addedNodes = mutations[1].addedNodes;
    }
    // Verify nodes have been added and they do not include the loader
    if (addedNodes.length > 0 && !Array.from(addedNodes).some((node) => node.classList?.contains('ajax-preloader'))) {
      if (Array.from(addedNodes).some((node) => node.id === 'racingupdates')) {
        await officialEvents();
      } else if (Array.from(addedNodes).some((node) => node.classList?.contains('enlist-wrap')) && RPS.getValue('rplus_showwinrate') === '1') {
        await enlistedCars();
      } else if (Array.from(addedNodes).some((node) => node.classList?.contains('pm-categories-wrap')) && RPS.getValue('rplus_showparts') === '1') {
        await partsModifications();
      }
    }
  });

  // Add Racing+ styles to DOM
  await addRacingPlusStyles();
  // Add Racing+ elements to DOM
  await initializeRacingPlus();
  // Fix top banner
  await restructureBanner();

  console.log('Racing+: Adding Page Observer...');
  let innerpage = await defer('#racingAdditionalContainer');
  pageObserver.observe(innerpage, { childList: true });

  // Load default page
  await officialEvents();
})();
