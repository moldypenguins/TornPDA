// ==UserScript==
// @name         TornPDA - Execute+
// @namespace    TornPDA.ExecutePlus
// @version      0.99.0
// @license      MIT
// @description  Shows execute limit in health bar.
// @author       moldypenguins [2881784]
// @match        https://www.torn.com/loader.php?sid=attack*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @updateURL    https://raw.githubusercontent.com/moldypenguins/TornPDA/refs/heads/main/dist/ExecutePlus.user.js
// @downloadURL  https://raw.githubusercontent.com/moldypenguins/TornPDA/refs/heads/main/dist/ExecutePlus.user.js
// @require      https://raw.githubusercontent.com/moldypenguins/TornPDA/refs/heads/main/dist/Common.js
// @run-at       document-end
// ==/UserScript==

(async (w) => {
  "use strict";

  const { defer, unixTimestamp, DEBUG_MODE } = w.TornPDAPlus.Common;

  if (w.execute_plus) return;
  w.execute_plus = unixTimestamp();

  const EXECUTE_LEVEL = 15;

  const checkExecute = async (progress) => {
    if (DEBUG_MODE) {
      console.log("[Execute+]: Checking HealthBar...");
    }
    if (!progress) {
      console.log("[Execute+]: Error - Invalid progress.");
      return;
    }
    //let progress = healthBar.querySelector('[aria-label^="Progress:"]');
    let targetHealth = parseFloat(progress.ariaLabel.replace(/Progress: (\d{1,3}\.?\d{0,2})%/, "$1"));
    if (targetHealth <= EXECUTE_LEVEL) {
      progress.classList.toggle("execute", true);
    } else {
      progress.classList.toggle("execute", false);
    }
  };

  let user = await defer("#torn-user");
  let userdata = JSON.parse(user.value);

  let healthBar = await defer(`div[class^="playersModelWrap_"] div[class^="header_"]:not([aria-describedby^="player-name_${userdata.playername}"])`);
  if (healthBar) {
    // Watch healthBar for changes
    if (DEBUG_MODE) {
      console.log("[Execute+]: Adding HealthBar Observer...");
    }
    let healthBarObserver = new MutationObserver(async (mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "aria-label" &&
          mutation.target.ariaLabel &&
          mutation.target.ariaLabel.startsWith("Progress:")
        ) {
          await checkExecute(mutation.target);
        }
      }
    });
    healthBarObserver.observe(healthBar.parentElement, {
      subtree: true,
      attributes: true,
    });
    await checkExecute(healthBar.querySelector('[aria-label^="Progress:"]'));
  }

  if (DEBUG_MODE) console.log("[Execute+]: Adding styles...");
  if (!w.document.head) await new Promise((r) => w.addEventListener("DOMContentLoaded", r, { once: true }));
  const s = w.document.createElement("style");
  s.innerHTML = `__MINIFIED_CSS__`;
  w.document.head.appendChild(s);
  if (DEBUG_MODE) console.log("[Execute+]: Styles added.");
})();
