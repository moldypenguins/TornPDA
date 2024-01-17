// ==UserScript==
// @name         Torn PDA - Racing Enhancements
// @namespace    TornPDA.racing_enhancements
// @version      0.2.0
// @description  Show car's current speed, precise skill, official race penalty, racing skill of others.
// @author       moldypenguins [2881784] - Adapted from Lugburz
// @match        https://www.torn.com/loader.php?sid=racing*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @updateURL    https://github.com/moldypenguins/TornPDA/raw/main/racing_enhancements.user.js
// @downloadURL  https://github.com/moldypenguins/TornPDA/raw/main/racing_enhancements.user.js
// @connect      api.torn.com
// @run-at       document-body
// ==/UserScript==

(function() {
  'use strict';

  let API_KEY = '###PDA-APIKEY###';

  let torn_api = async (args) => {
      const a = args.split('.')
      if (a.length < 3 || a.length > 4) throw (`Bad argument in torn_api(args, key): ${args}`)
      return new Promise((resolve, reject) => {
          let streamURL = `https://api.torn.com/${a[0]}/${a[1]}?selections=${a[2]}` + (a.length !== 4 ? `` : `&comment=${a[3]}`) + `&key=${API_KEY}`;
          // Reject if key isn't set.
          $.getJSON(streamURL)
              .done((result) => {
              if (result.error != undefined) {
                  reject(result.error);
              } else {
                  resolve(result);
              }
          })
              .fail(function (jqxhr, textStatus, error) {
              var err = textStatus + ', ' + error;
              reject(err);
          });
      });
  }

  var RACE_ID = '*';

  var period = 1000;
  var last_compl = -1.0;
  var x = 0;

  var penaltyNotif = 0;

  //cache racing skill
  let racingSkillCacheByDriverId = new Map();


  // Whether to show racing skill.
  const SHOW_SKILL = GM.getValue('showSkillChk') != 0;
  // Whether to show current speed.
  const SHOW_SPEED = GM.getValue('showSpeedChk') != 0;
  // Whether to show race result as soon as a race starts.
  const SHOW_RESULTS = GM.getValue('showResultsChk') != 0;
  // whether to show the top3 position icon
  const SHOW_POSITION_ICONS = GM.getValue('showPositionIconChk') != 0;


  function addEnhancementsDiv() {
      let div = '<div id="racingEnhancements">' +
          '<a id="racingEnhancementsOptions">Racing Enhancements</a>' +
          '<div id="racingEnhancementsOptionsContainer" style="display:none;"><ul>' +
          '<li><input type="checkbox" style="margin-left: 5px; margin-right: 5px" id="showSkillChk"><label>Show racing skill</label></li>' +
          '<li><input type="checkbox" style="margin-left: 5px; margin-right: 5px" id="showSpeedChk"><label>Show current speed</label></li>' +
          //'<li><input type="checkbox" style="margin-left: 5px; margin-right: 5px" id="showResultsChk"><label>Show results</label></li>' +
          //'<li><input type="checkbox" style="margin-left: 5px; margin-right: 5px" id="showPositionIconChk"><label>Show position icons</label></li>' +
          '</ul></div></div>'
      $('.drivers-list').children(":first").after(div);

      $('#racingEnhancementsOptions').on('click', () => $('#racingEnhancementsOptionsContainer').toggle());

      $('#racingEnhancementsOptionsContainer').find('input[type=checkbox]').each(function() {
          $(this).prop('checked', GM.getValue($(this).attr('id')) != 0);
      });
      $('#racingEnhancementsOptionsContainer').on('click', 'input', function() {
          GM.setValue($(this).attr('id'), $(this).prop('checked') ? 1 : 0);
      });
  }


  function getDriverId(driverUl) {
      return +driverUl.closest('li').id.substr(4);
  }

  let updating = false;
  let leaderboardObserver = new MutationObserver(async (mutations) => {
      let leaderboard = document.querySelector('.drivers-list #leaderBoard');
      if (updating || leaderboard === null) { return; }

      const driverIds = Array.from(leaderboard.querySelectorAll('.driver-item')).map(driver => getDriverId(driver));
      if (!driverIds || !driverIds.length) { return; }

      updating = true;
      $('#updating').size() < 1 && $('#racingEnhancementsOptions').after('<div id="updating" style="color:green;font-size:10px;float:right;">Updating...</div>');

      const racingSkills = await getRacingSkillForDrivers(driverIds);
      for (let driver of leaderboard.querySelectorAll('.driver-item')) {
          const driverId = getDriverId(driver);
          if (!!racingSkills[driverId]) {
              const skill = racingSkills[driverId];
              const nameDiv = driver.querySelector('.name');
              nameDiv.style.position = 'relative';
              if (!driver.querySelector('.rs-display')) {
                  nameDiv.insertAdjacentHTML('beforeend', `<span class="rs-display">Skill: ${skill}</span>`);
              }
          }
      }

      
      $('#updating').size() > 0 && $('#updating').remove();
      updating = false;
  });


  let racersCount = 0;
  async function getRacingSkillForDrivers(driverIds) {
      let driverIdsToFetchSkillFor = driverIds.filter(driverId => !racingSkillCacheByDriverId.has(driverId));
      for (let driverId of driverIdsToFetchSkillFor) {
          let driver = await torn_api(`user.${driverId}.personalstats.RacingUiUx`)
          if (driver.error) {
              $('#racingEnhancementsOptions').after(`<div id="error">API error: ${JSON.stringify(json.error)}</div>`);
              break;
          } else {
              racingSkillCacheByDriverId.set(+driverId, driver.personalstats && driver.personalstats.racingskill ? driver.personalstats.racingskill : 'N/A');
              racersCount++;
              if (racersCount > 19) { await sleep(1500); }
          }
      }
      const resultHash = {};
      for (const driverId of driverIds) {
          const skill = racingSkillCacheByDriverId.get(driverId);
          if (!!skill) { resultHash[driverId] = skill; }
      }
      return resultHash;
  }


  function maybeClear() {
      if (x != 0 ) {
          clearInterval(x);
          last_compl = -1.0;
          x = 0;
      }
  }

  async function showSpeed() {
      if ($('#racingdetails').size() < 1 || $('#racingdetails').find('#speed_mph').size() > 0) { return; }
      
      $('#racingdetails').append('<li class="pd-name">Speed:</li>');
      $('#racingdetails').append('<li class="pd-val pd-speed" id="speed_mph">0.00mph</li>');

      maybeClear();

      x = setInterval(function() {
          if ($('#racingupdatesnew').find('div.track-info').size() < 1) {
              maybeClear();
              return;
          }

          let laps = $('#racingupdatesnew').find('div.title-black').text().split(" - ")[1].split(" ")[0];
          let len = $('#racingupdatesnew').find('div.track-info').attr('data-length').replace('mi', '');
          let compl = $('#racingdetails').find('li.pd-completion').text().replace('%', '');

          if (last_compl >= 0) {
              let speed = (compl - last_compl) / 100 * laps * len * 60 * 60 * 1000 / period;
              $('#speed_mph').text((speed.toFixed(2) || '0.00') + 'mph');
          }
          last_compl = compl;
      }, period);
  }




  // Sleep and wait for elements to load
  async function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
  }

  let waitForElementsAndRun = setInterval(async () => { await run(); }, 100);
  
  async function run(xhr) {
      if ($("#racingupdatesnew").length > 0 && $(".drivers-list").length > 0) {
          clearInterval(waitForElementsAndRun);

          if ($('#racingEnhancementsOptions').length < 1) {
              addEnhancementsDiv();
          }

          // save some space
          $('#racingdetails').find('li.pd-name').each(function() {
              if ($(this).text() == 'Name:') { $(this).hide(); }
              if ($(this).text() == 'Last Lap:') { $(this).text('Last:'); }
              if ($(this).text() == 'Completion:') { 
                  $(this).text('Total:'); 
                  if (SHOW_SPEED) { 
                      $(this).addClass('t-hide'); 
                      $('.pd-completion').addClass('t-hide'); 
                  }
              }
          });

          // Main logic
          try {
              if (xhr) {
                  parseRacingData(JSON.parse(xhr.responseText));
                  showPenalty
              }

              if (SHOW_SKILL) {
                  leaderboardObserver.observe(document.querySelector('.drivers-list #leaderBoard'), { childList: true });
              }

              if (SHOW_SPEED) { 
                  await showSpeed(); 
              }


              


          } catch (e) {
              // wrapper not found
          }
      }
  }

  $(document).ajaxComplete(async (event, xhr, settings) => {
      if (xhr.readyState > 3 && xhr.status == 200) {
          try {
              let url = new URL(settings.url);
              if (url.pathname.substring(url.pathname.lastIndexOf('/') + 1, url.pathname.indexOf('.php')) !== "loader") { return; }
              await run(xhr);
          } catch(error) {
              // invalid url
          }
      }
  });





  function showPenalty() {

  }

  
  function updateSkill(level) {
      const skill = Number(level).toFixed(5);
      const prev = GM.getValue('racinglevel');
  
      const now = Date.now();
      if (prev !== "undefined" && typeof prev !== "undefined" && level > prev) {
          const lastInc = Number(level - prev).toFixed(5);
          if (lastInc) {
              $('div.skill').append(`<div style="margin-top:10px;">Last gain: ${lastInc}</div>`);
          }
      }
      GM.setValue('racinglevel', level);
  
      if ($('#racingMainContainer').find('div.skill').size() > 0) {
          if ($("#sidebarroot").find("a[class^='menu-value']").size() > 0) {
              // move the elements to the left a little bit to fit 5th decimal digit in desktop mode
              $('#racingMainContainer').find('div.skill-desc').css('left', '5px');
              $('#racingMainContainer').find('div.skill').css('left', '5px').text(skill);
          } else {
              $('#racingMainContainer').find('div.skill').text(skill);
          }
      }
  }
  



  function parseRacingData(data) {
      updateSkill(data['user']['racinglevel']);
  
      const leavepenalty = data['user']['leavepenalty'];


      if (penaltyNotif) { clearTimeout(penaltyNotif); }

      const penaltyLeft = leavepenalty * 1000 - Date.now();
      if (NOTIFICATIONS && penaltyLeft > 0) {
          penaltyNotif = setTimeout(function() {
              GM.notification("You may join an official race now.", "Torn: Racing enhancements");
          }, penaltyLeft);
      }
  
      // display race link
      if ($('#raceLink').size() < 1) {
          RACE_ID = data.raceID;
          const raceLink = `<a id="raceLink" href="https://www.torn.com/loader.php?sid=racing&tab=log&raceID=${RACE_ID}" style="float: right; margin-left: 12px;">Link to the race</a>`;
          $(raceLink).insertAfter('#racingEnhSettings');
      }
  
      // calc, sort & show race results
      if (data.timeData.status >= 3) {
          const carsData = data.raceData.cars;
          const carInfo = data.raceData.carInfo;
          const trackIntervals = data.raceData.trackData.intervals.length;
          let results = [], crashes = [];
  
          for (const playername in carsData) {
              const userId = carInfo[playername].userID;
              const intervals = decode64(carsData[playername]).split(',');
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
                  results.push([playername, userId, raceTime, bestLap]);
              } else {
                  crashes.push([playername, userId, 'crashed']);
              }
          }
  
          // sort by time
          results.sort(compare);
          addExportButton(results, crashes, data.user.playername, data.raceID, data.timeData.timeEnded);
  
          if (SHOW_RESULTS) {
              showResults(results);
              showResults(crashes, results.length);
          }
      }


      if ($('#racingAdditionalContainer').find('div.msg.right-round').size() > 0 &&
          $('#racingAdditionalContainer').find('div.msg.right-round').text().trim().startsWith('You have recently left')) {
              const penalty = leavepenalty * 1000;
              const now = Date.now();
              if (penalty > now) {
                  const date = new Date(penalty);
                  $('#racingAdditionalContainer').find('div.msg.right-round').text('You may join an official race at ' + formatTime(date) + '.');
              }
      }
  }
  
  // compare by time
  function compare(a, b) {
      if (a[2] > b[2]) return 1;
      if (b[2] > a[2]) return -1;
  
      return 0;
  }


  GM.addStyle(`
  .rs-display {
      position: absolute;
      right: 5px;
  }
  ul.driver-item > li.name {
      overflow: auto;
  }
  li.name .race_position {
      background:url(/images/v2/racing/car_status.svg) 0 0 no-repeat;
      display:inline-block;
      width:20px;
      height:18px;
      vertical-align:text-bottom;
  }
  li.name .race_position.gold {
      background-position:0 0;
  }
  li.name .race_position.silver {
      background-position:0 -22px;
  }
  li.name .race_position.bronze {
      background-position:0 -44px;
  }
  #racingEnhancements {
      padding:5px 10px;
      margin-bottom:2px;
      background:repeating-linear-gradient(90deg,#242424,#242424 2px,#2e2e2e 0,#2e2e2e 4px);
  }
  #racingEnhancementsOptions {
      cursor:pointer;
  }
  #racingEnhancements ul {
      list-style-type:none;
      margin:0;
  }
  #racingEnhancements ul li {
      margin:5px 0;
      padding:0;
      font-size: 10px;
      line-height: 10px;
  }
  #racingEnhancements ul li input[type='checkbox'] {
      height: 10px;
      vertical-align:middle;
  }
  #error {
      color:red;
      font-size:10px;
      float:right;
  }
  `);




})();

