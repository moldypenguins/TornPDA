// ==UserScript==
// @name         Torn PDA - Racing Enhancements
// @namespace    TornPDA.racing_enhancements
// @version      0.3.3
// @description  Show racing skill, current speed, race results, precise skill.
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

  let RACE_ID = '*';

  // Speed
  let period = 1000;
  let last_compl = -1.0;
  let x = 0;

  // Cache racing skill
  let racingSkillCacheByDriverId = new Map();

  // Whether to show racing skill.
  const SHOW_SKILL = GM.getValue('showSkillChk') != 0;
  // Whether to show current speed.
  const SHOW_SPEED = GM.getValue('showSpeedChk') != 0;
  // Whether to show race result as soon as a race starts.
  const SHOW_RESULTS = GM.getValue('showResultsChk') != 0;
  

  async function addEnhancementsDiv() {
      let div = '<div id="racingEnhancements">' +
                      '<a id="racingEnhancementsTitle">Racing Enhancements</a>' +
                      '<ul id="racingEnhancementsContainer" style="display: none;">' +
                          '<li><input type="checkbox" id="showSkillChk"><label>Show racing skill</label></li>' +
                          '<li><input type="checkbox" id="showSpeedChk"><label>Show current speed</label></li>' +
                          '<li><input type="checkbox" id="showResultsChk"><label>Show race results</label></li>' +
                      '</ul>' + 
                  '</div>';
      $('.drivers-list').children(":first").after(div);

      $('#racingEnhancementsTitle').on('click', () => $('#racingEnhancementsContainer').toggle());

      $('#racingEnhancementsContainer').find('input[type=checkbox]').each(function() {
          $(this).prop('checked', GM.getValue($(this).attr('id')) != 0);
      });
      $('#racingEnhancementsContainer').on('click', 'input', function() {
          GM.setValue($(this).attr('id'), $(this).prop('checked') ? 1 : 0);
      });

      // save some space
      $('#racingdetails').find('li.pd-name').each(function() {
          if ($(this).text() == 'Name:') { $(this).text(''); }
          if ($(this).text() == 'Last Lap:') { $(this).text('Last:'); }
          if ($(this).text() == 'Completion:') { 
              $(this).text('Total:'); 
              if (SHOW_SPEED) {
                  $(this).addClass('t-hide'); 
                  $('.pd-completion').addClass('t-hide'); 
                  $(this).removeClass('m-hide');
                  $('.pd-completion').removeClass('m-hide');
              }
          }
      });

      //add link placeholder
      if ($('#raceLink').length < 1 && $('#raceLinkPlaceholder').length < 1) {
          const raceLinkPlaceholder = `<span id="raceLinkPlaceholder">` + 
          '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><g><path d="M3.09,4.36c1.25-1.25,3.28-1.26,4.54,0,.15.15.29.32.41.5l-1.12,1.12c-.32-.74-1.13-1.15-1.92-.97-.31.07-.59.22-.82.45l-2.15,2.15c-.65.66-.63,1.72.03,2.37.65.63,1.69.63,2.34,0l.66-.66c.6.24,1.25.34,1.89.29l-1.47,1.47c-1.26,1.26-3.29,1.26-4.55,0-1.26-1.26-1.26-3.29,0-4.55h0l2.15-2.15ZM6.51.94l-1.47,1.46c.64-.05,1.29.05,1.89.29l.66-.66c.65-.65,1.72-.65,2.37,0,.65.65.65,1.72,0,2.37h0l-2.15,2.15c-.66.65-1.71.65-2.37,0-.15-.15-.28-.33-.36-.53l-1.12,1.12c.12.18.25.34.4.49,1.25,1.26,3.29,1.26,4.54,0,0,0,0,0,0,0l2.15-2.15c1.26-1.26,1.25-3.29,0-4.55-1.26-1.26-3.29-1.25-4.55,0Z" fill="currentColor" stroke-width="0"></path></g></svg>' + 
          '</span>';
          $('#racingEnhancements').prepend(raceLinkPlaceholder);
      }
  }


  function getDriverId(driverUl) {
      return +$(driverUl).parent('li')[0].id.substr(4);
  }

  
  let leaderboardObserver = new MutationObserver(async (mutations) => {
      let leaderboard = $('.drivers-list #leaderBoard');
      if (leaderboard.length < 1) { return; }

      const driverIds = Array.from(leaderboard.find('.driver-item')).map(driver => getDriverId(driver));
      if (!driverIds || !driverIds.length) { return; }

      leaderboard.find('.driver-item').each(async (num, driver) => {
          let racingSkill = ' ';
          let driverId = getDriverId(driver);
          if (racingSkillCacheByDriverId.has(driverId)) {
              // Use cached skill
              racingSkill = racingSkillCacheByDriverId.get(driverId);
          } else {
              // Fetch skill
              let driverStats = await torn_api(`user.${driverId}.personalstats.RacingUiUx`);
              if (driverStats.error) {
                  $('#racingEnhancementsTitle').after(`<div id="error">API error: ${JSON.stringify(json.error)}</div>`);
                  return false;
              } else {
                  if (driverStats.personalstats && driverStats.personalstats.racingskill) {
                      racingSkillCacheByDriverId.set(+driverId, driverStats.personalstats.racingskill);
                      racingSkill = driverStats.personalstats.racingskill;
                  }
              }
          }
          if ($(driver).children('.skill').length < 1) {
              $(driver).children('.name').after(`<li class="skill">RS: ${racingSkill}</li>`);
          }
      });
  });


  function maybeClear() {
      if (x != 0 ) {
          clearInterval(x);
          last_compl = -1.0;
          x = 0;
      }
  }

  async function showSpeed() {
      if ($('#racingdetails').length < 1 || $('#racingdetails').find('#speed_mph').length > 0) { return; }
      
      $('#racingdetails').append('<li class="pd-name">Speed:</li>');
      $('#racingdetails').append('<li class="pd-val pd-speed" id="speed_mph">0.00mph</li>');

      maybeClear();

      x = setInterval(function() {
          if ($('#racingupdatesnew').find('div.track-info').length < 1) {
              maybeClear();
              return;
          }
          if($('#racingdetails').find('li.pd-completion').text().indexOf('%') >= 0) {
              let laps = $('#racingupdatesnew').find('div.title-black').text().split(" - ")[1].split(" ")[0];
              let len = $('#racingupdatesnew').find('div.track-info').attr('data-length').replace('mi', '');
              let compl = $('#racingdetails').find('li.pd-completion').text().replace('%', '');

              if (last_compl >= 0) {
                  let speed = (compl - last_compl) / 100 * laps * len * 60 * 60 * 1000 / period;
                  $('#speed_mph').text(speed.toFixed(2) + 'mph');
              }
              last_compl = compl;
          } else {
              $('#speed_mph').text('0.00mph');
          }
      }, period);
  }




  async function updateSkill(level) {
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
  
      if ($('#racingMainContainer').find('div.skill').length > 0) {
          if ($("#sidebarroot").find("a[class^='menu-value']").length > 0) {
              // move the elements to the left a little bit to fit 5th decimal digit in desktop mode
              $('#racingMainContainer').find('div.skill-desc').css('left', '9px');
              $('#racingMainContainer').find('div.skill').css('left', '9px').text(skill);
          } else {
              $('#racingMainContainer').find('div.skill').text(skill);
          }
      }
  }
  


  async function parseRacingData(data) {
      await updateSkill(data.user.racinglevel);

      // display race link
      if ($('#raceLink').length < 1) {
          RACE_ID = data.raceID;

          if ($('#raceLinkPlaceholder').length > 0) {
              $('#raceLinkPlaceholder').remove();
          }

          const raceLink = `<a id="raceLink" href="https://www.torn.com/loader.php?sid=racing&tab=log&raceID=${RACE_ID}">` + 
          '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><g><path d="M3.09,4.36c1.25-1.25,3.28-1.26,4.54,0,.15.15.29.32.41.5l-1.12,1.12c-.32-.74-1.13-1.15-1.92-.97-.31.07-.59.22-.82.45l-2.15,2.15c-.65.66-.63,1.72.03,2.37.65.63,1.69.63,2.34,0l.66-.66c.6.24,1.25.34,1.89.29l-1.47,1.47c-1.26,1.26-3.29,1.26-4.55,0-1.26-1.26-1.26-3.29,0-4.55h0l2.15-2.15ZM6.51.94l-1.47,1.46c.64-.05,1.29.05,1.89.29l.66-.66c.65-.65,1.72-.65,2.37,0,.65.65.65,1.72,0,2.37h0l-2.15,2.15c-.66.65-1.71.65-2.37,0-.15-.15-.28-.33-.36-.53l-1.12,1.12c.12.18.25.34.4.49,1.25,1.26,3.29,1.26,4.54,0,0,0,0,0,0,0l2.15-2.15c1.26-1.26,1.25-3.29,0-4.55-1.26-1.26-3.29-1.25-4.55,0Z" fill="currentColor" stroke-width="0"></path></g></svg>' + 
          '</a>';
          $('#racingEnhancements').prepend(raceLink);
          $('#raceLink').on('click', function(event) {
              event.preventDefault();
              event.stopPropagation();
              //TODO: add tooltip
              //SEE: https://www.torn.com/page.php?sid=education&category=7&course=67
              GM.setClipboard(`https://www.torn.com/loader.php?sid=racing&tab=log&raceID=${RACE_ID}`);
          });



      }

      // calc, sort & show race results
      if (SHOW_RESULTS && data.timeData.status >= 3) {
          const carsData = data.raceData.cars;
          const carInfo = data.raceData.carInfo;
          const trackIntervals = data.raceData.trackData.intervals.length;
          let results = [], crashes = [];
  
          for (const playername in carsData) {
              
              const userId = carInfo[playername].userID;
              const intervals = atob(carsData[playername]).split(',');
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
          //addExportButton(results, crashes, data.user.playername, data.raceID, data.timeData.timeEnded);

          showResults(results);
          showResults(crashes, results.length);
      }
  }
  
  // compare by time
  function compare(a, b) {
      if (a[2] > b[2]) return 1;
      if (b[2] > a[2]) return -1;
  
      return 0;
  }

  function showResults(results, start = 0) {
      for (let i = 0; i < results.length; i++) {
          $('#leaderBoard').children('li').each(function() {
              const name = $(this).find('li.name').text().trim();
              const status = $(this).find('li.status-wrap');
              if (name == results[i][0]) {
                  const p = i + start + 1;

                  if (p == 1) {
                      status.html('<div class="status gold"></div>');
                  } else if (p == 2) {
                      status.html('<div class="status silver"></div>');
                  } else if (p == 3) {
                      status.html('<div class="status bronze"></div>');
                  } else {
                      status.html(`<div class="finished-${p} finished">${p}</div>`);
                  }

                  const bestLap = results[i][3] ? formatTimeMsec(results[i][3] * 1000) : null;
                  if(bestLap) {
                      $(this).find('li.name').html($(this).find('li.name').html().replace(name, `${name}<span class="bestlap t-hide">(Best: ${bestLap})</span>`));
                  }
                  return false;
              }
          });
      }
  }


  function pad(num, size) {
      return ('000000000' + num).slice(-size);
  }

  function formatTimeMsec(msec, alwaysShowHours = false) {
      const hours = Math.floor((msec % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((msec % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((msec % (1000 * 60)) / 1000);
      const mseconds = Math.floor(msec % 1000);
  
      return ((hours > 0 ? hours + ":" : '') + (hours > 0 || minutes > 0 ? pad(minutes, 2) + ":" : '') + pad(seconds, 2) + "." + pad(mseconds, 3));
  }






  // Sleep and wait for elements to load
  async function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
  }


  async function run(xhr) {
      if ($("#racingupdatesnew").length > 0 && $(".drivers-list").length > 0) {
          clearInterval(waitForElementsAndRun);

          if ($('#racingEnhancementsTitle').length < 1) {
              await addEnhancementsDiv();
          }

          if ($('#updating').length < 1) {
              $('#racingEnhancementsTitle').before('<span id="updating"></span>');
          }

          // Main logic
          try {
              if (xhr) {
                  await parseRacingData(JSON.parse(xhr.responseText));
              }
              if (SHOW_SKILL) {
                  leaderboardObserver.observe(document.querySelector('.drivers-list #leaderBoard'), { childList: true });
              }
              if (SHOW_SPEED) { 
                  await showSpeed(); 
              }
              
          } catch (e) {
              // wrapper not found

          } finally {
              if ($('#updating').length > 0) {
                  await sleep(500);
                  $('#updating').remove();
              }
          }

      }
  }

  $(document).ajaxComplete(async (event, xhr, settings) => {
      if (xhr.readyState > 3 && xhr.status == 200) {
          try {
              let url = new URL(settings.url);
              if (url.pathname.substring(url.pathname.lastIndexOf('/') + 1, url.pathname.indexOf('.php')) !== "loader") { return; }
              
              waitForElementsAndRun = setInterval(run, 0, xhr);

          } catch(error) {
              // invalid url

          }
      }
  });

  let waitForElementsAndRun = setInterval(run, 0);
  


  GM.addStyle(`
  .bestlap { position: absolute; right: 5px; }

  ul.driver-item > li.name { overflow: auto; }
  .d #racingdetails li.pd-pilotname { padding-right:13px; }

  #racingEnhancements {
      padding:5px 10px;
      margin-bottom:2px;
      background:repeating-linear-gradient(90deg,#242424,#242424 2px,#2e2e2e 0,#2e2e2e 4px);
  }
  #raceLink, #raceLinkPlaceholder {
      display:inline-block;
      float:right;
  }
  #racingEnhancementsTitle {
      text-decoration:none;
      cursor:pointer;
      display:block;
  }
  #racingEnhancementsContainer {
      list-style-type:none;
      margin:0;
  }
  #racingEnhancementsContainer li {
      margin:5px 0;
      padding:0;
      font-size: 10px;
      line-height: 10px;
  }
  #racingEnhancementsContainer li input[type='checkbox'] {
      height:10px;
      vertical-align:middle;
      margin:0 5px;
  }
  #updating { 
      background-image: url(/images/v2/main/ajax-loader.gif);
      background-image: var(--default-preloader-url);
      background-repeat: no-repeat;
      width: 80px;
      height: 10px;
      display: inline-block;
      float: right;
      margin-right:10px;
  }
  #error { color:red; font-size:10px; float:right; }
  .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name {
      width:295px!important;
  }
  .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.skill {
      width:47px;
      line-height:30px;
      padding:0 5px
  }
  .d .racing-main-wrap .car-selected-wrap .drivers-list .overview>li:hover .driver-item>li.skill, 
  .d .racing-main-wrap .car-selected-wrap .drivers-list .overview>li.selected .driver-item>li.skill {
      background:url('/images/v2/racing/selected_driver.png') 0 0 repeat-x;
  }
  `);




})();

