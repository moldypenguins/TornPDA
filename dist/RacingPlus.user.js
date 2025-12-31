// ==UserScript==
// @name         TornPDA.Racing+
// @namespace    TornPDA.RacingPlus
// @copyright    Copyright © 2025 moldypenguins
// @license      MIT
// @version      1.0.70-alpha
// @description  Show racing skill, current speed, race results, precise skill, upgrade parts.
// @author       moldypenguins [2881784] - Adapted from Lugburz [2386297] + some styles from TheProgrammer [2782979]
// @match        https://www.torn.com/page.php?sid=racing*
// @icon64       https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @updateURL    https://github.com/moldypenguins/TornPDA/raw/refs/heads/main/dist/RacingPlus.user.js
// @downloadURL  https://github.com/moldypenguins/TornPDA/raw/refs/heads/main/dist/RacingPlus.user.js
// @connect      api.torn.com
// @grant        none
// @run-at       document-start
// ==/UserScript==
"use strict";
const MS=Object.freeze({second:1e3,minute:6e4,hour:36e5,day:864e5});const KMS_PER_MI=1.609344;const API_FETCH_TIMEOUT=10*MS.second;const DEFERRAL_TIMEOUT=15*MS.second;const SPEED_INTERVAL=MS.second;const CACHE_TTL=MS.hour;const SELECTORS=Object.freeze({header_root:"#racing-leaderboard-header-root",main_container:"#racingMainContainer",main_banner:"#racingMainContainer .header-wrap div.banner",tabs_container:"#racingMainContainer .header-wrap ul.categories",content_container:"#racingAdditionalContainer",car_selected:"#racingupdates .car-selected",drivers_list:"#racingupdates .drivers-list",drivers_list_title:"#racingupdates .drivers-list div[class^='title']",drivers_list_leaderboard:"#racingupdates .drivers-list #leaderBoard"});
/**
 * Returns the current Unix timestamp (seconds since epoch).
 * @returns {number} Current Unix timestamp (seconds)
 */const unixTimestamp=()=>Math.floor(Date.now()/1e3);
/**
 * Returns true for number primitives that are finite (excludes NaN and ±Infinity).
 * @param {unknown} n - Value to test.
 * @returns {boolean} True if n is a finite number primitive.
 */const isNumber=n=>typeof n==="number"&&Number.isFinite(n);
/**
 * Static utility methods for formatting timestamps, durations, and errors.
 * @class
 */class Format{
/**
   * Formats a timestamp as "YYYY-MM-DD" in local time.
   * @param {number} timestamp - Timestamp in milliseconds since epoch.
   * @returns {string} Formatted date string ("YYYY-MM-DD")
   */
static date=timestamp=>{const dt=new Date(timestamp);return`${String(dt.getFullYear())}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`};
/**
   * Formats a timestamp as "MM:SS.mmm".
   * @param {number} timestamp - Timestamp in milliseconds since epoch.
   * @returns {string} Formatted time string ("MM:SS.mmm")
   */
static time=timestamp=>{const dt=new Date(timestamp);return`${String(dt.getMinutes()).padStart(2,"0")}:${String(dt.getSeconds()).padStart(2,"0")}.${String(dt.getMilliseconds()).padStart(3,"0")}`};
/**
   * Formats a duration as "MM:SS.mmm".
   * @param {number} duration - Duration in milliseconds.
   * @returns {string} Formatted time string ("MM:SS.mmm")
   */
static duration=duration=>`${String(Math.floor(duration%MS.hour/MS.minute)).padStart(2,"0")}:${String(Math.floor(duration%MS.minute/MS.second)).padStart(2,"0")}.${String(Math.floor(duration%MS.second)).padStart(3,"0")}`;
/**
   * Returns a human-readable error string (name + message).
   * @param {Error|object|string} error - Error object or string
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
 * Static methods for leveled console logging with timestamp and color formatting.
 * @class
 */class Logger{
/**
   * Logs a debug-level message.
   * @param {string} message - Message to log
   * @param {number|null} time - Optional start timestamp for duration calculation
   */
static debug(message,time=null){if(LOG_MODE>LOG_LEVEL.debug)return;const dt=Date.now();console.log("%c[DEBUG][TornPDA.Racing+]: ","color:#6aa84f;font-weight:600",message,time?` ${dt-time}ms`:` ${Format.date(dt)} ${Format.time(dt)}`)}
/**
   * Logs an info-level message.
   * @param {string} message - Message to log
   * @param {number|null} time - Optional start timestamp for duration calculation
   */static info(message,time=null){if(LOG_MODE>LOG_LEVEL.info)return;const dt=Date.now();console.log("%c[INFO][TornPDA.Racing+]: ","color:#3d85c6;font-weight:600",message,time?` ${dt-time}ms`:` ${Format.date(dt)} ${Format.time(dt)}`)}
/**
   * Logs a warning-level message.
   * @param {string} message - Message to log
   * @param {number|null} time - Optional start timestamp for duration calculation
   */static warn(message,time=null){if(LOG_MODE>LOG_LEVEL.warn)return;const dt=Date.now();console.log("%c[WARN][TornPDA.Racing+]: ","color:#e69138;font-weight:600",message,time?` ${dt-time}ms`:` ${Format.date(dt)} ${Format.time(dt)}`)}
/**
   * Logs an error-level message.
   * @param {string} message - Message to log
   * @param {number|null} time - Optional start timestamp for duration calculation
   */static error(message,time=null){if(LOG_MODE>LOG_LEVEL.error)return;const dt=Date.now();console.log("%c[ERROR][TornPDA.Racing+]: ","color:#d93025;font-weight:600",message,time?` ${dt-time}ms`:` ${Format.date(dt)} ${Format.time(dt)}`)}}
/**
 * Wrapper class for localStorage with typed keys and convenience methods.
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
static keys=Object.freeze({rplus_apikey:"RACINGPLUS_APIKEY",rplus_units:"RACINGPLUS_DISPLAYUNITS",rplus_addlinks:"RACINGPLUS_ADDPROFILELINKS",rplus_showskill:"RACINGPLUS_SHOWRACINGSKILL",rplus_showspeed:"RACINGPLUS_SHOWCARSPEED",rplus_showracelink:"RACINGPLUS_SHOWRACELINK",rplus_showresults:"RACINGPLUS_SHOWRESULTS",rplus_showexportlink:"RACINGPLUS_SHOWEXPORTLINK",rplus_showwinrate:"RACINGPLUS_SHOWCARWINRATE",rplus_highlightcar:"RACINGPLUS_HIGHLIGHTCAR",rplus_showparts:"RACINGPLUS_SHOWCARPARTS",rplus_driver:"RACINGPLUS_DRIVER"})}
/**
 * Distance class - Stores distance and formats value based on preferred units
 * @class
 */class Distance{
/**
   * Creates a Distance instance
   * @param {object} [args={}] - Constructor arguments
   * @param {number} [args.miles=null] - Distance in miles
   * @param {number} [args.kilometers=null] - Distance in kilometers
   * @throws {TypeError} If miles is not a finite number
   */
constructor(args={}){const{miles:miles,kilometers:kilometers}=args;if(miles==null&&kilometers==null){throw new TypeError("One of miles or kilometers must be specified.")}const mi=miles??(kilometers!=null?kilometers/KMS_PER_MI:0);if(!isNumber(mi)){throw new TypeError("Miles or Kilometers must be a number.")}this._mi=mi;this._units=kilometers!=null?"km":"mi"}
/**
   * Get distance in miles
   * @returns {number} Distance in miles
   */get mi(){return this._mi}
/**
   * Get distance in kilometers
   * @returns {number} Distance in kilometers
   */get km(){return this._mi*KMS_PER_MI}
/**
   * Format distance as string according to chosen units
   * @returns {string} Formatted distance with units
   */toString(){const val=this._units==="km"?this.km:this.mi;return`${val.toFixed(2)} ${this._units}`}}
/**
 * Speed class - Computes speed from Distance and elapsed time
 * @class
 */class Speed{
/**
   * Creates a Speed instance
   * @param {object} args - Constructor arguments
   * @param {Distance} args.distance - Distance traveled
   * @param {number} args.seconds - Elapsed time in seconds (> 0)
   * @throws {TypeError} If distance is not a Distance instance or seconds invalid
   */
constructor(args={}){const{distance:distance,seconds:seconds}=args;if(!(distance instanceof Distance)){throw new TypeError("distance must be a Distance instance.")}if(!Number.isInteger(seconds)||seconds<=0){throw new TypeError("seconds must be an integer > 0.")}this._mph=distance.mi/(seconds/(MS.second*MS.hour));this._units=Store.getValue(Store.keys.rplus_units)??"mph"}
/**
   * Get speed in miles per hour
   * @returns {number} Speed in mph
   */get mph(){return this._mph}
/**
   * Get speed in kilometers per hour
   * @returns {number} Speed in kph
   */get kph(){return this._mph*KMS_PER_MI}
/**
   * Format speed according to preferred units
   * @returns {string} Formatted speed with units
   */toString(){const val=this._units==="kph"?this.kph:this.mph;return`${val.toFixed(2)} ${this._units}`}}const RACE_COLOURS=["#5D9CEC","#48CFAD","#FFCE54","#ED5565","#EC87C0","#AC92EC","#FC6E51","#A0D468","#4FC1E9"];const RACE_TRACKS={6:{name:"Uptown",distance:new Distance({miles:2.25}),laps:7},7:{name:"Withdrawal",distance:new Distance({miles:3.4}),laps:5},8:{name:"Underdog",distance:new Distance({miles:1.73}),laps:9},9:{name:"Parkland",distance:new Distance({miles:3.43}),laps:5},10:{name:"Docks",distance:new Distance({miles:3.81}),laps:5},11:{name:"Commerce",distance:new Distance({miles:1.09}),laps:15},12:{name:"Two Islands",distance:new Distance({miles:2.71}),laps:6},15:{name:"Industrial",distance:new Distance({miles:1.35}),laps:12},16:{name:"Vector",distance:new Distance({miles:1.16}),laps:14},17:{name:"Mudpit",distance:new Distance({miles:1.06}),laps:15},18:{name:"Hammerhead",distance:new Distance({miles:1.16}),laps:14},19:{name:"Sewage",distance:new Distance({miles:1.5}),laps:11},20:{name:"Meltdown",distance:new Distance({miles:1.2}),laps:13},21:{name:"Speedway",distance:new Distance({miles:.9}),laps:18},23:{name:"Stone Park",distance:new Distance({miles:2.08}),laps:8},24:{name:"Convict",distance:new Distance({miles:1.64}),laps:10}};const PART_CATEGORIES={Aerodynamics:["Spoiler","Engine Cooling","Brake Cooling","Front Diffuser","Rear Diffuser"],Brakes:["Pads","Discs","Fluid","Brake Accessory","Brake Control","Callipers"],Engine:["Gasket","Engine Porting","Engine Cleaning","Fuel Pump","Camshaft","Turbo","Pistons","Computer","Intercooler"],Exhaust:["Exhaust","Air Filter","Manifold"],Fuel:["Fuel"],Safety:["Overalls","Helmet","Fire Extinguisher","Safety Accessory","Roll cage","Cut-off","Seat"],Suspension:["Springs","Front Bushes","Rear Bushes","Upper Front Brace","Lower Front Brace","Rear Brace","Front Tie Rods","Rear Control Arms"],Transmission:["Shifting","Differential","Clutch","Flywheel","Gearbox"],"Weight Reduction":["Strip out","Steering wheel","Interior","Windows","Roof","Boot","Hood"],"Wheels & Tires":["Tyres","Wheels"]};
/**
 * List of valid Torn API root strings.
 * @readonly
 * @type {readonly ["user","faction","market","racing","forum","property","key","torn"]}
 */const API_VALID_ROOTS=Object.freeze(/** @type {const} */["user","faction","market","racing","forum","property","key","torn"]);
/**
 * Union type of valid roots, derived from API_VALID_ROOTS.
 * @typedef {typeof API_VALID_ROOTS[number]} ApiRoot
 */const API_KEY_LENGTH=16;const API_COMMENT="RacingPlus";
/**
 * TornAPI access level enumeration
 * @readonly
 * @enum {number}
 */const ACCESS_LEVEL=Object.freeze({Public:0,Minimal:1,Limited:2,Full:3});
/**
 * TornAPI class - Wrapper for authenticated Torn API calls with caching and timeouts
 * @see https://www.torn.com/swagger/index.html
 * @class
 */class TornAPI{
/**
   * Creates a TornAPI instance
   * @param {string|null} key
   */
constructor(){
/** @type {Map<string, {data:any, timestamp:number}>} */
this.cache=new Map;
/** @type {string|null} */this.key=Store.getValue(Store.keys.rplus_apikey)}
/**
   * Makes a Torn API request (with caching) after validating the path and root.
   * @param {ApiRoot} root - API root
   * @param {string} path - API path (e.g., 'key/info' or '/user/stats')
   * @param {object|string} [args={}] - Query parameters object or a prebuilt query string
   * @returns {Promise<object|null>} API response data if available
   * @throws {Error} If path/root inputs are invalid
   */async request(root,path,params={}){if(!API_VALID_ROOTS.includes(root)){throw new Error(`Invalid API root. Must be one of: ${API_VALID_ROOTS.join(", ")}`)}if(typeof path!=="string")throw new Error("Invalid path. Must be a string.");let queryString="";if(params!=null&&typeof params==="object"&&Object.entries(params).length>0){queryString=Object.entries(params).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}else{throw new Error("Invalid argument. Params must be an object.")}const queryURL="https://api.torn.com/v2"+`/${root}/${path.replace(/^\/+|\/+$/g,"")}`+`?comment=${API_COMMENT}${this.key?`&key=${this.key}`:""}${queryString?`&${queryString}`:""}`;const cached=this.cache.get(queryURL);if(cached&&Date.now()-cached.timestamp<CACHE_TTL)return cached.data;const controller=new AbortController;const timer=setTimeout(()=>controller.abort(),API_FETCH_TIMEOUT);try{const response=await fetch(queryURL,{signal:controller.signal});if(!response.ok){throw new Error(`HTTP ${response.status} ${response.statusText||""}`.trim())}const results=await response.json().catch(err=>{throw new Error(`Invalid JSON response: ${err}`)});if(!results||results.error){throw new Error(`API request failed: ${results?.error?.error??"Unknown error."}`)}this.cache.set(queryURL,{data:results,timestamp:Date.now()});return results}catch(err){Logger.warn(`API request failed: ${err}`);throw err}finally{clearTimeout(timer)}}
/**
   * Validates a Torn API key by calling /key/info
   * @param {string} key - API key to validate
   * @returns {Promise<boolean>} True if valid with sufficient access
   * @throws {Error}
   */async validate(key){if(!key||typeof key!=="string"||key.length!==API_KEY_LENGTH){throw new Error("Invalid API key: local validation.")}const prev_key=this.key;this.key=key;const data=await this.request("key","info",{timestamp:`${unixTimestamp()}`});if(data?.info?.access&&Number(data.info.access.level)>=ACCESS_LEVEL.Minimal){Logger.debug("Valid API key.");Store.setValue(Store.keys.rplus_apikey,this.key);return true}this.key=prev_key;throw new Error("Invalid API key: unexpected response.")}
/**
   * Clear the key and localStorage
   */clear(){Store.deleteValue(Store.keys.rplus_apikey);this.key=null}}(async w=>{if(w.racing_plus)return;w.racing_plus=Date.now();
/** @type {TornAPI} */let torn_api;
/** @type {TornDriver} */let this_driver;
/** @type {TornRace} */let this_race;Logger.info(`Application loading...`);
// TornPDA Integration Stub
const PDA_KEY="###PDA-APIKEY###";
// IS_PDA is a boolean indicating whether script is running in TornPDA.
const IS_PDA=!PDA_KEY.includes("###")&&typeof w.flutter_inappwebview!=="undefined"&&typeof w.flutter_inappwebview.callHandler==="function";
/**
   * TornDriver - Stores skill and per-track best records for current user
   * @class
   */class TornDriver{
/**
     * Creates a TornDriver instance for a driver id.
     * @param {string|number} driver_id - Driver user ID
     */
constructor(driver_id){this.id=driver_id;this.skill=0;this.records={};this.cars={}}
/**
     * Load driver data from localStorage
     */load(){const raw=Store.getValue(Store.keys.rplus_driver);if(raw){try{const driver=JSON.parse(raw);if(driver&&driver.id===this.id){this.skill=Number(driver.skill)||0;this.records=driver.records||{};this.cars=driver.cars||{}}}catch(err){
// Log parse errors in debug mode
Logger.warn(`Failed to load driver cache.\n${err}`)}}}
/**
     * Save driver data to localStorage
     */save(){const payload=JSON.stringify({id:this.id,skill:this.skill,records:this.records,cars:this.cars});Store.setValue(Store.keys.rplus_driver,payload)}
/**
     * Update stored skill if newer value is higher (skill increases only)
     * @param {number|string} skill - New skill value
     */updateSkill(skill){const v=Number(skill);if(isNumber(v)){this.skill=Math.max(this.skill,v);this.save()}}
/**
     * Fetch racing records from API and store best lap per car/track
     * @returns {Promise<void>}
     */async updateRecords(){try{if(!torn_api||!torn_api.key)throw new Error("TornAPI not initialized.");const results=await torn_api.request("user","racingrecords",{timestamp:`${unixTimestamp()}`});if(Array.isArray(results?.racingrecords)){results.racingrecords.forEach(({track:track,records:records})=>{if(!track?.id||!Array.isArray(records))return;this.records[track.id]=records.reduce((acc,rec)=>{if(!acc[rec.car_id]){acc[rec.car_id]={name:rec.car_name,lap_time:rec.lap_time,count:1}}else{acc[rec.car_id].lap_time=Math.min(acc[rec.car_id].lap_time,rec.lap_time);acc[rec.car_id].count+=1}return acc},{})});this.save()}else{Logger.debug("Racing records response missing 'racingrecords' array.")}}catch(err){Logger.warn(`Racing records fetch failed.\n${err}`)}}
/**
     * Fetch and store enlisted cars with win rate calculation
     * @returns {Promise<void>}
     */async updateCars(){try{if(!torn_api||!torn_api.key)throw new Error("TornAPI not initialized.");const results=await torn_api.request("user","enlistedcars",{timestamp:`${unixTimestamp()}`});if(Array.isArray(results?.enlistedcars)){this.cars=results.enlistedcars.filter(car=>!car.is_removed).reduce((acc,car)=>{acc[car.car_item_id]={name:car.car_item_name,top_speed:car.top_speed,acceleration:car.acceleration,braking:car.braking,handling:car.handling,safety:car.safety,dirt:car.dirt,tarmac:car.tarmac,class:car.car_class,worth:car.worth,points_spent:car.points_spent,races_entered:car.races_entered,races_won:car.races_won,win_rate:car.races_entered>0?car.races_won/car.races_entered:0};return acc},{});this.save()}else{Logger.debug("Enlisted cars response missing 'enlistedcars' array.")}}catch(err){Logger.warn(`Enlisted cars fetch failed.\n${err}`)}}}
/**
   * TornRace class - Helper to compile race metadata and compute status
   * @class
   */class TornRace{
/**
     * Creates a TornRace instance
     * @param {object} [args={}] - Race properties
     * @param {string} [args.id] - Race ID
     * @param {number} [args.trackid] - Track ID
     * @param {string} [args.title] - Race title
     * @param {number} [args.distance] - Race distance
     * @param {number} [args.laps] - Number of laps
     */
constructor(args={}){this.id=args.id??null;this.track=args.trackid?RACE_TRACKS[args.trackid]:null;this.title=args.title??"";this.distance=args.distance??null;this.laps=args.laps??null;this.status="joined"}
/**
     * Updates race status from info spot text
     * @param {string} info_spot - Info spot text content
     * @returns {'unknown'|'racing'|'finished'|'waiting'|'joined'} Updated status
     */updateStatus(info_spot){const text=(info_spot??"").toLowerCase();switch(text){case"":this.status="unknown";break;case"race started":case"race in progress":this.status="racing";break;case"race finished":this.status="finished";break;default:
// Case-insensitive check for "Race will Start in" marker
this.status=text.includes("Race will Start in")?"waiting":"joined";break}return this.status}
/**
     * Normalizes leaderboard DOM entries and adds driver info
     * @param {NodeList|Array} drivers - List of driver DOM elements
     */async updateLeaderboard(drivers){
// Logger.debug("Updating Leaderboard...");
for(const drvr of Array.from(drivers)){const driverItem=drvr.querySelector("ul.driver-item");
//Array.from(drivers).forEach(async (drvr) => {
const driverId=(drvr.id||"").substring(4);const driverStatus=drvr.querySelector(".status");const drvrName=drvr.querySelector("li.name");const nameLink=drvrName?.querySelector("a");const nameSpan=drvrName?.querySelector("span");const drvrColour=drvr.querySelector("li.color");if(driverStatus){switch(this.status){case"joined":driverStatus.classList.toggle("success",true);driverStatus.classList.toggle("waiting",false);driverStatus.classList.toggle("racing",false);driverStatus.textContent="";break;case"waiting":driverStatus.classList.toggle("success",false);driverStatus.classList.toggle("waiting",true);driverStatus.classList.toggle("racing",false);driverStatus.textContent="";break;case"racing":driverStatus.classList.toggle("success",false);driverStatus.classList.toggle("waiting",false);driverStatus.classList.toggle("racing",true);driverStatus.textContent="";break;case"finished":default:break}}if(drvrColour&&nameSpan){drvrColour.classList.remove("color");nameSpan.className=drvrColour.className}if(Store.getValue(Store.keys.rplus_addlinks)==="1"){if(!nameLink&&nameSpan?.outerHTML){nameSpan.outerHTML=`<a target="_blank" href="/profiles.php?XID=${driverId}">${nameSpan.outerHTML}</a>`}}else{if(nameLink){drvrName.innerHTML=`${nameLink.innerHTML}`}}if(!drvr.querySelector(".statistics")){drvrName.insertAdjacentHTML("beforeEnd",`<div class="statistics"></div>`)}const stats=drvr.querySelector(".statistics");const timeLi=drvr.querySelector("li.time");if(timeLi){if(timeLi.textContent===""){timeLi.textContent="0.00 %"}const timeContainer=w.document.createElement("ul");timeContainer.appendChild(timeLi);stats.insertAdjacentElement("afterEnd",timeContainer)}if(Store.getValue(Store.keys.rplus_showspeed)==="1"){if(!stats.querySelector(".speed")){stats.insertAdjacentHTML("beforeEnd",'<div class="speed">0.00mph</div>')}
// if (!["joined", "finished"].includes(racestatus) && !speedIntervalByDriverId.has(driverId)) {
//   Logger.debug(`Adding speed interval for driver ${driverId}.`);
//   speedIntervalByDriverId.set(driverId, setInterval(updateSpeed, SPEED_INTERVAL, trackData, driverId));
// }
}if(Store.getValue(Store.keys.rplus_showskill)==="1"){if(!stats.querySelector(".skill")){stats.insertAdjacentHTML("afterBegin",'<div class="skill">RS: ?</div>')}if(torn_api.key){try{let user=await torn_api.request("user",`${driverId}/personalStats`,{stat:"racingskill"});if(user){let skill=stats.querySelector(".skill");skill.textContent=`RS: ${user.personalstats?.racing?.skill??"?"}`}}catch(err){console.log(`[TornPDA.Racing+]: ${err.error??err}`)}}}driverItem.classList.toggle("show",true)}//);
}}
/**
   * defer - Wait for a selector to appear using MutationObserver with timeout.
   * @param {string} selectors - CSS selector(s)
   * @returns {Promise<Element>} Resolved element
   */const defer=selectors=>new Promise((resolve,reject)=>{const found=w.document.querySelector(selectors);if(found)return resolve(found);let obs;const timer=setTimeout(()=>{cleanup();reject(new Error(`deferral timed out: '${selectors}'`))},DEFERRAL_TIMEOUT);const cleanup=()=>{clearTimeout(timer);obs?.disconnect()};obs=new MutationObserver(()=>{const el=w.document.querySelector(selectors);if(el){cleanup();resolve(el)}});obs.observe(w.document.documentElement||w.document,{childList:true,subtree:true})});const deferChild=(parent,selector)=>new Promise((resolve,reject)=>{const found=parent.querySelector(selector);if(found)return resolve(found);let obs;const timer=setTimeout(()=>{cleanup();reject(new Error(`deferral timed out: '${parent}' -> '${selector}'`))},DEFERRAL_TIMEOUT);const cleanup=()=>{clearTimeout(timer);obs?.disconnect()};obs=new MutationObserver(()=>{const el=w.document.querySelector(selector);if(el){cleanup();resolve(el)}});obs.observe(parent,{childList:true,subtree:true})});
/**
   * Creates an element with supplied properties.
   * @param {keyof HTMLElementTagNameMap} tag - The HTML tag to create.
   * @param {Object} props - HTML element properties + optional 'children' array/element.
   * @returns {HTMLElement} The constructed element.
   */const newElement=(tag,props={})=>{const{children:children,...rest}=props;const el=Object.assign(w.document.createElement(tag),rest);if(children){const childrenArray=Array.isArray(children)?children:[children];el.append(...childrenArray)}return el};
/**
   * addStyles - Injects Racing+ CSS into document head.
   * @returns {Promise<void>}
   */const addStyles=async()=>{Logger.debug(`Injecting styles...`,w.racing_plus);
// Build dynamic CSS rules for part colors if parts display is enabled
const dynRules=[];if(Store.getValue(Store.keys.rplus_showparts)==="1"){Object.entries(PART_CATEGORIES).forEach(([,parts])=>{parts.forEach((g,i)=>{dynRules.push(`.d .racing-plus-parts-available span[data-part="${g}"]{color:${RACE_COLOURS[i]};}`,`.d .racing-main-wrap .pm-items-wrap .pm-items li[data-part="${g}"]:not(.bought):not(.active) .status{background-color:${RACE_COLOURS[i]};background-image:unset;}`,`.d .racing-main-wrap .pm-items-wrap .pm-items li[data-part="${g}"]:not(.bought):not(.active) .bg-wrap .title{background-color:${RACE_COLOURS[i]}40;}`)})})}w.document.head.appendChild(newElement("style",{innerHTML:`.d .flex-col{display:flex;flex-direction:column}.d .nowrap{white-space:nowrap!important}.d .racing-plus-footer::before,.d .racing-plus-header::after{position:absolute;display:block;content:"";height:0;width:100%;left:0}.d .racing-plus-panel{margin:10px 0;padding:0;display:none}.d .racing-plus-panel.show{display:block}.d .racing-plus-header{position:relative;padding-left:10px;height:30px;line-height:30px;font-size:12px;font-weight:700;letter-spacing:0;text-shadow:0 0 2px rgba(0,0,0,.5019607843);text-shadow:var(--tutorial-title-shadow);color:#fff;color:var(--tutorial-title-color);border:0!important;border-radius:5px 5px 0 0;background:linear-gradient(180deg,#888 0,#444 100%)}.d.dark-mode .racing-plus-header{background:linear-gradient(180deg,#555 0,#333 100%)}.d .racing-plus-header::after{bottom:-1px;border-top:1px solid #999;border-bottom:1px solid #ebebeb}.d.dark-mode .racing-plus-header::after{border-bottom:1px solid #222;border-top:1px solid #444}.d .racing-plus-footer{position:relative;margin:0;padding:0;height:10px;border:0!important;border-radius:0 0 5px 5px;background:linear-gradient(0deg,#888 0,#444 100%)}.d.dark-mode .racing-plus-footer{background:linear-gradient(0deg,#555 0,#333 100%)}.d .racing-plus-footer::before{top:-1px;border-bottom:1px solid #999;border-top:1px solid #ebebeb}.d.dark-mode .racing-plus-footer::before{border-top:1px solid #222;border-bottom:1px solid #444}.d .racing-plus-main{margin:0;padding:5px 10px;background-color:#f2f2f2}.d.dark-mode .racing-plus-main{background-color:#2e2e2e}.d .racing-plus-settings{display:grid;grid-template-columns:auto min-content;grid-template-rows:repeat(6,min-content);gap:0}.d .racing-plus-settings label{padding:6px 5px;font-size:.7rem;white-space:nowrap}.d .racing-plus-settings div{padding:0 5px;font-size:.7rem;text-align:right;position:relative}.d .racing-plus-settings div.flex-col{padding:0;margin-top:2px}.d .racing-plus-settings div,.d .racing-plus-settings label{border-bottom:2px groove #ebebeb}.d.dark-mode .racing-plus-settings div,.d.dark-mode .racing-plus-settings label{border-bottom:2px groove #444}.d .racing-plus-settings div:last-of-type,.d .racing-plus-settings label:last-of-type{border-bottom:0}.d .racing-plus-settings div input[type=checkbox]{height:12px;margin:5px 0;accent-color:#c00}.d .racing-plus-settings div input[type=text]{text-align:right;width:120px;height:12px;margin:0;padding:1px 2px;border-radius:3px;border:1px solid #767676;vertical-align:text-bottom}.d .racing-plus-settings div input[type=text] .valid{border-color:#090!important}.d .racing-plus-settings div input[type=text] .invalid{border-color:#c00!important}.d .racing-plus-settings .api-key-public{color:var(--preferences-api-type-public-access-color,#444)}.d.dark-mode .racing-plus-settings .api-key-public{color:var(--preferences-api-type-public-access-color,#ddd)}.d .racing-plus-settings .api-key-minimal{color:var(--preferences-api-type-minimal-access-color,#698c00)}.d.dark-mode .racing-plus-settings .api-key-minimal{color:var(--preferences-api-type-minimal-access-color,#94d82d)}.d .racing-plus-settings .api-key-limited{color:var(--preferences-api-type-limited-access-color,#b28500)}.d.dark-mode .racing-plus-settings .api-key-limited{color:var(--preferences-api-type-limited-access-color,#fcc419)}.d .racing-plus-settings .api-key-full{color:var(--preferences-api-type-full-access-color,#d93600)}.d.dark-mode .racing-plus-settings .api-key-full{color:var(--preferences-api-type-full-access-color,#ff6b6b)}.d .racing-plus-settings .api-key-custom{color:var(--preferences-api-type-custom-access-color,#5f3dc4)}.d.dark-mode .racing-plus-settings .api-key-custom{color:var(--preferences-api-type-custom-access-color,#da77f2)}.d .racing-plus-apikey-actions{margin-right:10px}.d .racing-plus-apikey-status{color:red;padding:2px 5px;font-size:.6rem;display:none}.d .racing-plus-apikey-reset,.d .racing-plus-apikey-save{cursor:pointer;margin:0 0 2px;padding:0;height:16px;width:16px;display:none}.d .racing-plus-apikey-reset.show,.d .racing-plus-apikey-save.show,.d .racing-plus-apikey-status.show{display:inline-block!important}.d .racing-plus-apikey-reset svg path,.d .racing-plus-apikey-save svg path{fill:#666;fill:var(--top-links-icon-svg-fill);filter:drop-shadow(0 1px 0 rgba(255, 255, 255, .6509803922));filter:var(--top-links-icon-svg-shadow)}.d .racing-plus-apikey-reset:hover svg path,.d .racing-plus-apikey-save:hover svg path{fill:#444;fill:var(--top-links-icon-svg-hover-fill);filter:drop-shadow(0 1px 0 rgba(255, 255, 255, .6509803922));filter:var(--top-links-icon-svg-hover-shadow)}.d .racing-plus-parts-available{display:flex;flex-direction:row;gap:10px;font-style:italic;padding:10px;font-size:.7rem;background:url("/images/v2/racing/header/stripy_bg.png") #2e2e2e}.d .left-banner,.d .right-banner{height:57px;top:44px;z-index:9999;position:absolute;border-top:1px solid #424242;border-bottom:1px solid #424242;background:url("/images/v2/racing/header/stripy_bg.png")}.d .racing-plus-parts-available::after{position:absolute;left:0;bottom:-1px;content:"";display:block;height:0;width:100%;border-bottom:1px solid #222;border-top:1px solid #444}.d .racing-plus-link-wrap .export-link,.d .racing-plus-link-wrap .race-link{width:20px;float:right;filter:drop-shadow(0 0 1px rgba(17, 17, 17, .5803921569));height:20px}.d .pm-categories .link .icons .parts{position:absolute;bottom:5px;left:5px;color:#00bfff}.d .pm-categories .link .icons .parts.bought{color:#0c0}.d .racing-main-wrap .pm-items-wrap .part-wrap .l-delimiter,.d .racing-main-wrap .pm-items-wrap .part-wrap .r-delimiter,.d .racing-main-wrap .pm-items-wrap .pm-items>li .b-delimiter{height:0!important;width:0!important}.d .racing-main-wrap .pm-items-wrap .pm-items .active .properties-wrap>li .name,.d .racing-main-wrap .pm-items-wrap .pm-items .active .properties-wrap>li .progress-bar,.d .racing-main-wrap .pm-items-wrap .pm-items .bought .properties-wrap>li .name,.d .racing-main-wrap .pm-items-wrap .pm-items .bought .properties-wrap>li .progress-bar{background:unset!important}.d .racing-main-wrap .pm-items-wrap .pm-items .active,.d .racing-main-wrap .pm-items-wrap .pm-items .active .title{background:rgba(0,191,255,.07)}.d .racing-main-wrap .pm-items-wrap .pm-items .active .info{color:#00bfff}.d .racing-main-wrap .pm-items-wrap .pm-items .name .positive{color:#9c0}.d .racing-main-wrap .pm-items-wrap .pm-items .active .name .positive{color:#00a9f9}.d .racing-main-wrap .pm-items-wrap .pm-items .name .negative{color:#e54c19}.d .racing-main-wrap .pm-items-wrap .pm-items .active .name .negative{color:#ca9800}.d .racing-main-wrap .pm-items-wrap .pm-items .bought,.d .racing-main-wrap .pm-items-wrap .pm-items .bought .title{background:rgba(133,178,0,.07)}.d .racing-main-wrap .pm-items-wrap .pm-items .bought .desc{color:#85b200}.d .racing-plus-link-wrap{cursor:pointer;float:right}.d .racing-plus-link-wrap .race-link{margin:4px 5px 6px}.d .racing-plus-link-wrap .export-link:hover,.d .racing-plus-link-wrap .race-link:hover{filter:drop-shadow(1px 1px 1px rgba(17, 17, 17, .5803921569))}.d .racing-plus-link-wrap .export-link{margin:5px}.d .racing-main-wrap .car-selected-wrap #drivers-scrollbar{overflow:hidden!important;max-height:none!important}.d .racing-main-wrap .car-selected-wrap .driver-item>li.status-wrap .status{margin:5px!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item{font-size:.7rem!important;display:none!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item.show{display:flex!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.car{padding:0 5px}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name{width:unset!important;display:flex;align-items:center;flex-grow:1;border-right:0}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name a{flex-basis:fit-content;width:unset!important;height:20px;padding:0;margin:0;display:block;text-decoration:none}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name a:hover{text-decoration:underline}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span{display:block;flex-basis:fit-content;width:unset!important;height:20px;line-height:1.3rem;font-size:.7rem;padding:0 7px;margin:0;border-radius:3px;white-space:nowrap;color:#fff;background:rgba(0,0,0,.25)}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-1{background:rgba(116,232,0,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-2{background:rgba(255,38,38,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-3{background:rgba(255,201,38,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-4{background:rgba(0,217,217,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-5{background:rgba(0,128,255,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-6{background:rgba(153,51,255,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-7{background:rgba(255,38,255,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-8{background:rgba(85,85,85,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-9{background:rgba(242,141,141,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-10{background:rgba(225,201,25,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-11{background:rgba(160,207,23,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-12{background:rgba(24,217,217,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-13{background:rgba(111,175,238,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-14{background:rgba(176,114,239,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-15{background:rgba(240,128,240,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-16{background:rgba(97,97,97,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-17{background:rgba(178,0,0,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-18{background:rgba(204,153,0,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-19{background:rgba(78,155,0,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-20{background:rgba(0,157,157,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-21{background:rgba(0,0,183,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-22{background:rgba(140,0,140,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name div.statistics{display:flex;flex-grow:1;list-style:none;align-items:center;justify-content:space-between;padding:0 10px;margin:0}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.time{display:none}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name div.statistics div,.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name li.time{flex-basis:fit-content;line-height:22px;height:22px;width:unset!important;padding:0 5px;margin:0;border-radius:3px;white-space:nowrap;background-color:rgba(0,0,0,.25)}.d .left-banner{width:150px;left:0;border-right:1px solid #424242;border-top-right-radius:5px;border-bottom-right-radius:5px;box-shadow:5px 0 10px -2px rgba(0,0,0,.5),0 5px 10px -2px rgba(0,0,0,.5)}.d .racing-main-wrap .header-wrap .banner .skill-desc{width:130px!important;top:15px!important;left:8px!important;font-size:1rem!important}.d .racing-main-wrap .header-wrap .banner .skill{top:33px!important;left:10px!important;font-size:.8rem!important}.d .racing-main-wrap .header-wrap .banner .lastgain{top:33px;left:75px;color:#0f0;position:absolute;font-size:.6rem!important}.d .right-banner{width:115px;right:0;border-left:1px solid #424242;border-top-left-radius:5px;border-bottom-left-radius:5px;box-shadow:-5px 0 10px -2px rgba(0,0,0,.5),0 5px 10px -2px rgba(0,0,0,.5)}.d .racing-main-wrap .header-wrap .banner .class-desc{right:40px!important;top:23px!important;font-size:1rem!important}.d .racing-main-wrap .header-wrap .banner .class-letter{right:12px!important;top:22px!important;font-size:1.5rem!important}@media screen and (max-width:784px){.d .racing-main-wrap .header-wrap .banner .class-desc,.d .racing-main-wrap .header-wrap .banner .skill-desc{font-size:.8rem!important;top:10px!important}.d .racing-main-wrap .header-wrap .banner .skill{top:10px!important;left:125px!important}.d .racing-main-wrap .header-wrap .banner .lastgain{top:10px!important;left:190px}.d .racing-main-wrap .header-wrap .banner .class-letter{top:10px!important;font-size:1.25rem!important}.d .left-banner,.d .right-banner{top:0;background-image:none!important;border:none!important;box-shadow:none!important}}`+dynRules.join("")}));Logger.info(`Styles injected.`,w.racing_plus)};
/**
   * Adds the Racing+ settings panel to the UI.
   * @param {Element} main_container - Main container element
   * @returns {Promise<void>}
   */const addRacingPlusPanel=async()=>{Logger.debug("Adding settings panel...",w.racing_plus);if(w.document.querySelector(".racing-plus-panel"))return;const rplus_panel=newElement("div",{className:"racing-plus-panel"});rplus_panel.appendChild(newElement("div",{className:"racing-plus-header",innerText:"Racing+"}));const rplus_main=newElement("div",{className:"racing-plus-main",children:[newElement("div",{className:"racing-plus-settings",children:[newElement("label",{for:"rplus-apikey",innerHTML:'API Key (<span class="api-key-minimal">Minimal Access</span>)'}),newElement("div",{className:"flex-col",children:[newElement("div",{className:"nowrap",children:[newElement("span",{className:"racing-plus-apikey-actions",children:[newElement("button",{type:"button",className:"racing-plus-apikey-save",ariaLabel:"Save",innerHTML:'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="2 2 20 20"><path fill-rule="evenodd" clip-rule="evenodd" d="M7 2C4.23858 2 2 4.23858 2 7V17C2 19.7614 4.23858 22 7 22H17C19.7614 22 22 19.7614 22 17V8.82843C22 8.03278 21.6839 7.26972 21.1213 6.70711L17.2929 2.87868C16.7303 2.31607 15.9672 2 15.1716 2H7ZM7 4C6.44772 4 6 4.44772 6 5V7C6 7.55228 6.44772 8 7 8H15C15.5523 8 16 7.55228 16 7V5C16 4.44772 15.5523 4 15 4H7ZM12 17C13.6569 17 15 15.6569 15 14C15 12.3431 13.6569 11 12 11C10.3431 11 9 12.3431 9 14C9 15.6569 10.3431 17 12 17Z" /></svg>'}),newElement("button",{type:"button",className:"racing-plus-apikey-reset",ariaLabel:"Reset",innerHTML:'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 1024 1024"><path d="M790.2 590.67l105.978 32.29C847.364 783.876 697.86 901 521 901c-216.496 0-392-175.504-392-392s175.504-392 392-392c108.502 0 206.708 44.083 277.685 115.315l-76.64 76.64C670.99 257.13 599.997 225 521.5 225 366.032 225 240 351.032 240 506.5 240 661.968 366.032 788 521.5 788c126.148 0 232.916-82.978 268.7-197.33z"/><path d="M855.58 173.003L650.426 363.491l228.569 32.285z"/></svg>'})]}),newElement("input",{type:"text",id:"rplus-apikey",maxlength:"${API_KEY_LENGTH}"})]}),newElement("span",{className:"racing-plus-apikey-status"})]}),newElement("label",{for:"rplus_addlinks",innerText:"Add profile links"}),newElement("div",{children:[newElement("input",{type:"checkbox",id:"rplus_addlinks"})]}),newElement("label",{for:"rplus_showskill",innerText:"Show racing skill"}),newElement("div",{children:[newElement("input",{type:"checkbox",id:"rplus_showskill"})]}),newElement("label",{for:"rplus_showspeed",innerText:"Show current speed"}),newElement("div",{children:[newElement("input",{type:"checkbox",id:"rplus_showspeed"})]}),newElement("label",{for:"rplus_showracelink",innerText:"Add race link"}),newElement("div",{children:[newElement("input",{type:"checkbox",id:"rplus_showracelink"})]}),newElement("label",{for:"rplus_showresults",innerText:"Show race results"}),newElement("div",{children:[newElement("input",{type:"checkbox",id:"rplus_showresults"})]}),newElement("label",{for:"rplus_showexportlink",innerText:"Add export link"}),newElement("div",{children:[newElement("input",{type:"checkbox",id:"rplus_showexportlink"})]}),newElement("label",{for:"rplus_showwinrate",innerText:"Show car win rate"}),newElement("div",{children:[newElement("input",{type:"checkbox",id:"rplus_showwinrate"})]}),newElement("label",{for:"rplus_highlightcar",innerText:"Highlight best lap car"}),newElement("div",{children:[newElement("input",{type:"checkbox",id:"rplus_highlightcar"})]}),newElement("label",{for:"rplus_showparts",innerText:"Show available parts"}),newElement("div",{children:[newElement("input",{type:"checkbox",id:"rplus_showparts"})]})]})]});rplus_panel.appendChild(rplus_main);rplus_panel.appendChild(newElement("div",{class:"racing-plus-footer"}));const main_container=await defer(SELECTORS.main_container);main_container.insertAdjacentElement("beforeBegin",rplus_panel);Logger.info("Settings panel added.",w.racing_plus)};
/**
   * Initializes the Racing+ settings panel in the UI.
   * @returns {Promise<void>}
   */const initRacingPlusPanel=async()=>{Logger.debug("Initializing settings panel...",w.racing_plus);
/** @type {HTMLInputElement} */const apiInput=await defer("#rplus-apikey");
/** @type {HTMLAnchorElement} */const apiSave=await defer(".racing-plus-apikey-save");
/** @type {HTMLAnchorElement} */const apiReset=await defer(".racing-plus-apikey-reset");
/** @type {HTMLAnchorElement} */const apiStatus=await defer(".racing-plus-apikey-status");const apikey=torn_api.key??"";if(IS_PDA){apiInput.value=apikey;apiInput.disabled=true;apiInput.readOnly=true;apiStatus.textContent="Edit in TornPDA settings.";apiStatus.classList.toggle("show",true);apiSave.classList.toggle("show",false);apiReset.classList.toggle("show",false)}else{if(apikey.length>0){apiInput.value=apikey;apiInput.disabled=true;apiInput.readOnly=true;apiStatus.textContent="";apiStatus.classList.toggle("show",false);apiSave.classList.toggle("show",false);apiReset.classList.toggle("show",true)}else{apiInput.disabled=false;apiInput.readOnly=false;apiStatus.textContent="";apiStatus.classList.toggle("show",false);apiSave.classList.toggle("show",true);apiReset.classList.toggle("show",false)}apiSave.addEventListener("click",async ev=>{ev.preventDefault();const candidate=apiInput.value.trim();apiInput.classList.remove("valid","invalid");try{if(await torn_api.validate(candidate)){Logger.debug("Valid API key.");apiInput.classList.add("valid");torn_api.saveKey();apiInput.disabled=true;apiInput.readOnly=true;apiSave.classList.toggle("show",false);apiReset?.classList.toggle("show",true);if(apiStatus){apiStatus.textContent="";apiStatus.classList.toggle("show",false)}}}catch(err){Logger.warn(err);apiInput.classList.add("invalid");if(apiStatus){apiStatus.textContent=err.message??err;apiStatus.classList.toggle("show",true)}return false}});apiReset.addEventListener("click",ev=>{ev.preventDefault();torn_api.clear();if(!apiInput)return;apiInput.value="";apiInput.disabled=false;apiInput.readOnly=false;apiInput.classList.remove("valid","invalid");apiSave?.classList.toggle("show",true);apiReset.classList.toggle("show",false);if(apiStatus){apiStatus.textContent="";apiStatus.classList.toggle("show",false)}})}w.document.querySelectorAll(".racing-plus-settings input[type=checkbox]").forEach(el=>{const key=Store.keys[el.id];if(!key)return;el.checked=Store.getValue(key)==="1";el.addEventListener("click",ev=>{const t=/** @type {HTMLInputElement} */ev.currentTarget;Store.setValue(key,t.checked?"1":"0");Logger.debug(`${el.id} saved ${t.checked?"on":"off"}.`)})});Logger.info("Settings panel initialized.",w.racing_plus)};
/**
   * Adds the settings buttons to the DOM
   * @param {HTMLElement} links_container
   * @returns {Promise<void>}
   */const addRacingPlusButton=async header_root=>{Logger.debug("Adding settings button...",w.racing_plus);if(w.document.querySelector("#racing-plus-button"))return;const links_container=await deferChild(header_root,"div[class^='linksContainer']");const city_button=links_container.querySelector('[href="city.php"]');if(!city_button)return;const city_label=city_button.querySelector(`#${city_button.getAttribute("aria-labelledby")}`);const city_icon_wrap=city_button.querySelector(`:not([id])`);if(!city_label||!city_icon_wrap)return;const rplus_button=newElement("a",{role:"button",ariaLabelledBy:"racing-plus-link-label",id:"racing-plus-button",className:city_button.className,children:[newElement("span",{id:"racing-plus-button-icon",className:city_icon_wrap.className,innerHTML:'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 15 14" width="16" height="16"><path d="m14.02,11.5c.65-1.17.99-2.48.99-3.82,0-2.03-.78-3.98-2.2-5.44-2.83-2.93-7.49-3.01-10.42-.18-.06.06-.12.12-.18.18C.78,3.7,0,5.66,0,7.69c0,1.36.35,2.69,1.02,3.88.36.64.82,1.22,1.35,1.73l.73.7,1.37-1.5-.73-.7c-.24-.23-.45-.47-.64-.74l1.22-.72-.64-1.14-1.22.72c-.6-1.42-.6-3.03,0-4.45l1.22.72.64-1.14-1.22-.72c.89-1.23,2.25-2.04,3.76-2.23v1.44h1.29v-1.44c1.51.19,2.87.99,3.76,2.23l-1.22.72.65,1.14,1.22-.72c.68,1.63.58,3.48-.28,5.02-.06.11-.12.21-.19.31l-1.14-.88.48,3.5,3.41-.49-1.15-.89c.12-.18.23-.35.33-.53Zm-6.51-4.97c-.64-.02-1.17.49-1.18,1.13s.49,1.17,1.13,1.18,1.17-.49,1.18-1.13c0,0,0-.01,0-.02l1.95-1.88-2.56.85c-.16-.09-.34-.13-.52-.13h0Z"/></svg>'}),newElement("span",{id:"racing-plus-button-label",className:city_label.className,innerText:"Racing+"})]});city_button.insertAdjacentElement("beforeBegin",rplus_button);rplus_button.addEventListener("click",ev=>{ev.preventDefault();Logger.debug("'rplus_button' clicked.");w.document.querySelector(".racing-plus-panel")?.classList.toggle("show")});Logger.info("Settings button added.",w.racing_plus)};
/**
   * Fixes the header banner (racing skill and class)
   * @returns {Promise<void>}
   */const fixHeaderBanner=async()=>{Logger.debug("Fixing header banner...",w.racing_plus);const banner=await defer(SELECTORS.main_banner);const leftBanner=w.document.createElement("div");leftBanner.className="left-banner";const rightBanner=w.document.createElement("div");rightBanner.className="right-banner";const elements=Array.from(banner.children);elements.forEach(el=>{if(el.classList.contains("skill-desc")||el.classList.contains("skill")||el.classList.contains("lastgain")){if(el.classList.contains("skill")){this_driver.updateSkill(el.textContent);el.textContent=String(this_driver.skill)}leftBanner.appendChild(el)}else if(el.classList.contains("class-desc")||el.classList.contains("class-letter")){rightBanner.appendChild(el)}});banner.innerHTML="";banner.appendChild(leftBanner);banner.appendChild(rightBanner);Logger.info("Header banner fixed.",w.racing_plus)};
/**
   * Sets
   * @param {string} selector
   */const activateTab=async selector=>{const tabs_container=await defer(SELECTORS.tabs_container);const tabs=tabs_container.querySelectorAll("li:not(.clear)");tabs.forEach(t=>t.classList.toggle("active",!!t.querySelector(`.icon.${selector}`)))};
/**
   * PageContent
   * @class
   */class PageContent{
/**
     * loads content for 'Your Cars'.
     */
static loadCars=async()=>{await activateTab("cars")};
/**
     * loads content for 'Parts & Modifications'
     */
static loadModifications=async()=>{await activateTab("modification")};
/**
     * loads content for 'Official Events'
     */
static loadOfficialEvents=async()=>{await activateTab("official-events");const drivers_list=await defer(SELECTORS.drivers_list);const leaderboard=await defer(SELECTORS.drivers_list_leaderboard);
/** @type {NodeListOf<ChildNode>} */const drivers=await new Promise(resolve=>{if(leaderboard.childNodes.length>0){resolve(leaderboard.childNodes)}else{const observer=new MutationObserver(()=>{if(leaderboard.childNodes.length>0){observer.disconnect();resolve(leaderboard.childNodes)}});observer.observe(leaderboard,{childList:true})}});if(!this_race){try{Logger.debug(`Loading track data...`,w.racing_plus);const driver=Array.from(drivers).find(d=>d.id===`lbr-${this_driver.id}`);const dataId=driver.getAttribute("data-id");const raceId=dataId?.split("-")[0]??-1;const trackInfo=drivers_list.querySelector(".track-info");const track=Object.values(RACE_TRACKS).find(t=>t.name===trackInfo.getAttribute("title"));this_race=new TornRace({id:raceId,title:track.name,distance:track.distance,laps:track.laps});this_driver.load();Logger.info(`Track data loaded.`,w.racing_plus)}catch(err){Logger.error(`Failed to load track data. ${err}`)}}await this_race.updateLeaderboard(leaderboard.childNodes)};
/**
     * loads content for 'Custom Events'
     */
static loadCustomEvents=async()=>{await activateTab("custom-events")};
/**
     * loads content for 'Statistics'
     */
static loadStatistics=async()=>{await activateTab("statistics")}}
/**
   * loadContent
   * @returns {Promise<void>}
   */const loadContent=async content_container=>{Logger.debug(`Loading content...`,w.racing_plus);if(content_container.querySelector("#racingupdates")){await PageContent.loadOfficialEvents()}else if(content_container.querySelector(".custom-race-wrap")){await PageContent.loadCustomEvents()}else if(content_container.querySelector(".pm-categories")){await PageContent.loadModifications()}else if(content_container.querySelector("#racing-leaderboard-root")){await PageContent.loadStatistics()}else if(content_container.querySelector(".enlist-wrap")){if(content_container.querySelector(".enlisted-btn-wrap")?.innerText.toLowerCase().includes("official race")){await PageContent.loadOfficialEvents()}else if(content_container.querySelector(".info-msg")){await PageContent.loadModifications()}else{await PageContent.loadCars()}}Logger.info(`Content loaded.`,w.racing_plus)};
/**
   * start - Main entry point for the application.
   */const start=async()=>{try{Logger.info(`Application loaded. Starting...`,w.racing_plus);await addStyles();torn_api=new TornAPI;if(torn_api.key?.length==0&&IS_PDA&&PDA_KEY.length>0){await torn_api.validate(PDA_KEY)}Logger.debug(`Loading driver data...`,w.racing_plus);if(!this_driver){try{let scriptData=Store.getValue(Store.keys.rplus_driver);if(!scriptData){scriptData=await defer("#torn-user").value}this_driver=new TornDriver(JSON.parse(scriptData).id);this_driver.load()}catch(err){Logger.error(`Failed to load driver data. ${err}`)}}Logger.info(`Driver data loaded.`,w.racing_plus);const header_root=await defer(SELECTORS.header_root);await addRacingPlusButton(header_root);await addRacingPlusPanel();await initRacingPlusPanel(torn_api.key);await fixHeaderBanner();Logger.debug("Updating driver records and cars...",w.racing_plus);
// await this_driver.updateRecords(); await this_driver.updateCars();
const results=await Promise.allSettled([this_driver.updateRecords(),this_driver.updateCars()]);if(!results.map(r=>r.status==="fulfilled")){Logger.error(results.filter(r=>r.status==="rejected").map(r=>`${r.status} - ${r.reason}`).join("\n"))}Logger.info("Driver records and cars updated.",w.racing_plus);const content_container=await defer(SELECTORS.content_container);await loadContent(content_container);Logger.debug(`Adding observers...`,w.racing_plus);const button_observer=new MutationObserver(async()=>{await addRacingPlusButton(header_root)});button_observer.observe(header_root,{childList:true,subtree:true});const page_observer=new MutationObserver(async mutations=>{const preloader_added=Array.from(mutations[0]?.addedNodes).find(n=>n.classList?.contains(`ajax-preloader`));if(!preloader_added){
// Logger.debug(
//   `Content Update -> '${Object.values(mutations)
//     .map(
//       (m) =>
//         `target: [${m.type}] ${m.target.tagName?.toLowerCase()}${m.target.id ? `#${m.target.id}` : m.target.className.length > 0 ? `.${m.target.className}` : ""}`
//     )
//     .join(", ")}'`
// );
for(const mutation of mutations){
const preloader_removed=Array.from(mutation.removedNodes).find(n=>n.classList?.contains(`ajax-preloader`));if(!preloader_removed&&(mutation.type==="characterData"||mutation.type==="childList")){const tNode=mutation.target;let el=tNode.nodeType===Node.ELEMENT_NODE?tNode:tNode.parentElement;if(el){switch(el.id){case"racingAdditionalContainer":await loadContent(content_container);break;case"infoSpot":this_race?.updateStatus(el.textContent||"");break;case"leaderBoard":await(this_race?.updateLeaderboard(el.childNodes||[]));break}}}}}});page_observer.observe(content_container,{characterData:true,childList:true,subtree:true});Logger.info(`Observers added.`,w.racing_plus);
/**
       * Safely disconnects all mutation observers on page unload.
       */const disconnectObservers=()=>{try{button_observer?.disconnect();page_observer?.disconnect()}catch(err){Logger.error(err)}};w.addEventListener("pagehide",disconnectObservers,{once:true});w.addEventListener("beforeunload",disconnectObservers,{once:true});Logger.info(`Application started.`,w.racing_plus)}catch(err){Logger.error(err)}};
// Start application
await start()})(window);