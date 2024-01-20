// ==UserScript==
// @name         Torn PDA - Racing Enhancements
// @namespace    TornPDA.racing_enhancements
// @version      0.4.4
// @description  Show racing skill, current speed, race results, precise skill.
// @author       moldypenguins [2881784] - Adapted from Lugburz
// @match        https://www.torn.com/loader.php?sid=racing*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @updateURL    https://github.com/moldypenguins/TornPDA/raw/main/racing_enhancements.user.js
// @downloadURL  https://github.com/moldypenguins/TornPDA/raw/main/racing_enhancements.user.js
// @connect      api.torn.com
// @run-at       document-body
// ==/UserScript==

(function () {
  "use strict";

  const API_KEY = '###PDA-APIKEY###';

  const speedPeriod = 1000;

  // Whether to show racing skill.
  const ADD_LINKS = GM.getValue("addLinksChk") != 0;
  // Whether to show racing skill.
  const SHOW_SKILL = GM.getValue("showSkillChk") != 0;
  // Whether to show current speed.
  const SHOW_SPEED = GM.getValue("showSpeedChk") != 0;
  // Whether to show race result as soon as a race starts.
  const SHOW_RESULTS = GM.getValue("showResultsChk") != 0;

  let torn_api = async (args) => {
    let a = args.split(".");
    if (a.length < 3 || a.length > 4) {
      throw `Bad argument in torn_api(args, key): ${args}`;
    }
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
          var err = textStatus + ", " + error;
          reject(err);
        });
    });
  };

  async function addEnhancementsDiv() {
    let div = '<div id="racingEnhancements">' +
        '<span id="updating" style="display:none;"></span>' +
        '<a id="racingEnhancementsTitle">Racing Enhancements</a>' +
        '<ul id="racingEnhancementsContainer" style="display: none;">' +
          '<li><input type="checkbox" id="addLinksChk"><label>Add profile links</label></li>' +
          '<li><input type="checkbox" id="showSkillChk"><label>Show racing skill</label></li>' +
          '<li><input type="checkbox" id="showSpeedChk"><label>Show current speed</label></li>' +
          '<li><input type="checkbox" id="showResultsChk"><label>Show race results</label></li>' +
        "</ul>" +
      "</div>";
    $(".drivers-list").children(":first").after(div);

    $("#racingEnhancementsTitle").on("click", (event) => $("#racingEnhancementsContainer").toggle());

    $("#racingEnhancementsContainer").find("input[type=checkbox]").each((index, checkbox) => {
      $(checkbox).prop("checked", GM.getValue($(checkbox).attr("id")) != 0);
    });
    $("#racingEnhancementsContainer input").on("click", (event) => {
      GM.setValue(event.target.id, event.target.checked ? 1 : 0);
    });

    // save some space
    $("#racingdetails").find("li.pd-name").each((index, detail) => {
      if ($(detail).text() === "Name:") {
        $(detail).remove();
      }
      if ($(detail).text() === "Position:") {
        $(detail).text("Pos:");
      }
      if ($(detail).text() === "Last Lap:") {
        $(detail).text("Last:");
        $(detail).removeClass("t-hide");
      }
      if ($(detail).text() === "Completion:") {
        $(detail).remove();
      }
    });
    $("li.pd-laptime").removeClass("t-hide");
    if (SHOW_RESULTS && $(".pd-besttime").length < 1) {
      $("#racingdetails li.pd-completion").after(
        '<li class="pd-val pd-besttime">--:--</li>'
      );
      $("#racingdetails li.pd-completion").after(
        '<li class="pd-name">Best:</li>'
      );
    }
    $("#racingdetails li.pd-completion").remove();

    //add link placeholder
    if ($("#raceLink").length < 1 && $("#raceLinkPlaceholder").length < 1) {
      let raceLinkPlaceholder = `<span id="raceLinkPlaceholder">` +
        '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><g><path d="M3.09,4.36c1.25-1.25,3.28-1.26,4.54,0,.15.15.29.32.41.5l-1.12,1.12c-.32-.74-1.13-1.15-1.92-.97-.31.07-.59.22-.82.45l-2.15,2.15c-.65.66-.63,1.72.03,2.37.65.63,1.69.63,2.34,0l.66-.66c.6.24,1.25.34,1.89.29l-1.47,1.47c-1.26,1.26-3.29,1.26-4.55,0-1.26-1.26-1.26-3.29,0-4.55h0l2.15-2.15ZM6.51.94l-1.47,1.46c.64-.05,1.29.05,1.89.29l.66-.66c.65-.65,1.72-.65,2.37,0,.65.65.65,1.72,0,2.37h0l-2.15,2.15c-.66.65-1.71.65-2.37,0-.15-.15-.28-.33-.36-.53l-1.12,1.12c.12.18.25.34.4.49,1.25,1.26,3.29,1.26,4.54,0,0,0,0,0,0,0l2.15-2.15c1.26-1.26,1.25-3.29,0-4.55-1.26-1.26-3.29-1.25-4.55,0Z" fill="currentColor" stroke-width="0"></path></g></svg>' +
        "</span>";
      $("#racingEnhancements").prepend(raceLinkPlaceholder);
    }
  }

  function getDriverId(driverUl) {
    return +$(driverUl).parent("li")[0].id.substr(4);
  }

  // Cache racing skill and interval object
  let racingSkillCacheByDriverId = new Map();
  let speedIntervalByDriverId = new Map();
  // Watch for changes
  let leaderboardObserver = new MutationObserver(async (mutations) => {
    let leaderboard = $(".drivers-list #leaderBoard");
    if (leaderboard.length < 1) { return; }

    let driverIds = Array.from(leaderboard.find(".driver-item")).map((driver) => getDriverId(driver));
    if (!driverIds || !driverIds.length) { return; }

    leaderboard.find(".driver-item").each(async (num, driver) => {
      let driverId = getDriverId(driver);

      if (SHOW_SPEED) {
        if ($(driver).children(".speed").length < 1) {
          $(driver).children(".time").before(`<li class="speed">0.00mph</li>`);
        }
        if (!speedIntervalByDriverId.has(driverId)) {
          speedIntervalByDriverId.set(driverId, setInterval(updateSpeed, speedPeriod, driverId));
        }
      }

      let racingSkill = "";
      if (racingSkillCacheByDriverId.has(driverId)) {
        // Use cached skill
        racingSkill = racingSkillCacheByDriverId.get(driverId);
      } else {
        // Fetch racing skill
        try {
          let driverStats = await torn_api(`user.${driverId}.personalstats.RacingUiUx`);
          if (driverStats.personalstats && driverStats.personalstats.racingskill) {
            racingSkillCacheByDriverId.set(+driverId, driverStats.personalstats.racingskill);
            racingSkill = driverStats.personalstats.racingskill;
          }
        } catch (error) {
          if ($("#error").length > 0) { $("#error").remove(); }
          $("#racingEnhancementsTitle").after(`<div id="error">API error: ${JSON.stringify(error)}</div>`);
          return false;
        }
      }
      if (SHOW_SKILL && $(driver).children(".skill").length < 1) {
        $(driver).children(".name").after(`<li class="skill">RS: ${racingSkill}</li>`);
      }
    });
  });

  // Speed
  let lastTimeByDriverId = new Map();
  async function updateSpeed(driverId) {
    let driverUl = $(`#lbr-${driverId} ul`);
    if (driverUl.length < 1) { return; }

    if (driverUl.children(".time").text().indexOf("%") >= 0) {
      let laps = $("#racingupdatesnew").find("div.title-black").text().split(" - ")[1].split(" ")[0];
      let len = $("#racingupdatesnew").find("div.track-info").attr("data-length").replace("mi", "");
      let compl = driverUl.children(".time").text().replace("%", "");

      if (lastTimeByDriverId.has(driverId)) {
        let speed = (((compl - lastTimeByDriverId.get(driverId)) / 100) * laps * len * 60 * 60 * 1000) / speedPeriod;
        driverUl.children(".speed").text(speed.toFixed(2) + "mph");
      }
      lastTimeByDriverId.set(driverId, compl);
    } else {
      driverUl.children(".speed").text("0.00mph");
    }
  }

  // Skill
  async function updateSkill(level) {
    let curr = Number(level).toFixed(6);
    let prev = GM.getValue("racingSkill");

    if (typeof(prev) !== "undefined" && curr > prev) {
      let lastInc = Number(curr - prev).toFixed(6);
      if (lastInc) {
        $("div.skill").append(`<div class="lastgain" style="margin-top:10px;">Last gain: ${lastInc}</div>`);
      }
    }
    GM.setValue("racingSkill", curr);

    if ($("#racingMainContainer").find("div.skill").length > 0) {
      $("#racingMainContainer").find("div.skill").text(curr);
    }
  }


  // Parse ajax response
  let raceResults = [];
  async function parseRacingData(data) {
    // update driver skill
    await updateSkill(data.user.racinglevel);

    // display race link
    if ($("#raceLink").length < 1) {
      if ($("#raceLinkPlaceholder").length > 0) {
        $("#raceLinkPlaceholder").remove();
      }
      let raceLink = `<a id="raceLink" href="https://www.torn.com/loader.php?sid=racing&tab=log&raceID=${data.raceID}">` +
          '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><g><path d="M3.09,4.36c1.25-1.25,3.28-1.26,4.54,0,.15.15.29.32.41.5l-1.12,1.12c-.32-.74-1.13-1.15-1.92-.97-.31.07-.59.22-.82.45l-2.15,2.15c-.65.66-.63,1.72.03,2.37.65.63,1.69.63,2.34,0l.66-.66c.6.24,1.25.34,1.89.29l-1.47,1.47c-1.26,1.26-3.29,1.26-4.55,0-1.26-1.26-1.26-3.29,0-4.55h0l2.15-2.15ZM6.51.94l-1.47,1.46c.64-.05,1.29.05,1.89.29l.66-.66c.65-.65,1.72-.65,2.37,0,.65.65.65,1.72,0,2.37h0l-2.15,2.15c-.66.65-1.71.65-2.37,0-.15-.15-.28-.33-.36-.53l-1.12,1.12c.12.18.25.34.4.49,1.25,1.26,3.29,1.26,4.54,0,0,0,0,0,0,0l2.15-2.15c1.26-1.26,1.25-3.29,0-4.55-1.26-1.26-3.29-1.25-4.55,0Z" fill="currentColor" stroke-width="0"></path></g></svg>' +
        "</a>";
      $("#racingEnhancements").prepend(raceLink);
      $("#raceLink").on("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        //TODO: add tooltip
        //SEE: https://www.torn.com/page.php?sid=education&category=7&course=67
        GM.setClipboard(`https://www.torn.com/loader.php?sid=racing&tab=log&raceID=${data.raceID}`);
      });
    }

    // calc, sort & show race results
    if (SHOW_RESULTS && data.timeData.status >= 3) {
      // Populate results
      if(raceResults.length < 1) {
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

      }
    }
  }

  async function showResults() {
    // if no results set driver status to waiting
    if(raceResults.length < 1) {
      $('li[id^=lbr-] ul').children('.status-wrap').html(`<div class="status waiting"></div>`);

    } else {
      // add export results
      //addExportButton(raceResults, data.user.playername, data.raceID, data.timeData.timeEnded);

      // set result for each driver
      raceResults.forEach((result, index) => {
        let driverUl = $(`#lbr-${result[0]} ul`);
        if(driverUl.length < 1) { return; }

        let place = index + 1;
        let statusLi = driverUl.children('.status-wrap');
        if (result[2] === "crashed") {
          statusLi.html(`<div class="status crashed"></div>`);
        } else if (place == 1) {
          statusLi.html('<div class="status gold"></div>');
        } else if (place == 2) {
          statusLi.html('<div class="status silver"></div>');
        } else if (place == 3) {
          statusLi.html('<div class="status bronze"></div>');
        } else {
          statusLi.html(`<div class="finished-${place} finished">${place}</div>`);
        }
      });
      
      // set best lap for selected driver
      let selectedDriverUl = $('#leaderBoard li.selected[id^=lbr-] ul');
      if(selectedDriverUl.length < 1) { selectedDriverUl = $(`#leaderBoard #lbr-${$('script[uid]').attr('uid')} ul`); }
      let selectedDriverId = getDriverId(selectedDriverUl);
      //userId, playername, status, raceTime, bestLap
      await setBestLap(selectedDriverId);

      $('#leaderBoard li[id^=lbr-]').on("click", async (event) => {
        await setBestLap(Number(event.currentTarget.id.substring(4)));
      });

    }
  }


  async function setBestLap(driverId) {
    let driverResult = raceResults.find((r) => { 
      return Number(r[0]) === driverId; 
    });
    let bestLap = driverResult[4] ? formatTime(driverResult[4] * 1000) : null;
    if (bestLap) { $('li.pd-besttime').text(bestLap); }
    else { $('li.pd-besttime').text('--:--'); }
  }


  function formatTime(msec) {
    let hours = Math.floor((msec % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    let minutes = Math.floor((msec % (1000 * 60 * 60)) / (1000 * 60));
    let seconds = Math.floor((msec % (1000 * 60)) / 1000);
    let mseconds = Math.floor(msec % 1000);
    return (
      ('00' + minutes).toString().slice(-2) + ":" + 
      ('00' + seconds).toString().slice(-2) + "." + 
      ('000' + mseconds).toString().slice(3)
    );
  }

  // Add profile links to driver names
  async function addLinks() {
    let names = $("ul.overview").find("li.name");
    names.each(function () {
      let parent = $(this).parent().parent();
      if (parent.attr("id").startsWith("lbr-")) {
        let username = $(this).html().replace("<span>", "").replace("</span>", "");
        let user_id = parent.attr("id").replace("lbr-", "");
        $(this).html(`<a href=/profiles.php?XID=${user_id}>${username}</a>`);
      }
    });
  }

  // Sleep and wait for elements to load
  async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Main run
  async function run(xhr) {
    if ($("#racingupdatesnew").length > 0 && $(".drivers-list").length > 0) {
      clearInterval(waitForElementsAndRun);

      if ($("#racingEnhancementsTitle").length < 1) {
        await addEnhancementsDiv();
      }

      $("#updating").show();

      // Main logic
      try {
        if (xhr) {
          await parseRacingData(JSON.parse(xhr.responseText));
        }
        if(SHOW_RESULTS) {
          showResults();
        }
        if (SHOW_SPEED || SHOW_SKILL) {
          leaderboardObserver.observe(document.querySelector(".drivers-list #leaderBoard"), { childList: true });
        }
        if (ADD_LINKS) {
          await addLinks();
        }
      } catch (e) {
        // wrapper not found
      } finally {
        await sleep(500);
        $("#updating").hide();
      }
    }
  }

  // On ajax complete event
  $(document).ajaxComplete(async (event, xhr, settings) => {
    if (xhr.readyState > 3 && xhr.status == 200) {
      try {
        let url = new URL(settings.url);
        if (url.pathname.substring(url.pathname.lastIndexOf("/") + 1, url.pathname.indexOf(".php")) !== "loader") { return; }

        waitForElementsAndRun = setInterval(run, 0, xhr);
      } catch (error) {
        // invalid url
        
      }
    }
  });

  // Run
  let waitForElementsAndRun = setInterval(run, 0);
  $('a[tab-value="race"]').trigger("click");

  // Styles
  GM.addStyle(`
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
    background-image:url(/images/v2/main/ajax-loader.gif);
    background-image:var(--default-preloader-url);
    background-repeat:no-repeat;
    width:80px;
    height:10px;
    display:inline-block;
    float:right;
    margin-right:10px;
  }
  #error { 
    color:#FF6666; 
    font-size:12px; 
    text-align:center; 
    display:block;
  }
  @media screen and (min-width: 785px) {
    .d .racing-main-wrap .header-wrap .banner .skill-desc {
      left:9px!important;
    }
    .d .racing-main-wrap .header-wrap .banner .skill {
      left:9px!important;
      font-size:0.75rem!important;
    }
    .d .racing-main-wrap .header-wrap .banner .lastgain {
      top:82px;
      left:87px;
      color:#00ff00;
      position:absolute;
      font-size:0.75rem;
    }
    .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name {
      width:${342 - (SHOW_SPEED ? 65 : 0) - (SHOW_SKILL ? 50 : 0)}px!important;
    }
  }
  @media screen and (max-width: 784px) {
    .d .racing-main-wrap .header-wrap .banner .skill-desc {
      left:10px!important;
    }
    .d .racing-main-wrap .header-wrap .banner .skill {
      left:125px!important;
      font-size:0.75rem!important;
      line-height:0.85rem;
    }
    .d .racing-main-wrap .header-wrap .banner .lastgain {
      top:10px;
      left:200px;
      color:#00ff00;
      position:absolute;
      font-size:0.75rem;
    }
    .d #racingdetails .pd-name {
      padding-right:1px;
    }
    .d #racingdetails .pd-val:not(.pd-pilotname) {
        padding-left:1px;
    }
    .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.name {
      width:${202 - (SHOW_SPEED ? 65 : 0) - (SHOW_SKILL ? 50 : 0)}px!important;
    }
  }

  .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.speed {
    width:65px;
    line-height:30px;
    padding:0 5px;
    white-space:nowrap;
  }
  .d .racing-main-wrap .car-selected-wrap .drivers-list .driver-item>li.skill {
    width:50px;
    line-height:30px;
    padding:0 5px;
    white-space:nowrap;
  }
  .d .racing-main-wrap .car-selected-wrap .drivers-list .overview>li:hover .driver-item>li.speed, 
  .d .racing-main-wrap .car-selected-wrap .drivers-list .overview>li.selected .driver-item>li.speed,
  .d .racing-main-wrap .car-selected-wrap .drivers-list .overview>li:hover .driver-item>li.skill, 
  .d .racing-main-wrap .car-selected-wrap .drivers-list .overview>li.selected .driver-item>li.skill {
    background:url('/images/v2/racing/selected_driver.png') 0 0 repeat-x;
  }
`);
})();
