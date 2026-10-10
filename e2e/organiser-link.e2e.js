'use strict';
// The organiser link: shown on calendar rows and the Playing These card when an
// event has a safe http(s) page, editable in Add / Edit Tournament, and carried
// into the exported calendar file.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { boot, out } = require('./lib.js');

const APT = 'https://www.theasianpokertour.com/series/apt-championship-taipei-2026/';

(async () => {
  for (const width of [1280, 390]) {
    const app = await boot({ viewport: { width, height: 900 } });
    const { page } = app;
    try {
      await page.evaluate((apt) => {
        window.bankroll.amount = 30000;
        window.tourneys = [
          { id: 1, date: '2099-11-13', name: 'Satellite to National Cup Championship', venue: 'Red Space, Taipei', buyin: 6486, url: apt, planning: true },
          { id: 2, date: '2099-11-14', name: 'Unsafe link', venue: 'Red Space, Taipei', buyin: 6486, url: 'javascript:alert(1)' },
          { id: 3, date: '2099-11-15', name: 'No link', venue: 'Okada Manila', buyin: 1000 }
        ];
        syncGlobalAliases(); switchGroup('plan', 'calendar'); setView('list'); renderCalendar();
      }, APT);

      const link = page.locator('#event-row-1 .event-link');
      assert.equal(await link.innerText(), 'Organiser ↗');
      assert.equal(await link.getAttribute('href'), APT);
      assert.equal(await link.getAttribute('target'), '_blank');
      assert.match(await link.getAttribute('rel'), /noopener/);
      assert.equal(await page.locator('#event-row-2 .event-link').count(), 0, 'an unsafe address is never linked');
      assert.equal(await page.locator('#event-row-3 .event-link').count(), 0);
      assert.equal(await page.locator('.planned-next .event-link').getAttribute('href'), APT, 'Playing These shows it too');
      assert.ok(await page.locator('#event-row-1').evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'row does not overflow');
      await page.locator('#event-row-1').screenshot({ path: out('organiser-link-row-' + width + '.png') });

      // Edit: the field shows the saved link; a bad address is refused; a good one saves.
      await page.evaluate(() => editTourney(1));
      assert.equal(await page.inputValue('#t-url'), APT);
      await page.fill('#t-url', 'ftp://example.com/schedule');
      await page.evaluate(() => addTourney());
      assert.match(app.dialogs.map(d => d.message).join('\n'), /needs to be a web address/);
      assert.equal(await page.evaluate(() => tourneys.find(t => t.id === 1).url), APT, 'refused edit keeps the old link');
      await page.fill('#t-url', 'https://wptseoul.com/schedule');
      await page.evaluate(() => addTourney());
      assert.equal(await page.evaluate(() => tourneys.find(t => t.id === 1).url), 'https://wptseoul.com/schedule');
      await page.evaluate(() => editTourney(1));
      await page.fill('#t-url', '');
      await page.evaluate(() => addTourney());
      assert.equal(await page.evaluate(() => tourneys.find(t => t.id === 1).url), '', 'clearing the field removes the link');

      // New event with a link.
      await page.evaluate(() => openNewTourneyModal());
      assert.equal(await page.inputValue('#t-url'), '', 'a new event starts without a link');
      await page.fill('#t-name', 'WPT Seoul Inspire Championship');
      await page.fill('#t-date', '2099-11-05');
      await page.fill('#t-venue', 'INSPIRE Entertainment Resort, Incheon');
      await page.fill('#t-buyin', '2000');
      await page.fill('#t-url', 'https://wptseoul.com/schedule');
      await page.evaluate(() => addTourney());
      const added = await page.evaluate(() => tourneys.find(t => t.name === 'WPT Seoul Inspire Championship'));
      assert.equal(added.url, 'https://wptseoul.com/schedule');

      // The calendar file carries the link in the event description.
      const download = page.waitForEvent('download');
      await page.evaluate(() => exportCalendarICS());
      const ics = fs.readFileSync(await (await download).path(), 'utf8');
      assert.match(ics, /Organiser: https:\/\/wptseoul\.com\/schedule/);
      assert.doesNotMatch(ics, /javascript:alert/);

      assert.deepEqual(app.realErrors(), []);
      console.log('ok organiser link on rows, Playing These, form and calendar file at ' + width + 'px');
    } finally { await app.close(); }
  }
})().catch(e => { console.error(e); process.exit(1); });
