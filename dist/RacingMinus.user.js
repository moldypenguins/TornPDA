// ==UserScript==
// @name         TornPDA - RacingMinus
// @namespace    TornPDA
// @version      0.56
// @license      MIT
// @description  Show racing skill, current speed, race results, precise skill, upgrade parts.
// @author       moldypenguins [2881784] - Adapted from Lugburz [2386297] - With flavours from TheProgrammer [2782979]
// @match        https://www.torn.com/page.php?sid=racing*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @updateURL    https://github.com/moldypenguins/TornPDA/raw/refs/heads/main/src/RacingMinus.user.js
// @downloadURL  https://github.com/moldypenguins/TornPDA/raw/refs/heads/main/src/RacingMinus.user.js
// @connect      api.torn.com
// @run-at       document-end
// ==/UserScript==

(async () => {
  ("use strict");

  //TODO:
  // fix xmlhttp monkey
  // fix export link
  // test fix best lap

  // TornPDA
  const API_KEY = "###PDA-APIKEY###";
  const DEFERRAL_LIMIT = 250; // Maximum amount of times the script will defer.
  const DEFERRAL_INTERVAL = 100; // Amount of time in milliseconds deferrals will last.
  const SPEED_INTERVAL = 1000; // Amount of time in milliseconds between speed updates.
  const CACHE_TTL = 60 * 60 * 1000; // Amount of time in milliseconds to cache API responses. Default = 1 hour.
  const DEBUG_MODE = true; // Turn on to log to console.

  const PDA = {
    getValue: (key) => {
      return localStorage.getItem(key);
    },
    setValue: (key, value) => {
      localStorage.setItem(key, value);
    },
    deleteValue: (key) => {
      localStorage.removeItem(key);
    },
    addStyle: (style) => {
      if (!style) {
        return;
      }
      const s = document.createElement("style");
      s.innerHTML = style;
      document.head.appendChild(s);
    },
    setClipboard: (text) => {
      if (!document.hasFocus()) {
        throw new DOMException("Document is not focused");
      }
      navigator.clipboard.writeText(text);
    },
    isTornPDA: (key) => {
      if (key && !key.includes("###") && typeof window.flutter_inappwebview !== "undefined" && typeof window.flutter_inappwebview.callHandler === "function") {
        return key;
      }
      return null;
    },
  };

  // Torn API wrapper with validation, fetch, object args, and caching
  // see: https://www.torn.com/swagger.php
  const torn_api = (() => {
    const cache = new Map(); // In-memory cache with timestamps
    return async (key, path, args = {}) => {
      // Validate API key (16 alphanumeric characters)
      if (!/^[a-zA-Z0-9]{16}$/.test(key)) {
        throw new Error("Invalid API key. Must be exactly 16 alphanumeric characters.");
      }
      // Validate and normalize path
      const validRoots = ["user", "faction", "market", "racing", "forum", "property", "key", "torn"];
      if (typeof path !== "string") {
        throw new Error("Invalid path. Must be a string.");
      }
      const normalizedPath = path.startsWith("/") ? path : `/${path}`;
      const root = normalizedPath.split("/")[1];
      if (!validRoots.includes(root)) {
        throw new Error(`Invalid path. Must start with one of: ${validRoots.join(", ")}`);
      }
      // Convert args to query string if it's an object
      let queryString = "";
      if (typeof args === "object" && args !== null) {
        queryString = Object.entries(args)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join("&");
      } else if (typeof args === "string") {
        queryString = args;
      } else {
        throw new Error("Invalid args. Must be an object or a query string.");
      }
      const queryPrefix = queryString && !queryString.startsWith("&") ? `&${queryString}` : queryString;
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

  const validateKey = async (save) => {
    try {
      let apiinput = await defer("#rplus_apikey");
      let apikey = PDA.isTornPDA(API_KEY) ?? apiinput.value;
      if (apikey) {
        // Attempt to call the API to retrieve the server time
        let servertime = await torn_api(apikey, "user/timestamp", { timestamp: Math.floor(Date.now() / 1000).toString() });
        if (servertime) {
          // Save API key
          if (save) {
            PDA.setValue("rplus_apikey", `${document.querySelector("#rplus_apikey").value}`);
            if (DEBUG_MODE) {
              console.log("Racing+: rplus_apikey saved.");
            }
          }
          // Lock text input
          await setAPIKeyDisplay({ valid: true });
          return true;
        } else {
          throw new Error("Validation failed.");
        }
      }
    } catch (err) {
      // Unlock text input
      await setAPIKeyDisplay({ error: err.error });
      // Return error
      console.error(`Racing+ Error: ${err.error}`);
      return false;
    }
  };

  const setAPIKeyDisplay = async (result = null) => {
    let apiinput = await defer("#rplus_apikey");
    let apisave = await defer(".racing-plus-apikey-save");
    let apireset = await defer(".racing-plus-apikey-reset");
    if (result && result.valid) {
      // Valid API key
      document.querySelector(".racing-plus-apikey-status").textContent = "";
      document.querySelector("#rplus_apikey").classList.toggle("invalid", false);
      document.querySelector("#rplus_apikey").classList.toggle("valid", true);
    } else if (result && result.error) {
      // Invalid API key or other error
      document.querySelector(".racing-plus-apikey-status").textContent = result.error;
      document.querySelector("#rplus_apikey").classList.toggle("invalid", true);
      document.querySelector("#rplus_apikey").classList.toggle("valid", false);
    } else {
      // Reset API key
      document.querySelector(".racing-plus-apikey-status").textContent = "";
      document.querySelector("#rplus_apikey").classList.toggle("invalid", false);
      document.querySelector("#rplus_apikey").classList.toggle("valid", false);
    }
    if (PDA.isTornPDA(API_KEY)) {
      document.querySelector(".racing-plus-apikey-status").textContent = "Edit in TornPDA settings.";
      apiinput.disabled = true;
      apiinput.readonly = true;
      apisave.classList.toggle("show", false);
      apireset.classList.toggle("show", false);
    } else {
      if (apiinput.classList.contains("valid")) {
        apiinput.disabled = true;
        apiinput.readonly = true;
        apisave.classList.toggle("show", false);
        apireset.classList.toggle("show", true);
      } else {
        apiinput.disabled = false;
        apiinput.readonly = false;
        apisave.classList.toggle("show", true);
        apireset.classList.toggle("show", false);
      }
    }
  };

  const initializeRacingPlus = async () => {
    if (DEBUG_MODE) {
      console.log("Racing+: Initializing...");
    }
    let mainpage = await defer("#racingMainContainer");
    // Add the Racing+ window to the DOM
    if (!document.querySelector("div.racing-plus-window")) {
      let rplus_window_html = `<div class="racing-plus-window">
          <div class="racing-plus-header">Racing+</div>
          <div class="racing-plus-main">
            <div class="racing-plus-settings">
              <label for="rplus_apikey">API Key</label>
              <div class="flex-col">
                <div class="nowrap">
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
                  <input type="text" id="rplus_apikey" maxlength="16" />
                </div>
                <span class="racing-plus-apikey-status"></span>
              </div>
              <label for="rplus_addlinks">Add profile links</label><div><input type="checkbox" id="rplus_addlinks" /></div>
              <label for="rplus_showskill">Show racing skill</label><div><input type="checkbox" id="rplus_showskill" /></div>
              <label for="rplus_showspeed">Show current speed</label><div><input type="checkbox" id="rplus_showspeed" /></div>
              <label for="rplus_showresults">Show race results</label><div><input type="checkbox" id="rplus_showresults" /></div>
              <label for="rplus_showracelink">Show race link</label><div><input type="checkbox" id="rplus_showracelink" /></div>
              <label for="rplus_showexportlink">Show export link</label><div><input type="checkbox" id="rplus_showexportlink" /></div>
              <label for="rplus_showwinrate">Show win rate for each car</label><div><input type="checkbox" id="rplus_showwinrate" /></div>
              <label for="rplus_showparts">Show parts & modifications</label><div><input type="checkbox" id="rplus_showparts" /></div>
            </div>
          </div>
          <div class="racing-plus-footer"></div>
        </div>`;
      mainpage.insertAdjacentHTML("beforeBegin", rplus_window_html);
      if (DEBUG_MODE) {
        console.log("Racing+: Settings window added.");
      }
    }

    // Add the Racing+ button to the DOM
    if (!document.querySelector("a.racing-plus-button")) {
      let rplus_button_html = `<a role="button" aria-labelledby="racing-plus-link-label" class="racing-plus-button t-clear h c-pointer line-h24 right">
          <span class="icon-wrap svg-icon-wrap">
            <span class="link-icon-svg racing">
              <svg xmlns="http://www.w3.org/2000/svg" stroke="transparent" stroke-width="0" width="15" height="14" viewBox="0 0 15 14"><path d="m14.02,11.5c.65-1.17.99-2.48.99-3.82,0-2.03-.78-3.98-2.2-5.44-2.83-2.93-7.49-3.01-10.42-.18-.06.06-.12.12-.18.18C.78,3.7,0,5.66,0,7.69c0,1.36.35,2.69,1.02,3.88.36.64.82,1.22,1.35,1.73l.73.7,1.37-1.5-.73-.7c-.24-.23-.45-.47-.64-.74l1.22-.72-.64-1.14-1.22.72c-.6-1.42-.6-3.03,0-4.45l1.22.72.64-1.14-1.22-.72c.89-1.23,2.25-2.04,3.76-2.23v1.44h1.29v-1.44c1.51.19,2.87.99,3.76,2.23l-1.22.72.65,1.14,1.22-.72c.68,1.63.58,3.48-.28,5.02-.06.11-.12.21-.19.31l-1.14-.88.48,3.5,3.41-.49-1.15-.89c.12-.18.23-.35.33-.53Zm-6.51-4.97c-.64-.02-1.17.49-1.18,1.13s.49,1.17,1.13,1.18,1.17-.49,1.18-1.13c0,0,0-.01,0-.02l1.95-1.88-2.56.85c-.16-.09-.34-.13-.52-.13h0Z"/></svg>
            </span>
          </span>
          <span id="racing-plus-link-label" class="linkName">Racing+</span>
        </a>`;
      document.querySelector("#racing-leaderboard-header-root div[class^='linksContainer']").insertAdjacentHTML("beforeEnd", rplus_button_html);
      if (DEBUG_MODE) {
        console.log("Racing+: Settings button added.");
      }
    }
    // Add the Racing+ button click event handler
    document.querySelector("a.racing-plus-button").addEventListener("click", (ev) => {
      ev.preventDefault();
      // Toggle show/hide racing-plus-window
      document.querySelector("div.racing-plus-window").classList.toggle("show");
    });
    // Add the Racing+ API key stored value
    let stored_apikey = PDA.isTornPDA(API_KEY) ?? PDA.getValue("rplus_apikey");
    if (stored_apikey) {
      document.querySelector("#rplus_apikey").value = stored_apikey;
      await validateKey(false);
    } else {
      await setAPIKeyDisplay();
    }
    if (PDA.isTornPDA(API_KEY)) {
      // Add the Racing+ API key save button click event handler
      document.querySelector(".racing-plus-apikey-save").addEventListener("click", async (ev) => {
        ev.preventDefault();
        await validateKey(true);
      });
      // Add the Racing+ API key reset button click event handler
      document.querySelector(".racing-plus-apikey-reset").addEventListener("click", async (ev) => {
        ev.preventDefault();
        // Clear API key
        PDA.deleteValue("rplus_apikey");
        // Clear text input
        document.querySelector("#rplus_apikey").value = "";
        await setAPIKeyDisplay();
      });
    }
    // Add checkbox stored values and click events.
    let chkbxs = await deferAll(".d .racing-plus-settings input[type=checkbox]");
    Array.from(chkbxs).forEach((el) => {
      el.checked = PDA.getValue(el.id) === "1";
      el.addEventListener("click", (ev) => {
        PDA.setValue(ev.target.id, ev.target.checked ? "1" : "0");
        if (DEBUG_MODE) {
          console.log(`Racing+: ${ev.target.id} saved.`);
        }
      });
    });
    if (DEBUG_MODE) {
      console.log("Racing+: Initialized.");
    }
  };

  // ##############################################################################################

  const addRacingPlusStyles = async () => {
    if (DEBUG_MODE) {
      console.log("Racing+: Adding styles...");
    }

    // Add styles
    PDA.addStyle(`
      .d .racing-plus-window {
        margin:10px 0;
        padding:0;
        display:none;
      }
      .d .racing-plus-window.show {
        display:block;
      }
      .d .racing-plus-header {
        position:relative;
        padding-left:10px;
        height:30px;
        line-height:30px;
        font-size:12px;
        font-weight:bold;
        letter-spacing:0;
        text-shadow:0 0 2px #00000080;
        text-shadow:var(--tutorial-title-shadow);
        color:#ffffff;
        color:var(--tutorial-title-color);
        border:0 none!important;
        border-radius:5px 5px 0 0;
        background: linear-gradient(180deg, #888888 0%, #444444 100%);
      }
      .d.dark-mode .racing-plus-header {
        background:linear-gradient(180deg, #555555 0%, #333333 100%);
      }
      .d .racing-plus-header:after {
        position:absolute;
        left:0;
        bottom:-1px;
        content:'';
        display:block;
        height:0;
        width:100%;
        border-top:1px solid #999999;
        border-bottom:1px solid #EBEBEB;
      }
      .d.dark-mode .racing-plus-header:after {
        border-bottom:1px solid #222222;
        border-top:1px solid #444444;
      }
      .d .racing-plus-footer {
        position:relative;
        margin:0;
        padding:0;
        height:10px;
        border:0 none!important;
        border-radius:0 0 5px 5px;
        background: linear-gradient(0deg, #888888 0%, #444444 100%);
      }
      .d.dark-mode .racing-plus-footer {
        background:linear-gradient(0deg, #555555 0%, #333333 100%);
      }
      .d .racing-plus-footer:before {
        position:absolute;
        left:0;
        top:-1px;
        content:'';
        display:block;
        height:0;
        width:100%;
        border-bottom:1px solid #999999;
        border-top:1px solid #EBEBEB;
      }
      .d.dark-mode .racing-plus-footer:before {
        border-top:1px solid #222222;
        border-bottom:1px solid #444444;
      }
      .d .racing-plus-main {
        margin:0;
        padding:5px 10px;
        background-color: #F2F2F2;
      }
      .d.dark-mode .racing-plus-main {
        background-color: #2E2E2E;
      }
      .d .racing-plus-settings {
        display:grid;
        grid-template-columns:auto min-content;
        grid-template-rows:repeat(6, min-content);
        grid-gap:0;
      }
      .d .racing-plus-settings label {
        padding:6px 5px;
        font-size:0.7rem;
        white-space:nowrap;
      }
      .d .racing-plus-settings div {
        padding:0 5px;
        font-size:0.7rem;
        text-align:right;
        position:relative;
      }
      .d .racing-plus-settings label,
      .d .racing-plus-settings div {
        border-bottom: 2px groove #EBEBEB;
      }
      .d.dark-mode .racing-plus-settings label,
      .d.dark-mode .racing-plus-settings div {
        border-bottom: 2px groove #444444;
      }
      .d .racing-plus-settings div:last-of-type,
      .d .racing-plus-settings label:last-of-type {
        border-bottom:0px none;
      }
      .d .racing-plus-settings div input[type=checkbox] {
        vertical-align:middle;
        height:11px;
        margin:5px 0;
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
      .d .flex-col {
        display: flex;
        flex-direction: column;
      }
      .d .nowrap {
        white-space:nowrap!important;
      }
      .d .racing-plus-apikey-actions {
        margin-right:10px;
        vertical-align:middle;
      }
      .d .racing-plus-apikey-status {
        vertical-align:middle;
        color:#FF0000;
        padding:5px;
        font-size:0.6rem;
      }
      .d .racing-plus-apikey-save {
        cursor:pointer;
        vertical-align:middle;
        margin:0 0 2px 0;
        padding:0;
        height:15px;
        width:15px;
        display:none;
      }
      .d .racing-plus-apikey-reset {
        cursor:pointer;
        vertical-align:middle;
        margin:0 0 2px 0;
        padding:0;
        height:15px;
        width:15px;
        display:none;
      }
      .d .racing-plus-apikey-save.show,
      .d .racing-plus-apikey-reset.show {
        display:inline-block!important;
      }
      .d .racing-plus-apikey-save svg path,
      .d .racing-plus-apikey-reset svg path {
        fill:#666;
        fill:var(--top-links-icon-svg-fill);
        filter:drop-shadow(0 1px 0 #FFFFFFA6);
        filter:var(--top-links-icon-svg-shadow);
      }
      .d .racing-plus-apikey-save:hover svg path,
      .d .racing-plus-apikey-reset:hover svg path {
        fill:#444;
        fill:var(--top-links-icon-svg-hover-fill);
        filter:drop-shadow(0 1px 0 #FFFFFFA6);
        filter:var(--top-links-icon-svg-hover-shadow);
      }

      .d .racing-plus-parts-available {
        display:flex;
        flex-direction:row;
        gap:10px;
        font-style:italic;
        padding:10px;
        font-size:0.7rem;
        background:#2E2E2E url("/images/v2/racing/header/stripy_bg.png") repeat 0 0;
      }
      .d .racing-plus-parts-available:after {
        position:absolute;
        left:0;
        bottom:-1px;
        content:'';
        display:block;
        height:0;
        width:100%;
        border-bottom:1px solid #222222;
        border-top:1px solid #444444;
      }
      .d .pm-categories .link .icons .parts {
        position:absolute;
        bottom:5px;
        left:5px;
        color:#00BFFF;
      }
      .d .pm-categories .link .icons .parts.bought {
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
      .d .racing-main-wrap .pm-items-wrap .pm-items .active .info {
        color:#00BFFF;
      }
      .d .racing-main-wrap .pm-items-wrap .pm-items .name .positive {
        color: #99CC00;
      }
      .d .racing-main-wrap .pm-items-wrap .pm-items .active .name .positive {
        color: #00A9F9;
      }
      .d .racing-main-wrap .pm-items-wrap .pm-items .name .negative {
        color: #E54C19;
      }
      .d .racing-main-wrap .pm-items-wrap .pm-items .active .name .negative {
        color: #CA9800;
      }
      .d .racing-main-wrap .pm-items-wrap .pm-items .bought,
      .d .racing-main-wrap .pm-items-wrap .pm-items .bought .title {
        background:rgba(133, 178, 0, 0.07);
      }
      .d .racing-main-wrap .pm-items-wrap .pm-items .bought .desc {
        color:#85b200;
      }
      .d .racing-plus-link-wrap {
        cursor:pointer;
        float:right;
      }
      .d .racing-plus-link-wrap .race-link {
        margin: 4px 5px 6px 5px;
        height:20px;
        width:20px;
        float:right;
        filter:drop-shadow(0px 0px 1px #11111194);
      }
      .d .racing-plus-link-wrap .race-link:hover {
        filter:drop-shadow(1px 1px 1px #11111194);
      }
      .d .racing-plus-link-wrap .export-link {
        margin:5px;
        height:20px;
        width:20px;
        float:right;
        filter:drop-shadow(0px 0px 1px #11111194);
      }
      .d .racing-plus-link-wrap .export-link:hover {
        filter:drop-shadow(1px 1px 1px #11111194);
      }
      .d .racing-main-wrap .car-selected-wrap .driver-item > li.status-wrap .status {
        margin:5px!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item {
        font-size:0.7rem!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.car {
        padding: 0 5px;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name {
        width:unset!important;
        display:flex;
        align-items:center;
        flex-grow:1;
        border-right:0 none;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name a {
        flex-basis:fit-content;
        width:unset!important;
        height:20px;
        padding:0;
        margin:0;
        display:block;
        text-decoration:none;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name a:hover {
        text-decoration:underline;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span {
        display:block;
        flex-basis:fit-content;
        width:unset !important;
        height:20px;
        line-height:1.3rem;
        font-size:0.7rem;
        padding:0 7px;
        margin:0;
        border-radius:3px;
        white-space:nowrap;
        color:#ffffff;
        background:rgba(0, 0, 0, 0.25);
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-1 {
        background: #74e80080!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-2 {
        background: #ff262680!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-3 {
        background: #ffc92680!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-4 {
        background: #00d9d980!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-5 {
        background: #0080ff80!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-6 {
        background: #9933ff80!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-7 {
        background: #ff26ff80!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-8 {
        background: #55555580!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-9 {
        background: #f28d8d80!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-10 {
        background: #e1c91980!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-11 {
        background: #a0cf1780!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-12 {
        background: #18d9d980!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-13 {
        background: #6fafee80!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-14 {
        background: #b072ef80!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-15 {
        background: #f080f080!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-16 {
        background: #61616180!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-17 {
        background: #b2000080!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-18 {
        background: #cc990080!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-19 {
        background: #4e9b0080!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-20 {
        background: #009d9d80!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-21 {
        background: #0000b780!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name span.color-22 {
        background: #8c008c80!important;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name div.statistics {
        display:flex;
        flex-grow:1;
        list-style:none;
        align-items:center;
        justify-content:space-between;
        padding:0 10px;
        margin:0;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.time {
        display:none;
      }
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name div.statistics div,
      .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item > li.name li.time {
        flex-basis:fit-content;
        line-height:22px;
        height:22px;
        width:unset!important;
        padding:0 5px;
        margin:0;
        border-radius:3px;
        white-space:nowrap;
        background-color:rgba(0,0,0,0.25);
      }
      .d .left-banner {
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
      .d .right-banner {
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
          left:190px;
        }
        .d .racing-main-wrap .header-wrap .banner .class-desc {
          top:10px !important;
          font-size: 0.8rem !important;
        }
        .d .racing-main-wrap .header-wrap .banner .class-letter {
          top:10px!important;
          font-size:1.25rem!important;
        }
        .d .left-banner,
        .d .right-banner {
          top:0;
          background-image:none!important;
          border:none!important;
          box-shadow:none!important;
        }
      }
    `);
    if (PDA.getValue("rplus_showparts") === "1") {
      let colours = ["#5D9CEC", "#48CFAD", "#FFCE54", "#ED5565", "#EC87C0", "#AC92EC", "#FC6E51", "#A0D468", "#4FC1E9"];
      let categories = [
        ["Spoiler", "Engine Cooling", "Brake Cooling", "Front Diffuser", "Rear Diffuser"],
        ["Pads", "Discs", "Fluid", "Brake Accessory", "Brake Control", "Callipers"],
        ["Gasket", "Engine Porting", "Engine Cleaning", "Fuel Pump", "Camshaft", "Turbo", "Pistons", "Computer", "Intercooler"],
        ["Exhaust", "Air Filter", "Manifold"],
        ["Fuel"],
        ["Overalls", "Helmet", "Fire Extinguisher", "Safety Accessory", "Roll cage", "Cut-off", "Seat"],
        ["Springs", "Front Bushes", "Rear Bushes", "Upper Front Brace", "Lower Front Brace", "Rear Brace", "Front Tie Rods", "Rear Control Arms"],
        ["Shifting", "Differential", "Clutch", "Flywheel", "Gearbox"],
        ["Strip out", "Steering wheel", "Interior", "Windows", "Roof", "Boot", "Hood"],
        ["Tyres", "Wheels"],
      ];
      let partsCSS = "";
      categories.forEach((groups) => {
        groups.forEach((grp, i) => {
          partsCSS += `
        .d .racing-plus-parts-available span[data-part="${grp}"] { color:${colours[i]}; }
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
      PDA.addStyle(partsCSS);
    }
    if (DEBUG_MODE) {
      console.log("Racing+: Styles added.");
    }
  };

  const defer = (selector) => {
    let count = 0;
    return new Promise((resolve, reject) => {
      try {
        const check = () => {
          if (count > DEFERRAL_LIMIT) {
            throw new Error("Deferral timed out.");
          }
          const result = document.querySelector(selector);
          if (result) {
            resolve(result);
          } else {
            if (DEBUG_MODE) {
              console.log("Racing+: Deferring...");
            }
            setTimeout(check, DEFERRAL_INTERVAL);
          }
        };
        check();
      } catch (err) {
        console.error(`Racing+ Error: ${err}`);
        reject(err);
      }
    });
  };

  const deferAll = (selector) => {
    let count = 0;
    return new Promise((resolve, reject) => {
      try {
        const check = () => {
          if (count > DEFERRAL_LIMIT) {
            throw new Error("Deferral timed out.");
          }
          const result = document.querySelectorAll(selector);
          if (result && result.length > 0) {
            resolve(result);
          } else {
            if (DEBUG_MODE) {
              console.log("Racing+: Deferring...");
            }
            setTimeout(check, DEFERRAL_INTERVAL);
          }
        };
        check();
      } catch (err) {
        console.error(`Racing+ Error: ${err}`);
        reject(err);
      }
    });
  };

  // ##############################################################################################

  // Cache last times and interval objects
  let lastTimeByDriverId = new Map();
  let speedIntervalByDriverId = new Map();

  const updateSpeed = async (trackData, driverId) => {
    let timeLi = await defer(`#lbr-${driverId} ul .time`);
    let speedLi = await defer(`#lbr-${driverId} ul .speed`);
    if (timeLi.textContent.indexOf("%") >= 0) {
      let compl = timeLi.textContent.replace("%", "");
      if (lastTimeByDriverId.has(driverId)) {
        let speed = (((compl - lastTimeByDriverId.get(driverId)) / 100) * trackData.laps * trackData.distance * 60 * 60 * 1000) / SPEED_INTERVAL;
        speedLi.textContent = speed.toFixed(2) + "mph";
      }
      lastTimeByDriverId.set(driverId, compl);
    } else {
      speedLi.textContent = "0.00mph";
    }
  };

  // Cache race results
  let raceResults = [];
  const parseRaceData = async (response) => {
    try {
      // Exit if not JSON
      if (!response.trim().startsWith("{")) {
        return;
      }
      if (DEBUG_MODE) {
        console.log("Racing+: Parsing Race Data...");
      }
      let data = JSON.parse(response);
      // update driver skill
      let lastSkill = PDA.getValue("rplus_racingskill");
      let currSkill = Number(data.user.racinglevel).toFixed(5);
      if (currSkill > lastSkill) {
        let skillBanner = await defer(".banner .skill");
        let lastInc = Number(currSkill - lastSkill).toFixed(5);
        if (lastInc) {
          skillBanner.insertAdjacentHTML("afterEnd", `<div class="lastgain">+${lastInc}</div>`);
        }
        PDA.setValue("rplus_racingskill", `${currSkill}`);
        if (DEBUG_MODE) {
          console.log("Racing+: rplus_racingskill saved.");
        }
        skillBanner.textContent = currSkill;
      }
      // calc, sort & show race results
      if (raceResults.length <= 0 && data.timeData.status >= 3) {
        // Populate results
        if (DEBUG_MODE) {
          console.log("Racing+: Populating Race Results...");
        }
        let carsData = data.raceData.cars;
        let carInfo = data.raceData.carInfo;
        let trackIntervals = data.raceData.trackData.intervals.length;
        for (let playername in carsData) {
          let userId = carInfo[playername].userID;
          let intervals = atob(carsData[playername]).split(",");
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
            raceResults.push([userId, playername, "finished", raceTime, bestLap]);
          } else {
            raceResults.push([userId, playername, "crashed", 0, 0]);
          }
        }
        // sort by status then time
        raceResults.sort((a, b) => {
          return b[2].toLocaleLowerCase().localeCompare(a[2].toLocaleLowerCase()) || a[3] - b[3];
        });
        // set best lap for selected driver
        let scriptData = await defer("#torn-user");
        let thisDriverId = JSON.parse(scriptData.value).id;
        let selectedDriver = document.querySelector("#leaderBoard li.selected[id^=lbr-]");
        if (!selectedDriver) {
          selectedDriver = await defer(`#leaderBoard #lbr-${thisDriverId}`);
        }
        //userId, playername, status, raceTime, bestLap
        await setBestLap(selectedDriver.id.substring(4));
        // add export results
        if (PDA.getValue("rplus_showexportlink") === "1") {
          await addExportButton(raceResults, data.user.id, data.raceID, data.timeData.timeEnded);
        }
      }
    } catch (err) {
      // Exit the function if response is unparsable.
      console.error(`Racing+ Error: ${err.error ?? err}`);
      return;
    }
  };

  const formatTime = (msec) => {
    let hours = Math.floor((msec % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    let minutes = Math.floor((msec % (1000 * 60 * 60)) / (1000 * 60));
    let seconds = Math.floor((msec % (1000 * 60)) / 1000);
    let mseconds = Math.floor(msec % 1000);
    return ("00" + minutes).toString().slice(-2) + ":" + ("00" + seconds).toString().slice(-2) + "." + ("000" + mseconds).toString().slice(3);
  };

  const setBestLap = async (driverId) => {
    document.querySelector("li.pd-besttime").textContent = "--:--";
    if (raceResults.length > 0) {
      let driverResult = raceResults.find((r) => {
        return Number(r[0]) === driverId;
      });
      let bestLap = driverResult[4] ? formatTime(driverResult[4] * 1000) : null;
      if (bestLap) {
        document.querySelector("li.pd-besttime").textContent = bestLap;
      }
    }
  };

  const getStatus = async () => {
    // Get race status
    let info = await defer("#infoSpot");
    switch (info.textContent.toLowerCase()) {
      case "race started":
      case "race in progress":
        return "racing";
      case "race finished":
        return "finished";
      default:
        if (info.textContent.includes("Starts:")) {
          return "waiting";
        }
        return "joined";
    }
  };

  const updateLeaderboard = async () => {
    if (DEBUG_MODE) {
      console.log("Racing+: Updating Leaderboard...");
    }
    let apikey = PDA.isTornPDA(API_KEY) ?? PDA.getValue("rplus_apikey");
    // Get race status
    let racestatus = await getStatus();
    console.log(`Racing+: Race Status -> ${racestatus}`);
    // Get track data
    let racingupdates = await defer("#racingupdates .drivers-list .title-black");
    let trackData = {
      laps: racingupdates.textContent.split(" - ")[1].split(" ")[0],
      distance: racingupdates.querySelector(".track-info").getAttribute("data-length").replace("mi", ""),
    };
    // Wait for racers to load then enumerate
    let drivers = await deferAll(".drivers-list ul#leaderBoard li[id^=lbr]");
    Array.from(drivers).forEach(async (drvr) => {
      let driverId = drvr.id.substring(4);
      let driverStatus = drvr.querySelector(".status");
      if (driverStatus) {
        // fix status icon
        switch (racestatus) {
          case "joined":
            driverStatus.className = "status success";
            driverStatus.textContent = "";
            break;
          case "waiting":
            driverStatus.className = "status waiting";
            driverStatus.textContent = "";
            break;
          case "finished":
          case "racing":
          default:
            if (racestatus === "finished" || (racestatus === "racing" && PDA.getValue("rplus_showresults") === "1" && raceResults.length > 0)) {
              // set race result
              let ind = raceResults.findIndex((res) => {
                res[0] === drvr.id;
              });
              let place = ind + 1;
              let result = raceResults[ind];
              if (result[2] === "crashed") {
                driverStatus.className = "status crash";
                driverStatus.textContent = "";
              } else if (place == 1) {
                driverStatus.className = "status gold";
                driverStatus.textContent = "";
              } else if (place == 2) {
                driverStatus.className = "status silver";
                driverStatus.textContent = "";
              } else if (place == 3) {
                driverStatus.className = "status bronze";
                driverStatus.textContent = "";
              } else {
                driverStatus.className = `finished-${place} finished`;
                driverStatus.textContent = `${place}`;
              }
            } else if (racestatus === "racing") {
              driverStatus.className = "status racing";
              driverStatus.textContent = "";
            }
        }
      }
      // Fix driver colours
      let drvrColour = drvr.querySelector("li.color");
      if (drvrColour) {
        drvrColour.classList.remove("color");
        drvr.querySelector("li.name span").className = drvrColour.className;
      }
      // Add driver profile links
      if (PDA.getValue("rplus_addlinks") === "1") {
        // Add links
        if (!drvr.querySelector("li.name a")) {
          drvr.querySelector("li.name span").outerHTML =
            `<a target="_blank" href="/profiles.php?XID=${driverId}">${drvr.querySelector("li.name span").outerHTML}</a>`;
        }
      } else {
        // Remove links
        if (drvr.querySelector("li.name a")) {
          drvr.querySelector("li.name").innerHTML = `${drvr.querySelector("li.name a").innerHTML}`;
        }
      }
      // Fix driver race stats
      if (!drvr.querySelector(".statistics")) {
        // Add stats container
        drvr.querySelector(".name").insertAdjacentHTML("beforeEnd", `<div class="statistics"></div>`);
      }
      let stats = drvr.querySelector(".statistics");
      // Adjust time
      let timeLi = drvr.querySelector("li.time");
      if (timeLi) {
        if (timeLi.textContent === "") {
          timeLi.textContent = "0.00 %";
        }
        let timeContainer = document.createElement("ul");
        timeContainer.appendChild(timeLi);
        stats.insertAdjacentElement("afterEnd", timeContainer);
      }
      // Show driver speed
      if (PDA.getValue("rplus_showspeed") === "1") {
        if (!drvr.querySelector(".speed")) {
          stats.insertAdjacentHTML("beforeEnd", '<div class="speed">0.00mph</div>');
        }
        if (!["joined", "finished"].includes(racestatus) && !speedIntervalByDriverId.has(driverId)) {
          if (DEBUG_MODE) {
            console.log(`Racing+: Adding speed interval for driver ${driverId}.`);
          }
          speedIntervalByDriverId.set(driverId, setInterval(updateSpeed, SPEED_INTERVAL, trackData, driverId));
        }
      }
      // Show driver skill
      if (PDA.getValue("rplus_showskill") === "1") {
        if (!drvr.querySelector(".skill")) {
          stats.insertAdjacentHTML("afterBegin", '<div class="skill">RS: ?</div>');
        }
        if (apikey) {
          // Fetch racing skill data from the Torn API for the given driver id
          try {
            let user = await torn_api(apikey, `user/${driverId}/personalStats`, "stat=racingskill");
            if (user) {
              let skill = stats.querySelector(".skill");
              skill.textContent = `RS: ${user.personalstats.racing.skill}`;
            }
          } catch (err) {
            console.error(`Racing+ Error: ${err.error ?? err}`);
          }
        }
      }
    });
    // #################################################
  };

  const addRaceLinkCopyButton = async (raceId) => {
    // Check if the race link already exists
    if (!document.querySelector(".racing-plus-link-wrap .race-link")) {
      let trackInfo = await defer(".track-info-wrap");
      let racelink_html =
        '<div class="racing-plus-link-wrap">' +
        `<a class="race-link" title="Copy link" href="https://www.torn.com/loader.php?sid=racing&tab=log&raceID=${raceId}">` +
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="-2 -2 20 20" fill="currentColor" stroke-width="0">' +
        '<g><path d="M4.126,5.813a4.279,4.279,0,0,1,6.593.655l-1.5,1.5a2.257,2.257,0,0,0-2.556-1.3,2.22,2.22,0,0,0-1.089.6l-2.87,2.871a2.235,2.235,0,0,0,3.16,3.16l.885-.885a5.689,5.689,0,0,0,2.52.383L7.319,14.746A4.287,4.287,0,0,1,1.256,8.684l2.87-2.871ZM8.684,1.256,6.731,3.208a5.69,5.69,0,0,1,2.52.383l.884-.884a2.235,2.235,0,0,1,3.16,3.16l-2.87,2.87a2.239,2.239,0,0,1-3.16,0,2.378,2.378,0,0,1-.485-.7l-1.5,1.5a4.026,4.026,0,0,0,.531.655,4.282,4.282,0,0,0,6.062,0l2.87-2.87A4.286,4.286,0,1,0,8.684,1.256Z"></path></g>' +
        "</svg>" +
        "</a>" +
        "</div>";
      // Append the link to the info container
      trackInfo.insertAdjacentHTML("afterEnd", racelink_html);

      // Add click event listener to the race link
      let raceLink = await defer(".racing-plus-link-wrap .race-link");
      raceLink.addEventListener("click", async (event) => {
        event.preventDefault();
        // Copy the race link to clipboard using PDA.setClipboard
        PDA.setClipboard(`https://www.torn.com/loader.php?sid=racing&tab=log&raceID=${raceId}`);
        // Try to find the tooltip and update its content
        const tooltipId = event.currentTarget.getAttribute("aria-describedby");
        if (tooltipId) {
          const tooltip = document.querySelector(`#${tooltipId} .ui-tooltip-content`);
          if (tooltip && tooltip.firstChild) {
            tooltip.firstChild.nodeValue = "Copied";
            const tooltipDiv = tooltip.closest("div");
            if (tooltipDiv) {
              const currentLeft = parseFloat(tooltipDiv.style.left || "0");
              tooltipDiv.style.left = `${currentLeft + 6}px`;
            }
          }
        }
      });
    }
  };

  const addExportButton = async (results, driverId, raceId, timeEnded) => {
    if (!document.querySelector(".racing-plus-link-wrap .export-link")) {
      let trackInfo = await defer(".track-info-wrap");
      let csv = "position,id,name,status,time,best_lap,racing_skill\n";
      for (let i = 0; i < results.length; i++) {
        const timeStr = formatTime(results[i][3] * 1000);
        const bestLap = formatTime(results[i][4] * 1000);
        csv +=
          [i + 1, results[i][0], results[i][1], results[i][2], timeStr, bestLap, results[i][0] === driverId ? PDA.getValue("racingSkill") : ""].join(",") +
          "\n";
      }
      const timeE = new Date();
      timeE.setTime(timeEnded * 1000);
      const fileName = `${timeE.getUTCFullYear()}${("00" + (timeE.getUTCMonth() + 1)).slice(-2)}${("00" + timeE.getUTCDate()).slice(-2)}-race_${raceId}.csv`;
      const myblob = new Blob([csv], { type: "application/octet-stream" });
      const myurl = window.URL.createObjectURL(myblob);
      const exportlink_html =
        '<div class="racing-plus-link-wrap">' +
        `<a class="export-link" title="Export CSV" href="${myurl}" download="${fileName}">` +
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" stroke-width="0"><g><path d="M17,2.25V18H2V2.25H5.5l-2,2.106V16.5h12V4.356L13.543,2.25H17Zm-2.734,3L11.781,2.573V2.266A2.266,2.266,0,0,0,7.25,2.25v.323L4.777,5.25ZM9.5,1.5a.75.75,0,1,1-.75.75A.75.75,0,0,1,9.5,1.5ZM5.75,12.75h7.5v.75H5.75Zm0-.75h7.5v-.75H5.75Zm0-1.5h7.5V9.75H5.75Zm0-1.5h7.5V8.25H5.75Z" fill="currentColor" stroke-width="0"></path></g></svg>' +
        "</a>" +
        "</div>";
      trackInfo.insertAdjacentHTML("afterEnd", exportlink_html);
    }
  };

  const officialEvents = async () => {
    let scriptData = await defer("#torn-user");
    let ldrboard = await defer(".drivers-list #leaderBoard");
    let thisDriver = await defer(`.drivers-list #leaderBoard #lbr-${JSON.parse(scriptData.value).id}`);

    // Add race link copy button
    if (PDA.getValue("rplus_showracelink") === "1") {
      await addRaceLinkCopyButton(thisDriver.getAttribute("data-id").split("-")[0]);
    }
    // Update labels (save some space).
    document.querySelectorAll("#racingdetails li.pd-name").forEach((detail) => {
      if (detail.textContent === "Name:") {
        detail.remove();
      }
      if (detail.textContent === "Position:") {
        detail.textContent = "Pos:";
      }
      if (detail.textContent === "Last Lap:") {
        detail.textContent = "Last:";
        detail.classList.toggle("t-hide", false);
      }
      if (detail.textContent === "Completion:") {
        detail.textContent = "Best:";
        detail.classList.toggle("m-hide", false);
      }
    });
    // Update laptime value
    let laptime = document.querySelector("#racingdetails li.pd-laptime");
    laptime.classList.toggle("t-hide", false);
    // Update completion value
    let besttime = document.querySelector("#racingdetails li.pd-completion");
    besttime.classList.toggle("m-hide", false);
    besttime.classList.toggle("pd-completion", false);
    besttime.classList.toggle("pd-besttime", true);
    besttime.textContent = "--:--";
    // Add driver click event handlers
    let drivers = await deferAll("#leaderBoard li[id^=lbr-]");
    drivers.forEach((d) => {
      d.addEventListener("click", async (event) => {
        event.preventDefault();
        await setBestLap(event.currentTarget.id.substring(4));
      });
    });
    // Load leaderboard
    await updateLeaderboard();
    // Watch leaderboard for changes
    if (DEBUG_MODE) {
      console.log("Racing+: Adding Leaderboard Observer...");
    }
    let leaderboardObserver = new MutationObserver(async (mutations) => {
      await updateLeaderboard();
    });
    leaderboardObserver.observe(ldrboard, { childList: true });
  };

  let originalOpen;
  const loadXMLHttpRequestMonkey = async () => {
    if (!originalOpen) {
      if (DEBUG_MODE) {
        console.log("Racing+: Adding XMLHttpRequest Monkey...");
      }
      originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (...args) {
        this.addEventListener("load", async (ev) => {
          if (
            ev.target &&
            ev.target.responseURL &&
            ev.target.responseURL.startsWith(`${window.location.origin}${window.location.pathname}`) &&
            ev.target.response
          ) {
            await parseRaceData(ev.target.response);
          }
        });
        originalOpen.apply(this, args);
      };
    }
  };

  const unloadXMLHttpRequestMonkey = async () => {
    if (originalOpen) {
      if (DEBUG_MODE) {
        console.log("Racing+: Removing XMLHttpRequest Monkey...");
      }
      XMLHttpRequest.prototype.open = originalOpen;
      originalOpen = null;
    }
  };

  const enlistedCars = async () => {
    document.querySelectorAll(".enlist-list .enlist-info .enlisted-stat").forEach((ul) => {
      let wonRaces = ul.children[0].textContent.replace(/[\n\s]/g, "").replace("•Raceswon:", "");
      let totalRaces = ul.children[1].textContent.replace(/[\n\s]/g, "").replace("•Racesentered:", "");
      ul.children[0].textContent = `• Races won: ${wonRaces} / ${totalRaces}`;
      ul.children[1].textContent = `• Race win rate: ${totalRaces <= 0 ? 0 : Math.round((wonRaces / totalRaces) * 10000) / 100}%`;
    });
  };

  const partsModifications = async () => {
    let categories = {};
    // Select all category list items except those with .empty or .clear
    let elems = await deferAll(".pm-categories li:not(.empty):not(.clear)");
    Array.from(elems).forEach((category) => {
      // Get the category id
      const cat = category.getAttribute("data-category");
      // Get the category name from classList (excluding 'unlock')
      let categoryName = [...category.classList].find((c) => c !== "unlock");
      // Initialize bought and unbought arrays for this category
      categories[cat] = { bought: [], unbought: [] };
      // Select all parts that belong to this category and have a valid data-part attribute
      const parts = document.querySelectorAll(`.pm-items li.${categoryName}[data-part]:not([data-part=""])`);
      parts.forEach((part) => {
        let groupName = part.getAttribute("data-part");
        if (part.classList.contains("bought")) {
          // Add to bought if not already included
          if (!categories[cat].bought.includes(groupName)) {
            categories[cat].bought.push(groupName);
          }
          // Replace 'bought' with 'active' on the control.
          part.classList.toggle("bought", false);
          part.classList.toggle("active", true);
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
            if (!el.classList.contains("active")) {
              el.classList.toggle("bought", true);
            }
          });
          // Remove from unbought
          categories[cat].unbought.splice(categories[cat].unbought.indexOf(b), 1);
        }
      });
      // Create a div showing the count of bought/unbought parts
      const divParts = document.createElement("div");
      let boughtParts = Object.keys(categories[cat].bought).length;
      let totalParts = boughtParts + Object.keys(categories[cat].unbought).length;
      divParts.className = boughtParts === totalParts ? "parts bought" : "parts";
      divParts.innerHTML = `${boughtParts} / ${totalParts}`;
      // Insert the parts count div after the icon element
      const iconContainer = category.querySelector("a.link div.icons div.icon");
      if (iconContainer) {
        iconContainer.insertAdjacentElement("afterend", divParts);
      }
    });
    // Add available parts sections
    const links = await deferAll(".pm-categories li a.link");
    Array.from(links).forEach(async (link) => {
      let catId = link.parentElement?.getAttribute("data-category");
      let partscat = await defer(`.pm-items-wrap[category="${catId}"]`);
      // Remove existing parts available section.
      const existing = partscat.querySelectorAll(".racing-plus-parts-available");
      existing.forEach((ex) => {
        ex.remove();
      });
      // Create new parts available section.
      const div = document.createElement("div");
      div.className = "racing-plus-parts-available";
      let content = Object.entries(categories[catId].unbought)
        .sort(([, a], [, b]) => a.localeCompare(b)) // Sort by value
        .map(([key, val]) => `<span data-part="${val}">${val.replace("Tyres", "Tires")}</span>`)
        .join(", ");
      div.innerHTML = `<span class="bold nowrap">Parts Available:</span><span>${content.length > 0 ? content : "None"}</span>`;
      let titlediv = partscat.querySelector(".title-black");
      titlediv.insertAdjacentHTML("afterEnd", div.outerHTML);
    });

    let props = await deferAll(".properties-wrap .properties");
    Array.from(props).forEach((prop) => {
      let propName = prop.querySelector(".name");
      let propVal = prop
        .querySelector(".progress-bar .progressbar-wrap[title]")
        .getAttribute("title")
        .replace(/\s/g, "")
        .match(/[+-]\d+/);
      if (propVal) {
        let propNum = parseInt(propVal[0]);
        propName.insertAdjacentHTML("afterBegin", `<span class="${propNum > 0 ? "positive" : propNum < 0 ? "negative" : ""}">${propVal[0]}%</span> `);
      }
    });
  };

  const restructureBanner = async () => {
    if (DEBUG_MODE) {
      console.log("Racing+: Fixing top banner...");
    }
    const banner = await defer(".banner");
    // update driver skill
    let savedSkill = PDA.getValue("rplus_racingskill");
    if (savedSkill) {
      document.querySelector(".banner .skill").textContent = savedSkill;
    }
    // Create new containers
    const leftBanner = document.createElement("div");
    leftBanner.className = "left-banner";
    const rightBanner = document.createElement("div");
    rightBanner.className = "right-banner";
    // Move elements into the new containers
    const elements = Array.from(banner.children);
    elements.forEach((el) => {
      if (el.classList.contains("skill-desc") || el.classList.contains("skill") || el.classList.contains("lastgain")) {
        leftBanner.appendChild(el);
      } else if (el.classList.contains("class-desc") || el.classList.contains("class-letter")) {
        rightBanner.appendChild(el);
      }
    });
    // Clear original banner and append new structure
    banner.innerHTML = "";
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
    if (addedNodes.length > 0 && !Array.from(addedNodes).some((node) => node.classList?.contains("ajax-preloader"))) {
      if (Array.from(addedNodes).some((node) => node.id === "racingupdates")) {
        await officialEvents();
        await loadXMLHttpRequestMonkey();
      } else if (Array.from(addedNodes).some((node) => node.classList?.contains("enlist-wrap")) && PDA.getValue("rplus_showwinrate") === "1") {
        await enlistedCars();
        await unloadXMLHttpRequestMonkey();
      } else if (Array.from(addedNodes).some((node) => node.classList?.contains("pm-categories-wrap")) && PDA.getValue("rplus_showparts") === "1") {
        await partsModifications();
        await unloadXMLHttpRequestMonkey();
      }
    }
  });
  // Add Racing+ styles to DOM
  await addRacingPlusStyles();
  // Add Racing+ elements to DOM
  await initializeRacingPlus();
  // Fix top banner
  await restructureBanner();
  if (DEBUG_MODE) {
    console.log("Racing+: Adding Page Observer...");
  }
  let innerpage = await defer("#racingAdditionalContainer");
  pageObserver.observe(innerpage, { childList: true });
  // Load default page
  await officialEvents();
  await loadXMLHttpRequestMonkey();
})();
