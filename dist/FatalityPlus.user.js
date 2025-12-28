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
const APP_START=Date.now();const MS=Object.freeze({second:1e3,minute:6e4,hour:36e5,day:864e5});const DEFERRAL_TIMEOUT=15*MS.second;
/**
 * unixTimestamp
 * Description: Returns the current Unix timestamp (seconds since epoch).
 * @returns {number} Current Unix timestamp (seconds)
 */const unixTimestamp=()=>Math.floor(Date.now()/1e3);
/**
 * isNumber
 * Description: Returns true for number primitives that are finite (excludes NaN and ±Infinity).
 * @param {unknown} n - Value to test.
 * @returns {boolean} True if n is a finite number primitive.
 */const isNumber=n=>typeof n==="number"&&Number.isFinite(n);
/**
 * Format helper
 * @class
 */class Format{
/**
   * Formats a timestamp as "YYYY-MM-DD" in local time.
   * @param {number} ms - Timestamp in milliseconds since epoch.
   * @returns {string} Formatted date string ("YYYY-MM-DD")
   */
static date=timestamp=>{const dt=new Date(timestamp);return`${String(dt.getFullYear())}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`};
/**
   * Formats a timestamp as "MM:SS.mmm".
   * @param {number} ms - Duration in milliseconds.
   * @returns {string} Formatted time string ("MM:SS.mmm")
   */
static time=timestamp=>{const dt=new Date(timestamp);return`${String(dt.getMinutes()).padStart(2,"0")}:${String(dt.getSeconds()).padStart(2,"0")}.${String(dt.getMilliseconds()).padStart(3,"0")}`};
/**
   * Formats a duration (ms) as "MM:SS.mmm".
   * @param {number} ms - Duration in milliseconds.
   * @returns {string} Formatted time string ("MM:SS.mmm")
   */
static duration=duration=>`${String(Math.floor(duration%MS.hour/MS.minute)).padStart(2,"0")}:${String(Math.floor(duration%MS.minute/MS.second)).padStart(2,"0")}.${String(Math.floor(duration%MS.second)).padStart(3,"0")}`;
/**
   * Returns a human-readable error string (name + message).
   * @returns {string}
   */
static error=error=>`${error?.name?String(error.name):"Error"}: ${error?.message?String(error.message):error}`}
/**
 * LOG_LEVEL - Log level enumeration
 * @readonly
 * @enum {number}
 */const LOG_LEVEL=Object.freeze({debug:10,info:20,warn:30,error:40,silent:50});
/**
 * LOG_MODE - Log level threshold LOG_LEVEL[debug|info|warn|error|silent]
 * @type {number}
 */const LOG_MODE=LOG_LEVEL.debug;
/**
 * Static methods for leveled console logging.
 * @class
 */class Logger{
/** logs a debug-level message. */
static debug(message,time=null){if(LOG_MODE>LOG_LEVEL.debug)return;const dt=Date.now();console.log("%c[DEBUG][TornPDA.Racing+]: ","color:#6aa84f;font-weight:600",message,time?` ${Format.duration(dt-time)}`:` ${Format.date(dt)}`)}
/** logs an info-level message. */static info(message,time=null){if(LOG_MODE>LOG_LEVEL.info)return;const dt=Date.now();console.log("%c[INFO][TornPDA.Racing+]: ","color:#3d85c6;font-weight:600",message,time?` ${Format.duration(dt-time)}`:` ${Format.date(dt)}`)}
/** Logs a warning-level message. */static warn(message,time=null){if(LOG_MODE>LOG_LEVEL.warn)return;const dt=Date.now();console.log("%c[WARN][TornPDA.Racing+]: ","color:#e69138;font-weight:600",message,time?` ${Format.duration(dt-time)}`:` ${Format.date(dt)}`)}
/** Logs an error-level message. */static error(message,time=null){if(LOG_MODE>LOG_LEVEL.error)return;const dt=Date.now();console.log("%c[ERROR][TornPDA.Racing+]: ","color:#d93025;font-weight:600",message,time?` ${Format.duration(dt-time)}`:` ${Format.date(dt)}`)}}
/**
 * Store Wrapper classs for localStorage.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
 * @class
 */class Store{
/**
   * Get a value by key from localStorage
   * @param {string} key - Storage key
   * @returns {string|null} Stored value or null
   */
static getValue=key=>localStorage.getItem(key);
/**
   * Set a value by key in localStorage
   * @param {string} key - Storage key
   * @param {string} value - Value to store
   */
static setValue=(key,value)=>localStorage.setItem(key,value);
/**
   * Delete a value by key from localStorage
   * @param {string} key - Storage key
   */
static deleteValue=key=>localStorage.removeItem(key);
/**
   * Clears all keys out of the storage.
   */
static deleteAll=()=>localStorage.clear();
/**
   * List all stored values (for debugging)
   * @returns {Array<string>} Array of stored values
   */
static listValues=()=>Object.values(localStorage);
/**
   * Map from toggle/control ids to persistent localStorage keys.
   */
static keys=Object.freeze({fplus_executelevel:"FATALITYPLUS_EXECUTELEVEL"})}(async w=>{if(w.fatality_plus)return;w.fatality_plus=unixTimestamp();Logger.info(`Application loading...`);const EXECUTE_LEVEL=15;
/**
   * defer - Wait for a selector to appear using MutationObserver with timeout.
   * @param {string} selectors - CSS selector(s)
   * @returns {Promise<Element>} Resolved element
   */const defer=selectors=>new Promise((resolve,reject)=>{const found=w.document.querySelector(selectors);if(found)return resolve(found);let obs;const timer=setTimeout(()=>{cleanup();reject(new Error(`deferral timed out: '${selectors}'`))},DEFERRAL_TIMEOUT);const cleanup=()=>{clearTimeout(timer);obs?.disconnect()};obs=new MutationObserver(()=>{const el=w.document.querySelector(selectors);if(el){cleanup();resolve(el)}});obs.observe(w.document.documentElement||w.document,{childList:true,subtree:true})});
/**
   * Creates an element with supplied properties.
   * @param {keyof HTMLElementTagNameMap} tag - The HTML tag to create.
   * @param {Object} props - HTML element properties + optional 'children' array/element.
   * @returns {HTMLElement} The constructed element.
   */const newElement=(tag,props={})=>{const{children:children,...rest}=props;const el=Object.assign(w.document.createElement(tag),rest);if(children){
// Convert single child to array and append all
const childrenArray=Array.isArray(children)?children:[children];el.append(...childrenArray)}return el};
/**
   * addStyles - Injects Racing+ CSS into document head.
   * @returns {Promise<void>}
   */const addStyles=async()=>{Logger.debug(`Injecting styles...`);w.document.head.appendChild(newElement("style",{innerHTML:`.execute{background-image:linear-gradient(#ffb46c,#ffa737)!important}`}));Logger.debug(`Styles injected.`)};const checkExecute=async progress=>{Logger.debug("Checking HealthBar...");if(!progress){Logger.error("Invalid progress.");return}let targetHealth=parseFloat(progress.ariaLabel.replace(/Progress: (\d{1,3}\.?\d{0,2})%/,"$1"));if(targetHealth<=EXECUTE_LEVEL){progress.classList.toggle("execute",true)}else{progress.classList.toggle("execute",false)}};let user=await defer("#torn-user");let userdata=JSON.parse(user.value);let healthBar=await defer(`div[class^="playersModelWrap_"] div[class^="header_"]:not([aria-describedby^="player-name_${userdata.playername}"])`);if(healthBar){Logger.debug("Adding HealthBar Observer...");let healthBarObserver=new MutationObserver(async mutations=>{for(const mutation of mutations){if(mutation.type==="attributes"&&mutation.attributeName==="aria-label"&&mutation.target.ariaLabel&&mutation.target.ariaLabel.startsWith("Progress:")){await checkExecute(mutation.target)}}});healthBarObserver.observe(healthBar.parentElement,{subtree:true,attributes:true});await checkExecute(healthBar.querySelector('[aria-label^="Progress:"]'))}await addStyles()})();