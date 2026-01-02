// ==UserScript==
// @name         TornPDA.Racing+
// @namespace    TornPDA.RacingPlus
// @copyright    Copyright © 2025 moldypenguins
// @license      MIT
// @version      1.0.78-alpha
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

/** Millisecond conversion constants */const MS=Object.freeze({second:1e3,minute:6e4,hour:36e5,day:864e5});
/** Number of kilometers in 1 mile. */const KMS_PER_MI=1.609344;
/** Number of milliseconds to wait for an API request. */const API_FETCH_TIMEOUT=10*MS.second;
/** Number of milliseconds to wait for a selector to appear. Default = 15 seconds. */const DEFERRAL_TIMEOUT=15*MS.second;
/** Number of milliseconds to update speed. Default = 1 second. */const SPEED_INTERVAL=MS.second;
/** Number of milliseconds to cache API responses. Default = 1 hour. */const CACHE_TTL=MS.hour;
/** CSS Selectors */const SELECTORS=Object.freeze({header_root:"#racing-leaderboard-header-root",main_container:"#racingMainContainer",main_banner:"#racingMainContainer .header-wrap div.banner",tabs_container:"#racingMainContainer .header-wrap ul.categories",content_container:"#racingAdditionalContainer",car_selected:"#racingupdates .car-selected",drivers_list:"#racingupdates .drivers-list",drivers_list_title:"#racingupdates .drivers-list div[class^='title']",drivers_list_leaderboard:"#racingupdates .drivers-list #leaderBoard"});
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
 * Static formatting utilities.
 * @class
 */class Format{
/**
   * Formats timestamp as "YYYY-MM-DD".
   * @param {number} timestamp - Milliseconds since epoch
   * @returns {string} "YYYY-MM-DD"
   */
static date(timestamp){const dt=new Date(timestamp);return`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`}
/**
   * Formats timestamp as "HH:MM:SS.mmm".
   * @param {number} timestamp - Milliseconds since epoch
   * @returns {string} "HH:MM:SS. mmm"
   */static time(timestamp){const dt=new Date(timestamp);return`${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}:${String(dt.getSeconds()).padStart(2,"0")}.${String(dt.getMilliseconds()).padStart(3,"0")}`}
/**
   * Formats duration as "MM:SS.mmm".
   * @param {number} duration - Milliseconds
   * @returns {string} "MM:SS.mmm"
   */static duration(duration){const mins=Math.floor(duration%MS.hour/MS.minute);const secs=Math.floor(duration%MS.minute/MS.second);const ms=Math.floor(duration%MS.second);return`${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}.${String(ms).padStart(3,"0")}`}
/**
   * Formats error as readable string.
   * @param {Error|object|string} error
   * @returns {string} "ErrorName: message"
   */static error(error){const name=error?.name||"Error";const msg=error?.message||error;return`${name}: ${msg}`}}
/**
 * Stores distance with unit conversion support.
 * @class
 */class Distance{
/**
   * Creates Distance from miles or kilometers.
   * @param {object} [args={}] - Constructor arguments
   * @param {number} [args.miles=null] - Distance in miles
   * @param {number} [args.kilometers=null] - Distance in kilometers
   * @throws {TypeError} If neither or both units provided, or non-numeric
   */
constructor(args={}){const{miles:miles,kilometers:kilometers}=args;if(miles==null&&kilometers==null){throw new TypeError("One of miles or kilometers must be specified.")}const mi=miles??(kilometers!=null?kilometers/KMS_PER_MI:0);if(!isNumber(mi)){throw new TypeError("Miles or Kilometers must be a number.")}this._mi=mi;this._units=kilometers!=null?"km":"mi"}
/** @returns {number} Distance in miles */get mi(){return this._mi}
/** @returns {number} Distance in kilometers */get km(){return this._mi*KMS_PER_MI}
/** @returns {string} Formatted distance with units */toString(){const val=this._units==="km"?this.km:this.mi;return`${val.toFixed(2)} ${this._units}`}}
/**
 * Calculates speed from distance and elapsed time.
 * @class
 */class Speed{
/**
   * Creates Speed from distance and duration.
   * @param {object} args - Constructor arguments
   * @param {Distance} args.distance - Distance traveled
   * @param {number} args.seconds - Elapsed time in seconds (> 0)
   * @param {"mph"|"kph"} [args.units="mph"] - Display units
   * @throws {TypeError} If distance not Distance instance or invalid seconds
   */
constructor(args={}){const{distance:distance,seconds:seconds,units:units="mph"}=args;if(!(distance instanceof Distance)){throw new TypeError("distance must be a Distance instance.")}if(!Number.isInteger(seconds)||seconds<=0){throw new TypeError("seconds must be an integer > 0.")}this._mph=distance.mi/(seconds/(MS.hour/MS.second));this._units=units}
/** @returns {number} Speed in mph */get mph(){return this._mph}
/** @returns {number} Speed in kph */get kph(){return this._mph*KMS_PER_MI}
/** @returns {string} Formatted speed with units */toString(){const val=this._units==="kph"?this.kph:this.mph;return`${val.toFixed(2)} ${this._units}`}}
/**
 * Log level enumeration with values and colors.
 * @readonly
 * @enum {{value: number, color: string}}
 */const LOG_LEVEL=Object.freeze({debug:Object.freeze({value:10,color:"#6aa84f"}),info:Object.freeze({value:20,color:"#3d85c6"}),warn:Object.freeze({value:30,color:"#e69138"}),error:Object.freeze({value:40,color:"#d93025"}),silent:Object.freeze({value:50,color:"#000000"})});
/**
 * @typedef {typeof LOG_LEVEL[keyof typeof LOG_LEVEL]} LogLevel
 */
/**
 * Reverse lookup map: value -> name.
 * @readonly
 */const LEVEL_NAMES=Object.freeze(Object.fromEntries(Object.entries(LOG_LEVEL).map(([k,v])=>[v.value,k])));
/**
 * Configurable leveled logger.
 * @class
 */class Logger{
/**
   * Creates logger with threshold.
   * @param {LogLevel} mode - Minimum level to log
   */
constructor(log_mode=LOG_LEVEL.warn,is_pda=false){this.log_mode=log_mode;this.is_pda=is_pda}
/**
   * Logs if level meets threshold.
   * @param {LogLevel} level - Log level
   * @param {string} message - Message
   * @param {boolean} is_pda - PDA context
   * @param {number|null} time - Start time for duration
   */log(level,message,time=null){if(this.log_mode.value>level.value)return;const dt=Date.now();const lvl=LEVEL_NAMES[level.value].toUpperCase();const suffix=time?` ${dt-time}ms`:` ${Format.date(dt)} ${Format.time(dt)}`;if(this.is_pda){console.log(`${lvl}[TornPDA. Racing+]: ${message}${suffix}`)}else{console.log(`%c${lvl}[TornPDA.Racing+]: `,`color:${level.color};font-weight:600`,`${message}${suffix}`)}}
/**
   * Logs at debug level.
   * @param {string} message
   * @param {boolean} is_pda
   * @param {number|null} time
   */debug(message,time=null){this.log(LOG_LEVEL.debug,message,time)}
/**
   * Logs at info level.
   * @param {string} message
   * @param {boolean} is_pda
   * @param {number|null} time
   */info(message,time=null){this.log(LOG_LEVEL.info,message,time)}
/**
   * Logs at warn level.
   * @param {string} message
   * @param {boolean} is_pda
   * @param {number|null} time
   */warn(message,time=null){this.log(LOG_LEVEL.warn,message,time)}
/**
   * Logs at error level.
   * @param {string} message
   * @param {boolean} is_pda
   * @param {number|null} time
   */error(message,time=null){this.log(LOG_LEVEL.error,message,time)}}
/**
 * Wrapper class for localStorage with typed keys and convenience methods.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
 * @class
 */class Store{
/**
   * Creates store instance.
   * @param {Storage} storage - Storage object (localStorage/sessionStorage)
   */
constructor(storage){this.storage=storage}
/**
   * Gets value from storage.
   * @param {string} key - Storage key
   * @returns {string|null} Stored value or null
   */getValue(key){return this.storage.getItem(key)}
/**
   * Sets value in storage.
   * @param {string} key - Storage key
   * @param {string} value - Value to store
   */setValue(key,value){this.storage.setItem(key,value)}
/**
   * Deletes value from storage.
   * @param {string} key - Storage key
   */deleteValue(key){this.storage.removeItem(key)}
/**
   * Clears all storage keys.
   */deleteAll(){this.storage.clear()}
/**
   * Lists all stored values (debug).
   * @returns {Array<string>} All values
   */listValues(){return Object.values(this.storage)}
/**
   * Persistent storage key mappings.
   * @readonly
   */static keys=Object.freeze({rplus_apikey:"RACINGPLUS_APIKEY",rplus_units:"RACINGPLUS_DISPLAYUNITS",rplus_addlinks:"RACINGPLUS_ADDPROFILELINKS",rplus_showskill:"RACINGPLUS_SHOWRACINGSKILL",rplus_showspeed:"RACINGPLUS_SHOWCARSPEED",rplus_showracelink:"RACINGPLUS_SHOWRACELINK",rplus_showresults:"RACINGPLUS_SHOWRESULTS",rplus_showexportlink:"RACINGPLUS_SHOWEXPORTLINK",rplus_showwinrate:"RACINGPLUS_SHOWCARWINRATE",rplus_highlightcar:"RACINGPLUS_HIGHLIGHTCAR",rplus_showparts:"RACINGPLUS_SHOWCARPARTS",rplus_driver:"RACINGPLUS_DRIVER"})}
/**
 * Color palette for car parts (used in CSS generation)
 * @readonly
 */const RACE_COLOURS=["#5D9CEC","#48CFAD","#FFCE54","#ED5565","#EC87C0","#AC92EC","#FC6E51","#A0D468","#4FC1E9"];
/**
 * Track metadata indexed by track ID with pre-instantiated Distance objects
 * @readonly
 */const RACE_TRACKS=Object.freeze({6:Object.freeze({title:"Uptown",distance:new Distance({miles:2.25}),laps:7}),7:Object.freeze({title:"Withdrawal",distance:new Distance({miles:3.4}),laps:5}),8:Object.freeze({title:"Underdog",distance:new Distance({miles:1.73}),laps:9}),9:Object.freeze({title:"Parkland",distance:new Distance({miles:3.43}),laps:5}),10:Object.freeze({title:"Docks",distance:new Distance({miles:3.81}),laps:5}),11:Object.freeze({title:"Commerce",distance:new Distance({miles:1.09}),laps:15}),12:Object.freeze({title:"Two Islands",distance:new Distance({miles:2.71}),laps:6}),15:Object.freeze({title:"Industrial",distance:new Distance({miles:1.35}),laps:12}),16:Object.freeze({title:"Vector",distance:new Distance({miles:1.16}),laps:14}),17:Object.freeze({title:"Mudpit",distance:new Distance({miles:1.06}),laps:15}),18:Object.freeze({title:"Hammerhead",distance:new Distance({miles:1.16}),laps:14}),19:Object.freeze({title:"Sewage",distance:new Distance({miles:1.5}),laps:11}),20:Object.freeze({title:"Meltdown",distance:new Distance({miles:1.2}),laps:13}),21:Object.freeze({title:"Speedway",distance:new Distance({miles:.9}),laps:18}),23:Object.freeze({title:"Stone Park",distance:new Distance({miles:2.08}),laps:8}),24:Object.freeze({title:"Convict",distance:new Distance({miles:1.64}),laps:10})});
/**
 * @typedef {typeof LOG_LEVEL[keyof typeof LOG_LEVEL]} RaceTrack
 */
/**
 * Car parts grouped by category (used for CSS injection and part filtering)
 * @readonly
 */const PART_CATEGORIES=Object.freeze({Aerodynamics:["Spoiler","Engine Cooling","Brake Cooling","Front Diffuser","Rear Diffuser"],Brakes:["Pads","Discs","Fluid","Brake Accessory","Brake Control","Callipers"],Engine:["Gasket","Engine Porting","Engine Cleaning","Fuel Pump","Camshaft","Turbo","Pistons","Computer","Intercooler"],Exhaust:["Exhaust","Air Filter","Manifold"],Fuel:["Fuel"],Safety:["Overalls","Helmet","Fire Extinguisher","Safety Accessory","Roll cage","Cut-off","Seat"],Suspension:["Springs","Front Bushes","Rear Bushes","Upper Front Brace","Lower Front Brace","Rear Brace","Front Tie Rods","Rear Control Arms"],Transmission:["Shifting","Differential","Clutch","Flywheel","Gearbox"],"Weight Reduction":["Strip out","Steering wheel","Interior","Windows","Roof","Boot","Hood"],"Wheels & Tires":["Tyres","Wheels"]});
/**
 * List of valid Torn API root strings.
 * @readonly
 * @type {readonly ["user","faction","market","racing","forum","property","key","torn"]}
 */const API_VALID_ROOTS=Object.freeze(/** @type {const} */["user","faction","market","racing","forum","property","key","torn"]);
/**
 * Union type of valid roots, derived from API_VALID_ROOTS.
 * @typedef {typeof API_VALID_ROOTS[number]} ApiRoot
 */const API_KEY_LENGTH=16;const API_URL="https://api.torn.com/v2";const API_COMMENT="RacingPlus";
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
constructor(store){
/** @type {Map<string, {data:any, timestamp:number}>} */
this.cache=new Map;
/** @type {string|null} */this.key=store.getValue(Store.keys.rplus_apikey)}
/**
   * Makes a Torn API request (with caching) after validating the path and root.
   * @param {ApiRoot} root - API root
   * @param {string} path - API path (e.g., 'key/info' or '/user/stats')
   * @param {object|string} [args={}] - Query parameters object or a prebuilt query string
   * @returns {Promise<object|null>} API response data if available
   * @throws {Error} If path/root inputs are invalid
   */async request(root,path,params={}){if(!API_VALID_ROOTS.includes(root)){throw new Error(`Invalid API root. Must be one of: ${API_VALID_ROOTS.join(", ")}`)}if(typeof path!=="string")throw new Error("Invalid path. Must be a string.");let queryString="";if(params!=null&&typeof params==="object"&&Object.entries(params).length>0){queryString=Object.entries(params).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}else{throw new Error("Invalid argument. Params must be an object.")}const fullQuery=`?comment=${API_COMMENT}${this.key?`&key=${this.key}`:""}${queryString?`&${queryString}`:""}`;const fullURL=API_URL+`/${root}/${path.replace(/^\/+|\/+$/g,"")}`+fullQuery;const cached=this.cache.get(fullURL);if(cached&&Date.now()-cached.timestamp<CACHE_TTL)return cached.data;const controller=new AbortController;const timer=setTimeout(()=>controller.abort(),API_FETCH_TIMEOUT);try{const response=await fetch(fullURL,{signal:controller.signal});if(!response.ok){throw new Error(`HTTP ${response.status} ${response.statusText||""}`.trim())}const results=await response.json().catch(err=>{throw new Error(`Invalid JSON response: ${err}`)});if(!results||results.error){throw new Error(`API request failed: ${results?.error?.error??"Unknown error."}`)}this.cache.set(fullURL,{data:results,timestamp:Date.now()});return results}catch(err){Logger.warn(`API request failed: ${err}`);throw err}finally{clearTimeout(timer)}}
/**
   * Validates a Torn API key by calling /key/info
   * @param {string} key - API key to validate
   * @returns {Promise<boolean>} True if valid with sufficient access
   * @throws {Error}
   */async validate(store,key){if(!key||typeof key!=="string"||key.length!==API_KEY_LENGTH){throw new Error("Invalid API key: local validation.")}const prev_key=this.key;this.key=key;const data=await this.request("key","info",{timestamp:`${unixTimestamp()}`});if(data?.info?.access&&Number(data.info.access.level)>=ACCESS_LEVEL.Minimal){Logger.debug("Valid API key.");store.setValue(Store.keys.rplus_apikey,this.key);return true}this.key=prev_key;throw new Error("Invalid API key: unexpected response.")}
/**
   * Clear the key and localStorage
   */clear(store){store.deleteValue(Store.keys.rplus_apikey);this.key=null}}
/**
 * Stores skill and per-track best records for current user
 * @class
 */class TornDriver{
/**
   * Creates a TornDriver instance for a driver id.
   * @param {string|number} driver_id - Driver user ID
   */
constructor(driver_id){this.id=driver_id;this.skill=0;this.records={};this.cars={}}
/**
   * Load driver data from localStorage
   */load(store){const raw=store.getValue(Store.keys.rplus_driver);if(raw){try{const driver=JSON.parse(raw);if(driver&&driver.id===this.id){this.skill=Number(driver.skill)||0;this.records=driver.records||{};this.cars=driver.cars||{}}}catch(err){
// Log parse errors in debug mode
Logger.warn(`Failed to load driver cache.\n${err}`)}}}
/**
   * Save driver data to localStorage
   */save(store){const payload=JSON.stringify({id:this.id,skill:this.skill,records:this.records,cars:this.cars});store.setValue(Store.keys.rplus_driver,payload)}
/**
   * Update stored skill if newer value is higher (skill increases only)
   * @param {number|string} skill - New skill value
   */updateSkill(store,racing_skill){if(isNumber(racing_skill)){const skill=Number(racing_skill).toFixed(5);this.skill=Math.max(this.skill,skill);this.save(store);return this.skill-skill}}
/**
   * Fetch racing records from API and store best lap per car/track
   * @returns {Promise<void>}
   */async updateRecords(store,torn_api){try{if(!torn_api.key)throw new Error("TornAPI not initialized.");const results=await torn_api.request("user","racingrecords",{timestamp:`${unixTimestamp()}`});if(Array.isArray(results?.racingrecords)){results.racingrecords.forEach(({track:track,records:records})=>{if(!track?.id||!Array.isArray(records))return;this.records[track.id]=records.reduce((acc,rec)=>{if(!acc[rec.car_id]){acc[rec.car_id]={name:rec.car_name,lap_time:rec.lap_time,count:1}}else{acc[rec.car_id].lap_time=Math.min(acc[rec.car_id].lap_time,rec.lap_time);acc[rec.car_id].count+=1}return acc},{})});this.save(store)}else{Logger.debug("Racing records response missing 'racingrecords' array.")}}catch(err){Logger.warn(`Racing records fetch failed.\n${err}`)}}
/**
   * Fetch and store enlisted cars with win rate calculation
   * @returns {Promise<void>}
   */async updateCars(store,torn_api){try{if(!torn_api.key)throw new Error("TornAPI not initialized.");const results=await torn_api.request("user","enlistedcars",{timestamp:`${unixTimestamp()}`});if(Array.isArray(results?.enlistedcars)){this.cars=results.enlistedcars.filter(car=>!car.is_removed).reduce((acc,car)=>{acc[car.car_item_id]={name:car.car_item_name,top_speed:car.top_speed,acceleration:car.acceleration,braking:car.braking,handling:car.handling,safety:car.safety,dirt:car.dirt,tarmac:car.tarmac,class:car.car_class,worth:car.worth,points_spent:car.points_spent,races_entered:car.races_entered,races_won:car.races_won,win_rate:car.races_entered>0?car.races_won/car.races_entered:0};return acc},{});this.save(store)}else{Logger.debug("Enlisted cars response missing 'enlistedcars' array.")}}catch(err){Logger.warn(`Enlisted cars fetch failed.\n${err}`)}}}
/**
 * Helper to compile race metadata and compute status
 * @class
 */class TornRace{
/**
   * Creates a TornRace instance
   * @param {object} [args={}] - Race properties
   * @param {string} [args.id] - Race ID
   * @param {RaceTrack} [args.track] - Race Track
   */
constructor(args={}){this.id=args.id??null;this.track=args.track??null;this.status="joined"}
/**
   * Updates race status from info spot text
   * @param {string} info_spot - Info spot text content
   * @returns {'unknown'|'racing'|'finished'|'waiting'|'joined'} Updated status
   */updateStatus(info_spot){const text=(info_spot??"").toLowerCase();switch(text){case"":this.status="unknown";break;case"race started":case"race in progress":this.status="racing";break;case"race finished":this.status="finished";break;default:
// Case-insensitive check for "Race will Start in" marker
this.status=text.includes("Race will Start in")?"waiting":"joined";break}return this.status}}
// ########################################################################################################################################################## //
(async w=>{const PDA_KEY="###PDA-APIKEY###";const IS_PDA=await(async()=>{if(typeof w.flutter_inappwebview!=="undefined"&&typeof w.flutter_inappwebview.callHandler==="function"){try{return await w.flutter_inappwebview.callHandler("isTornPDAF")}catch(error){console.error("isTornPDA - ",error);return false}}return false})();if(w.racing_plus){return}else{w.racing_plus={
/** @type {number} */start:Date.now(),
/** @type {Logger} */logger:new Logger(LOG_LEVEL.debug,IS_PDA),
/** @type {TornAPI} */api:null,
/** @type {TornDriver} */driver:null,
/** @type {TornRace} */race:null}}
/**
   * defer - Wait for a selector to appear using MutationObserver with timeout.
   * @param {string} selectors - CSS selector(s)
   * @returns {Promise<Element>} Resolved element
   */const defer=selectors=>new Promise((resolve,reject)=>{const found=w.document.querySelector(selectors);if(found)return resolve(found);let obs;const timer=setTimeout(()=>{cleanup();reject(new Error(`deferral timed out: '${selectors}'`))},DEFERRAL_TIMEOUT);const cleanup=()=>{clearTimeout(timer);obs?.disconnect()};obs=new MutationObserver(()=>{const el=w.document.querySelector(selectors);if(el){cleanup();resolve(el)}});obs.observe(w.document.documentElement||w.document,{childList:true,subtree:true})});const deferChild=(parent,selector)=>new Promise((resolve,reject)=>{const found=parent.querySelector(selector);if(found)return resolve(parent);let obs;const timer=setTimeout(()=>{cleanup();reject(new Error(`deferral timed out: '${parent}' -> '${selector}'`))},DEFERRAL_TIMEOUT);const cleanup=()=>{clearTimeout(timer);obs?.disconnect()};obs=new MutationObserver(()=>{const el=parent.querySelector(selector);if(el){cleanup();resolve(parent)}});obs.observe(parent,{childList:true,subtree:true})});
/**
   * Creates an element with supplied properties.
   * @param {keyof HTMLElementTagNameMap} tag - The HTML tag to create.
   * @param {Object} props - HTML element properties + optional 'children' array/element.
   * @returns {HTMLElement} The constructed element.
   */const newElement=(tag,props={})=>{const{children:children,...rest}=props;const el=Object.assign(w.document.createElement(tag),rest);if(children){const childrenArray=Array.isArray(children)?children:[children];el.append(...childrenArray)}return el};
/**
   * Normalizes leaderboard DOM entries and adds driver info
   */const updateLeaderboard=async(store,torn_api,leaderboard)=>{
// Logger.debug("Updating Leaderboard...");
for(const driver of Array.from(leaderboard.childNodes)){const driverItem=driver.querySelector("ul.driver-item");
//Array.from(drivers).forEach(async (drvr) => {
const driverId=(driver.id||"").substring(4);const driverStatus=driver.querySelector(".status");const drvrName=driver.querySelector("li.name");const nameLink=drvrName?.querySelector("a");const nameSpan=drvrName?.querySelector("span");const drvrColour=driver.querySelector("li.color");if(driverStatus){switch(w.racing_plus.race.status){case"joined":driverStatus.classList.toggle("success",true);driverStatus.classList.toggle("waiting",false);driverStatus.classList.toggle("racing",false);driverStatus.textContent="";break;case"waiting":driverStatus.classList.toggle("success",false);driverStatus.classList.toggle("waiting",true);driverStatus.classList.toggle("racing",false);driverStatus.textContent="";break;case"racing":driverStatus.classList.toggle("success",false);driverStatus.classList.toggle("waiting",false);driverStatus.classList.toggle("racing",true);driverStatus.textContent="";break;case"finished":default:break}}if(drvrColour&&nameSpan){drvrColour.classList.remove("color");nameSpan.className=drvrColour.className}if(store.getValue(Store.keys.rplus_addlinks)==="1"){if(!nameLink&&nameSpan?.outerHTML){nameSpan.outerHTML=`<a target="_blank" href="/profiles.php?XID=${driverId}">${nameSpan.outerHTML}</a>`}}else{if(nameLink){drvrName.innerHTML=`${nameLink.innerHTML}`}}if(!driver.querySelector(".statistics")){drvrName.insertAdjacentHTML("beforeEnd",`<div class="statistics"></div>`)}const stats=driver.querySelector(".statistics");const timeLi=driver.querySelector("li.time");if(timeLi){if(timeLi.textContent===""){timeLi.textContent="0.00 %"}const timeContainer=w.document.createElement("ul");timeContainer.appendChild(timeLi);stats.insertAdjacentElement("afterEnd",timeContainer)}if(store.getValue(Store.keys.rplus_showspeed)==="1"){if(!stats.querySelector(".speed")){stats.insertAdjacentHTML("beforeEnd",'<div class="speed">0.00mph</div>')}
// if (!["joined", "finished"].includes(racestatus) && !speedIntervalByDriverId.has(driverId)) {
//   Logger.debug(`Adding speed interval for driver ${driverId}.`);
//   speedIntervalByDriverId.set(driverId, setInterval(updateSpeed, SPEED_INTERVAL, trackData, driverId));
// }
}if(store.getValue(Store.keys.rplus_showskill)==="1"){if(!stats.querySelector(".skill")){stats.insertAdjacentHTML("afterBegin",'<div class="skill">RS: ?</div>')}if(torn_api.key){try{let user=await torn_api.request("user",`${driverId}/personalStats`,{stat:"racingskill"});if(user){let skill=stats.querySelector(".skill");skill.textContent=`RS: ${user.personalstats?.racing?.skill??"?"}`}}catch(err){console.log(`[TornPDA.Racing+]: ${err.error??err}`)}}}driverItem.classList.toggle("show",true)}//);
};
/** Main entry point for the application. */const start=async()=>{try{
/** Check userscript context */
w.racing_plus.logger.debug(IS_PDA?"Torn PDA context detected.":"Browser context detected.",w.racing_plus.start);
/** Instantiate the local storage */const store=new Store(w.localStorage);
/** Inject CSS into document head */w.racing_plus.logger.debug(`Injecting styles...`,w.racing_plus.start);const dynRules=[];if(store.getValue(Store.keys.rplus_showparts)==="1"){Object.entries(PART_CATEGORIES).forEach(([,parts])=>{parts.forEach((g,i)=>{dynRules.push(`.d .racing-plus-parts-available span[data-part="${g}"]{color:${RACE_COLOURS[i]};}`,`.d .racing-main-wrap .pm-items-wrap .pm-items li[data-part="${g}"]:not(.bought):not(.active) .status{background-color:${RACE_COLOURS[i]};background-image:unset;}`,`.d .racing-main-wrap .pm-items-wrap .pm-items li[data-part="${g}"]:not(.bought):not(.active) .bg-wrap .title{background-color:${RACE_COLOURS[i]}40;}`)})})}w.document.head.appendChild(newElement("style",{innerHTML:`.d .flex-col{display:flex;flex-direction:column}.d .nowrap{white-space:nowrap!important}.d .racing-plus-footer::before,.d .racing-plus-header::after{position:absolute;display:block;content:"";height:0;width:100%;left:0}.d .racing-plus-panel{margin:10px 0;padding:0;display:none}.d .racing-plus-panel.show{display:block}.d .racing-plus-header{position:relative;padding-left:10px;height:30px;line-height:30px;font-size:12px;font-weight:700;letter-spacing:0;text-shadow:0 0 2px rgba(0,0,0,.5019607843);text-shadow:var(--tutorial-title-shadow);color:#fff;color:var(--tutorial-title-color);border:0!important;border-radius:5px 5px 0 0;background:linear-gradient(180deg,#888 0,#444 100%)}.d.dark-mode .racing-plus-header{background:linear-gradient(180deg,#555 0,#333 100%)}.d .racing-plus-header::after{bottom:-1px;border-top:1px solid #999;border-bottom:1px solid #ebebeb}.d.dark-mode .racing-plus-header::after{border-bottom:1px solid #222;border-top:1px solid #444}.d .racing-plus-footer{position:relative;margin:0;padding:0;height:10px;border:0!important;border-radius:0 0 5px 5px;background:linear-gradient(0deg,#888 0,#444 100%)}.d.dark-mode .racing-plus-footer{background:linear-gradient(0deg,#555 0,#333 100%)}.d .racing-plus-footer::before{top:-1px;border-bottom:1px solid #999;border-top:1px solid #ebebeb}.d.dark-mode .racing-plus-footer::before{border-top:1px solid #222;border-bottom:1px solid #444}.d .racing-plus-main{margin:0;padding:5px 10px;background-color:#f2f2f2}.d.dark-mode .racing-plus-main{background-color:#2e2e2e}.d .racing-plus-settings{display:grid;grid-template-columns:auto min-content;grid-template-rows:repeat(6,min-content);gap:0}.d .racing-plus-settings label{padding:6px 5px;font-size:.7rem;white-space:nowrap}.d .racing-plus-settings div{padding:0 5px;font-size:.7rem;text-align:right;position:relative}.d .racing-plus-settings div.flex-col{padding:0;margin-top:2px}.d .racing-plus-settings div,.d .racing-plus-settings label{border-bottom:2px groove #ebebeb}.d.dark-mode .racing-plus-settings div,.d.dark-mode .racing-plus-settings label{border-bottom:2px groove #444}.d .racing-plus-settings div:last-of-type,.d .racing-plus-settings label:last-of-type{border-bottom:0}.d .racing-plus-settings div input[type=checkbox]{height:12px;margin:5px 0;accent-color:#c00}.d .racing-plus-settings div input[type=text]{text-align:right;width:120px;height:12px;margin:0;padding:1px 2px;border-radius:3px;border:1px solid #767676;vertical-align:text-bottom}.d .racing-plus-settings div input[type=text] .valid{border-color:#090!important}.d .racing-plus-settings div input[type=text] .invalid{border-color:#c00!important}.d .racing-plus-settings .api-key-public{color:var(--preferences-api-type-public-access-color,#444)}.d.dark-mode .racing-plus-settings .api-key-public{color:var(--preferences-api-type-public-access-color,#ddd)}.d .racing-plus-settings .api-key-minimal{color:var(--preferences-api-type-minimal-access-color,#698c00)}.d.dark-mode .racing-plus-settings .api-key-minimal{color:var(--preferences-api-type-minimal-access-color,#94d82d)}.d .racing-plus-settings .api-key-limited{color:var(--preferences-api-type-limited-access-color,#b28500)}.d.dark-mode .racing-plus-settings .api-key-limited{color:var(--preferences-api-type-limited-access-color,#fcc419)}.d .racing-plus-settings .api-key-full{color:var(--preferences-api-type-full-access-color,#d93600)}.d.dark-mode .racing-plus-settings .api-key-full{color:var(--preferences-api-type-full-access-color,#ff6b6b)}.d .racing-plus-settings .api-key-custom{color:var(--preferences-api-type-custom-access-color,#5f3dc4)}.d.dark-mode .racing-plus-settings .api-key-custom{color:var(--preferences-api-type-custom-access-color,#da77f2)}.d .racing-plus-apikey-actions{margin-right:10px}.d .racing-plus-apikey-status{color:red;padding:2px 5px;font-size:.6rem;display:none}.d .racing-plus-apikey-reset,.d .racing-plus-apikey-save{cursor:pointer;margin:0 0 2px;padding:0;height:16px;width:16px;display:none}.d .racing-plus-apikey-reset.show,.d .racing-plus-apikey-save.show,.d .racing-plus-apikey-status.show{display:inline-block!important}.d .racing-plus-apikey-reset svg path,.d .racing-plus-apikey-save svg path{fill:#666;fill:var(--top-links-icon-svg-fill);filter:drop-shadow(0 1px 0 rgba(255, 255, 255, .6509803922));filter:var(--top-links-icon-svg-shadow)}.d .racing-plus-apikey-reset:hover svg path,.d .racing-plus-apikey-save:hover svg path{fill:#444;fill:var(--top-links-icon-svg-hover-fill);filter:drop-shadow(0 1px 0 rgba(255, 255, 255, .6509803922));filter:var(--top-links-icon-svg-hover-shadow)}.d .racing-plus-parts-available{display:flex;flex-direction:row;gap:10px;font-style:italic;padding:10px;font-size:.7rem;background:url("/images/v2/racing/header/stripy_bg.png") #2e2e2e}.d .left-banner,.d .right-banner{height:57px;top:44px;z-index:9999;position:absolute;border-top:1px solid #424242;border-bottom:1px solid #424242;background:url("/images/v2/racing/header/stripy_bg.png")}.d .racing-plus-parts-available::after{position:absolute;left:0;bottom:-1px;content:"";display:block;height:0;width:100%;border-bottom:1px solid #222;border-top:1px solid #444}.d .racing-plus-link-wrap .export-link,.d .racing-plus-link-wrap .race-link{width:20px;float:right;filter:drop-shadow(0 0 1px rgba(17, 17, 17, .5803921569));height:20px}.d .pm-categories .link .icons .parts{position:absolute;bottom:5px;left:5px;color:#00bfff}.d .pm-categories .link .icons .parts.bought{color:#0c0}.d .racing-main-wrap .pm-items-wrap .part-wrap .l-delimiter,.d .racing-main-wrap .pm-items-wrap .part-wrap .r-delimiter,.d .racing-main-wrap .pm-items-wrap .pm-items>li .b-delimiter{height:0!important;width:0!important}.d .racing-main-wrap .pm-items-wrap .pm-items .active .properties-wrap>li .name,.d .racing-main-wrap .pm-items-wrap .pm-items .active .properties-wrap>li .progress-bar,.d .racing-main-wrap .pm-items-wrap .pm-items .bought .properties-wrap>li .name,.d .racing-main-wrap .pm-items-wrap .pm-items .bought .properties-wrap>li .progress-bar{background:unset!important}.d .racing-main-wrap .pm-items-wrap .pm-items .active,.d .racing-main-wrap .pm-items-wrap .pm-items .active .title{background:rgba(0,191,255,.07)}.d .racing-main-wrap .pm-items-wrap .pm-items .active .info{color:#00bfff}.d .racing-main-wrap .pm-items-wrap .pm-items .name .positive{color:#9c0}.d .racing-main-wrap .pm-items-wrap .pm-items .active .name .positive{color:#00a9f9}.d .racing-main-wrap .pm-items-wrap .pm-items .name .negative{color:#e54c19}.d .racing-main-wrap .pm-items-wrap .pm-items .active .name .negative{color:#ca9800}.d .racing-main-wrap .pm-items-wrap .pm-items .bought,.d .racing-main-wrap .pm-items-wrap .pm-items .bought .title{background:rgba(133,178,0,.07)}.d .racing-main-wrap .pm-items-wrap .pm-items .bought .desc{color:#85b200}.d .racing-plus-link-wrap{cursor:pointer;float:right}.d .racing-plus-link-wrap .race-link{margin:4px 5px 6px}.d .racing-plus-link-wrap .export-link:hover,.d .racing-plus-link-wrap .race-link:hover{filter:drop-shadow(1px 1px 1px rgba(17, 17, 17, .5803921569))}.d .racing-plus-link-wrap .export-link{margin:5px}.d .racing-main-wrap .car-selected-wrap #drivers-scrollbar{overflow:hidden!important;max-height:none!important}.d .racing-main-wrap .car-selected-wrap .driver-item>li.status-wrap .status{margin:5px!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item{font-size:.7rem!important;display:none!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item.show{display:flex!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.car{padding:0 5px}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name{width:unset!important;display:flex;align-items:center;flex-grow:1;border-right:0}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name a{flex-basis:fit-content;width:unset!important;height:20px;padding:0;margin:0;display:block;text-decoration:none}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name a:hover{text-decoration:underline}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span{display:block;flex-basis:fit-content;width:unset!important;height:20px;line-height:1.3rem;font-size:.7rem;padding:0 7px;margin:0;border-radius:3px;white-space:nowrap;color:#fff;background:rgba(0,0,0,.25)}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-1{background:rgba(116,232,0,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-2{background:rgba(255,38,38,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-3{background:rgba(255,201,38,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-4{background:rgba(0,217,217,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-5{background:rgba(0,128,255,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-6{background:rgba(153,51,255,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-7{background:rgba(255,38,255,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-8{background:rgba(85,85,85,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-9{background:rgba(242,141,141,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-10{background:rgba(225,201,25,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-11{background:rgba(160,207,23,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-12{background:rgba(24,217,217,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-13{background:rgba(111,175,238,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-14{background:rgba(176,114,239,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-15{background:rgba(240,128,240,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-16{background:rgba(97,97,97,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-17{background:rgba(178,0,0,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-18{background:rgba(204,153,0,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-19{background:rgba(78,155,0,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-20{background:rgba(0,157,157,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-21{background:rgba(0,0,183,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name span.color-22{background:rgba(140,0,140,.5019607843)!important}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name div.statistics{display:flex;flex-grow:1;list-style:none;align-items:center;justify-content:space-between;padding:0 10px;margin:0}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.time{display:none}.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name div.statistics div,.d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name li.time{flex-basis:fit-content;line-height:22px;height:22px;width:unset!important;padding:0 5px;margin:0;border-radius:3px;white-space:nowrap;background-color:rgba(0,0,0,.25)}.d .left-banner{width:150px;left:0;border-right:1px solid #424242;border-top-right-radius:5px;border-bottom-right-radius:5px;box-shadow:5px 0 10px -2px rgba(0,0,0,.5),0 5px 10px -2px rgba(0,0,0,.5)}.d .racing-main-wrap .header-wrap .banner .skill-desc{width:130px!important;top:15px!important;left:8px!important;font-size:1rem!important}.d .racing-main-wrap .header-wrap .banner .skill{top:33px!important;left:10px!important;font-size:.8rem!important}.d .racing-main-wrap .header-wrap .banner .lastgain{top:33px;left:75px;color:#0f0;position:absolute;font-size:.6rem!important}.d .right-banner{width:115px;right:0;border-left:1px solid #424242;border-top-left-radius:5px;border-bottom-left-radius:5px;box-shadow:-5px 0 10px -2px rgba(0,0,0,.5),0 5px 10px -2px rgba(0,0,0,.5)}.d .racing-main-wrap .header-wrap .banner .class-desc{right:40px!important;top:23px!important;font-size:1rem!important}.d .racing-main-wrap .header-wrap .banner .class-letter{right:12px!important;top:22px!important;font-size:1.5rem!important}@media screen and (max-width:784px){.d .racing-main-wrap .header-wrap .banner .class-desc,.d .racing-main-wrap .header-wrap .banner .skill-desc{font-size:.8rem!important;top:10px!important}.d .racing-main-wrap .header-wrap .banner .skill{top:10px!important;left:125px!important}.d .racing-main-wrap .header-wrap .banner .lastgain{top:10px!important;left:190px}.d .racing-main-wrap .header-wrap .banner .class-letter{top:10px!important;font-size:1.25rem!important}.d .left-banner,.d .right-banner{top:0;background-image:none!important;border:none!important;box-shadow:none!important}}`+dynRules.join("")}));w.racing_plus.logger.info(`Styles injected.`,w.racing_plus.start);
/** Initialize Torn API client with stored key or PDA key if applicable */w.racing_plus.logger.debug(`Initializing Torn API client...`,w.racing_plus.start);try{w.racing_plus.api=new TornAPI(store);if(w.racing_plus.api.key?.length==0&&IS_PDA&&PDA_KEY.length>0){await w.racing_plus.api.validate(store,PDA_KEY)}w.racing_plus.logger.info(`Torn API client nitialized.`,w.racing_plus.start)}catch(err){w.racing_plus.logger.error(err)}w.racing_plus.logger.debug(`Loading driver data...`,w.racing_plus.start);try{let scriptData=Store.getValue(Store.keys.rplus_driver);if(!scriptData)scriptData=await defer("#torn-user").value;w.racing_plus.driver=new TornDriver(JSON.parse(scriptData).id);w.racing_plus.driver.load();w.racing_plus.logger.info(`Driver data loaded.`,w.racing_plus.start)}catch(err){w.racing_plus.logger.error(`Failed to load driver data. ${err}`)}
// #################################################################################################################################################### //
/**
       * loads content for 'Official Events'
       */w.racing_plus.logger.debug(`Loading track data...`,w.racing_plus.start);try{const drivers_list=await defer(SELECTORS.drivers_list);const leaderboard=await deferChild(SELECTORS.drivers_list_leaderboard,"li[id^=lbr-]");

if(!w.racing_plus.race){const driver=Array.from(leaderboard.childNodes).find(d=>d.id===`lbr-${w.racing_plus.driver.id}`);const dataId=driver.getAttribute("data-id");const raceId=dataId?.split("-")[0]??-1;const trackInfo=drivers_list.querySelector(".track-info");const trackId=Object.values(RACE_TRACKS).indexOf(t=>t.name===trackInfo.getAttribute("title"));

w.racing_plus.race=new TornRace({id:raceId,track:trackId})}
// sfdsdf

updateLeaderboard(store,w.racing_plus.api,leaderboard);w.racing_plus.logger.info(`Track data loaded.`,w.racing_plus.start)}catch(err){w.racing_plus.logger.error(`Failed to load track data. ${err}`)}

w.racing_plus.logger.info(`Userscript started.`,w.racing_plus.start)}catch(err){w.racing_plus.logger.error(err)}};w.racing_plus.logger.info(`Userscript loaded. Starting...`,w.racing_plus.start);await start()})(window);