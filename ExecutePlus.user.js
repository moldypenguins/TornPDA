// ==UserScript==
// @name         TornPDA - Execute+
// @namespace    TornPDA.ExecutePlus
// @version      0.2
// @license      MIT
// @description  Shows execute limit in health bar.
// @author       moldypenguins [2881784]
// @match        https://www.torn.com/loader.php?sid=attack*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @updateURL    https://github.com/moldypenguins/TornPDA/raw/main/ExecutePlus.user.js
// @downloadURL  https://github.com/moldypenguins/TornPDA/raw/main/ExecutePlus.user.js
// @run-at       document-end
// ==/UserScript==

(async () => {
  'use strict';
  const DEBUG_MODE = true; // Turn on to log to console.
  const DEFERRAL_LIMIT = 250; // Maximum amount of times the script will defer.
  const DEFERRAL_INTERVAL = 100; // Amount of time in milliseconds deferrals will last.
  const EXECUTE_LEVEL = 15;
  const PDA = {
    addStyle: (style) => {
      if (!style) {
        return;
      }
      const s = document.createElement('style');
      s.innerHTML = style;
      document.head.appendChild(s);
    },
  };
  const defer = (selector) => {
    let count = 0;
    return new Promise((resolve, reject) => {
      try {
        const check = () => {
          if (count > DEFERRAL_LIMIT) {
            throw new Error('Deferral timed out.');
          }
          const result = document.querySelector(selector);
          if (result) {
            resolve(result);
          } else {
            if (DEBUG_MODE) {
              console.log('Execute+: Deferring...');
            }
            setTimeout(check, DEFERRAL_INTERVAL);
          }
        };
        check();
      } catch (err) {
        if (!err) {
          console.error(`Execute+ Error: UNKNOWN`);
          return;
        }
        console.error(`Execute+ Error: ${err}`);
        reject(err);
      }
    });
  };
  const checkExecute = async () => {
    if (DEBUG_MODE) {
      console.log('Execute+: Checking HealthBar...');
    }
    let progress = healthBar.querySelector('[aria-label^="Progress:"]');
    let targetHealth = parseFloat(progress.getAttribute('aria-label').replace(/Progress: (\d{1,3}\.?\d{0,2})%/, '$1'));
    if (targetHealth <= EXECUTE_LEVEL) {
      progress.classList.toggle('execute', true);
    } else {
      progress.classList.toggle('execute', false);
    }
  };

  let userdata = JSON.parse((await defer('#torn-user')).value);
  let healthBar = await defer(`div[class^="playersModelWrap_"] div[class^="header_"]:not([aria-describedby^="player-name_${userdata.playername}"])`);
  if (healthBar) {
    // Watch healthBar for changes
    if (DEBUG_MODE) {
      console.log('Execute+: Adding HealthBar Observer...');
    }
    let healthBarObserver = new MutationObserver(async (mutations) => {
      await checkExecute();
    });
    healthBarObserver.observe(healthBar, { attributes: true, attributeFilter: ['aria-label'], classList: true });
    await checkExecute();
  }
  PDA.addStyle(`
    .execute {
      background-image: linear-gradient(#FFB46C,#FFA737) !important;
    }
  `);
})();
