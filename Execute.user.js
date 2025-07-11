// ==UserScript==
// @name         Execute
// @namespace    TornPDA.Execute
// @version      0.1
// @description  Shows execute limit in health bar.
// @author       moldypenguins [2881784]
// @match        https://www.torn.com/loader.php?sid=attack*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @updateURL    https://github.com/moldypenguins/TornPDA/raw/main/execute.user.js
// @downloadURL  https://github.com/moldypenguins/TornPDA/raw/main/execute.user.js
// @grant        GM_addStyle
// @run-at       document-body
// ==/UserScript==

(function () {
  'use strict';

  let executeLevel = 15;

  let healthBar = $('div [aria-label^="Progress:"]');
  if (healthBar) {
    let targetHealth = parseFloat(healthBar.attr('aria-label').replace(/Progress: (\d{1,3}\.?\d{0,2})%/, '$1'));
    if (targetHealth <= executeLevel) {
      GM_addStyle(`
        .progress___iG5el {
          background-image: linear-gradient(#FFB46C, #FFA737) !important;
        }
      `);
    }
  }
})();
