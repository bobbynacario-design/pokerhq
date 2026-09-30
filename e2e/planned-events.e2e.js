'use strict';
const assert = require('node:assert/strict');
const { boot, out } = require('./lib.js');

(async () => {
  for (const width of [1280, 390]) {
    const app = await boot({ viewport: { width, height: 900 } });
    const { page } = app;
    try {
      await page.evaluate(() => {
        window.bankroll.amount = 30000;
        window.tourneys = Array.from({ length: 13 }, (_, i) => ({
          id: i + 1, date: '2099-10-' + String(i + 1).padStart(2, '0'),
          name: 'Championship — Flight ' + String(i + 1).padStart(2, '0'),
          venue: i % 2 ? 'Metro Card Club, Bldg. C Metrowalk Commercial Complex, Ortigas, Pasig City' : 'PokerStars LIVE Manila at Okada Manila',
          buyin: 1000, planning: true
        })).reverse();
        syncGlobalAliases(); switchGroup('plan', 'calendar'); renderCalendar();
      });
      assert.equal(await page.locator('#planned-details').evaluate(e => e.open), false);
      assert.equal(await page.locator('.planned-row:visible').count(), 0);
      assert.match(await page.locator('.planned-summary').innerText(), /13 events · ₱13,000/);
      assert.match(await page.locator('.planned-next').innerText(), /Flight 01/);
      assert.match(await page.locator('.planned-next .planned-venue').innerText(), /^Okada Manila$/);
      assert.ok(await page.locator('.planned-card').evaluate(e => e.getBoundingClientRect().height) < 230, 'collapsed plan stays small');
      await page.locator('.planned-card').screenshot({ path: out('planned-collapsed-' + width + '.png'), style: '.mobile-nav,.mobile-subtab-strip{visibility:hidden}' });

      await page.locator('#planned-details summary').click();
      assert.equal(await page.locator('.planned-row:visible').count(), 6);
      assert.deepEqual(await page.locator('.planned-row').evaluateAll(rows => rows.map(r => r.id)), [1,2,3,4,5,6].map(i => 'planned-row-' + i));
      assert.equal(await page.locator('#planned-row-2 .planned-venue').innerText(), 'Metro Card Club');
      assert.equal(await page.locator('.planned-list .tourney-status').count(), 0, 'secondary list does not repeat calendar badges');
      await page.locator('.planned-card').screenshot({ path: out('planned-expanded-' + width + '.png'), style: '.mobile-nav,.mobile-subtab-strip{visibility:hidden}' });
      for (const light of [false, true]) {
        await page.evaluate(light => document.body.classList.toggle('light', light), light);
        assert.ok(await page.locator('.planned-card').evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'no horizontal overflow');
      }
      await page.click('#privacy-toggle');
      await page.evaluate(() => renderPlannedEvents());
      await page.waitForFunction(() => !PokerHQPrivacy.hasMoney(document.getElementById('planned-events-wrap').innerText));
      await page.click('#privacy-toggle');
      await page.waitForFunction(() => document.querySelector('.planned-summary').innerText.includes('₱13,000'));

      await page.click('#planned-next-page'); await page.click('#planned-next-page');
      assert.equal(await page.locator('.planned-row').count(), 1);
      await page.locator('#planned-row-13 .planned-remove').click();
      assert.equal(await page.locator('#planned-details').evaluate(e => e.open), true);
      assert.match(await page.locator('.planned-pagination').innerText(), /7–12 of 12/);
      assert.equal(await page.locator('.planned-row').count(), 6, 'removing last page clamps to the preceding page');
      assert.equal(await page.evaluate(() => tourneys.find(t => t.id === 13).planning), false);
      assert.equal(await page.evaluate(() => tourneys.length), 13, 'unpin keeps the calendar event');
      assert.equal(await page.evaluate(() => document.activeElement.classList.contains('planned-remove')), true, 'keyboard focus survives removal');
      await page.locator('#planned-row-7 .planned-remove').click();
      assert.match(await page.locator('.planned-pagination').innerText(), /7–11 of 11/);
      await page.evaluate(() => renderCalendar());
      assert.equal(await page.locator('#planned-details').evaluate(e => e.open), true, 'calendar refresh preserves expansion');
      await page.locator('#planned-details summary').click(); await page.evaluate(() => renderCalendar());
      assert.equal(await page.locator('#planned-details').evaluate(e => e.open), false, 'user can collapse it and keep it collapsed');

      await page.locator('.planned-start').click();
      await page.waitForFunction(() => _activeSessionDraft && _activeSessionDraft.name === 'Championship — Flight 01');
      assert.equal(await page.evaluate(() => _activeSessionDraft.buyin), 1000);
      await page.locator('#modal-readiness').waitFor({ state: 'visible' });
      await page.evaluate(() => { closeModal('modal-readiness'); switchGroup('plan', 'calendar'); tourneys.forEach(t => t.planning = false); renderCalendar(); });
      assert.equal(await page.locator('.planned-card').count(), 0, 'empty plan disappears');
      await page.evaluate(() => togglePlanning(13));
      assert.equal(await page.locator('#planned-details').evaluate(e => e.open), false, 'new plan starts collapsed again');
      assert.match(await page.locator('.planned-next').innerText(), /Flight 13/);
      await page.locator('#planned-details summary').click();
      await page.locator('#planned-row-13 .planned-remove').click();
      assert.equal(await page.locator('.planned-card').count(), 0);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'vbtn-planned', 'focus returns to calendar controls when the plan becomes empty');
      assert.deepEqual(app.realErrors(), []);
      console.log('ok compact plan, pagination, removal, focus and start next at ' + width + 'px');
    } finally { await app.close(); }
  }
})().catch(e => { console.error(e); process.exit(1); });
