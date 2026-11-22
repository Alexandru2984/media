// Built-preview browser QA; all account/API data below are disposable fixtures.
const { chromium } = require(process.env.MEDIA_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const preview = process.env.MEDIA_PREVIEW_URL || 'http://127.0.0.1:18307';
const viewerA = '11111111-1111-4111-8111-111111111111';
const viewerB = '22222222-2222-4222-8222-222222222222';
const account = id => ({ id, username: id === viewerA ? 'Mara' : 'Andrei', role: 'user', is_private: false });
const post = (id, folder = null) => ({ id, user: account(viewerB), content: `Ideea salvată ${id}`, is_saved: true,
  collection_id: folder, likes_count: 0, comments_count: 0, created_at: '2026-11-23T00:00:00Z' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.MEDIA_CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    for (const theme of ['light', 'dark']) for (const width of [320, 390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 950 }, colorScheme: theme, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        window.savedCspViolations = [];
        window.addEventListener('securitypolicyviolation', event => window.savedCspViolations.push(event.violatedDirective));
      });
      let folders = [{ id: 'reading', name: 'Lecturi' }];
      let rows = Array.from({ length: 25 }, (_, i) => post(`p${i}`, i < 5 ? 'reading' : null));
      let failCreate = true, failMove = false, failList = false, duplicatePage = true, slowFilter = false;
      const reads = []; let saves = 0;
      await page.route('**/api/**', async route => {
        const url = new URL(route.request().url()), path = url.pathname, method = route.request().method();
        let body = {}, status = 200;
        if (path === '/api/auth/me') body = account(viewerA);
        else if (path === '/api/saved-collections') {
          if (method === 'GET') {
            if (failList) { failList = false; status = 503; body = { title: 'Unavailable' }; }
            else body = folders;
          } else {
            await pause(250);
            if (failCreate) { failCreate = false; status = 503; body = { title: 'Unavailable' }; }
            else { body = { id: 'new-folder', name: route.request().postDataJSON().name }; folders.push(body); }
          }
        } else if (path.startsWith('/api/saved-collections/')) {
          const id = path.split('/')[3];
          if (method === 'PUT') {
            body = { id, name: route.request().postDataJSON().name };
            folders = folders.map(folder => folder.id === id ? body : folder);
          } else {
            folders = folders.filter(folder => folder.id !== id);
            rows = rows.map(row => row.collection_id === id ? { ...row, collection_id: null } : row);
            body = { deleted: true };
          }
        } else if (path === '/api/saved-posts') {
          const filter = url.searchParams.get('collection_id') || '';
          const offset = Number(url.searchParams.get('offset')), limit = Number(url.searchParams.get('limit'));
          reads.push({ filter, offset, limit });
          const all = rows.filter(row => !filter || (filter === 'unfiled' ? !row.collection_id : row.collection_id === filter));
          body = all.slice(offset, offset + limit);
          if (!filter && offset === 10 && duplicatePage) {
            duplicatePage = false; body = [all[9], ...all.slice(10, 19)];
          }
          if (slowFilter && filter === 'reading') { slowFilter = false; await pause(600); }
        } else if (path.endsWith('/collection')) {
          const id = path.split('/')[3];
          await pause(150);
          if (failMove) { failMove = false; status = 503; body = { title: 'Unavailable' }; }
          else {
            body = route.request().postDataJSON();
            rows = rows.map(row => row.id === id ? { ...row, collection_id: body.collection_id } : row);
          }
        } else if (path.endsWith('/save')) {
          saves++; const id = path.split('/')[3]; rows = rows.filter(row => row.id !== id); body = { saved: false };
        }
        await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      });
      await page.goto(`${preview}/salvate`);
      const filter = page.locator('#saved-collection-filter');
      const newButton = page.getByRole('button', { name: 'Colecție nouă', exact: true });
      await page.waitForFunction(() => document.querySelectorAll('.saved-entry').length === 10 && !document.querySelector('.saved-library .btn-primary').disabled);
      await page.getByRole('button', { name: 'Încarcă mai multe', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.saved-entry').length === 19);
      await page.getByRole('button', { name: 'Încarcă mai multe', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.saved-entry').length === 24);
      assert.deepEqual(reads.slice(0, 3).map(read => read.offset), [0, 10, 20]);
      assert.equal(new Set(await page.locator('.post-content').allTextContents()).size, 24);
      slowFilter = true;
      const slowRequest = page.waitForRequest(req => req.url().includes('collection_id=reading'));
      await filter.selectOption('reading'); await slowRequest; await filter.selectOption('');
      await page.waitForTimeout(750);
      assert.equal(await page.locator('.saved-entry').count(), 10, 'stale folder response rejected');
      await newButton.click();
      const dialog = page.getByRole('dialog', { name: 'Colecție nouă', exact: true });
      const name = dialog.getByLabel('Numele colecției', { exact: true });
      await name.fill('📚'.repeat(60));
      assert.equal(await dialog.locator('#saved-name-count').innerText(), '60/60');
      assert(await dialog.getByRole('button', { name: 'Salvează colecția', exact: true }).isEnabled());
      await name.fill('📚'.repeat(61));
      assert(await dialog.getByRole('button', { name: 'Salvează colecția', exact: true }).isDisabled());
      const privateName = 'Lecturi & <idei> „noi”'; await name.fill(privateName);
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('Tab'); assert(await dialog.evaluate(element => element.contains(document.activeElement)));
      }
      await dialog.getByRole('button', { name: 'Salvează colecția', exact: true }).click();
      await page.keyboard.press('Escape'); assert(await dialog.isVisible());
      await dialog.getByText('Modificarea nu a putut fi salvată. Încearcă din nou.', { exact: true }).waitFor();
      assert.equal(await name.inputValue(), privateName);
      await dialog.getByRole('button', { name: 'Salvează colecția', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await filter.inputValue(), 'new-folder');
      await page.getByRole('heading', { name: 'Nicio postare în această colecție', exact: true }).waitFor();
      assert(await newButton.evaluate(element => document.activeElement === element));
      await filter.selectOption('');
      const filing = id => page.locator(`#collection-for-${id}`);
      await filing('p0').waitFor(); await filing('p0').selectOption('new-folder');
      await page.getByText('Postarea a fost mutată.', { exact: true }).waitFor();
      assert.equal(await filing('p0').inputValue(), 'new-folder');
      assert(await filing('p0').evaluate(element => document.activeElement === element));
      failMove = true; await filing('p1').selectOption('new-folder');
      await page.getByText('Postarea nu a putut fi mutată. Încearcă din nou.', { exact: true }).waitFor();
      assert.equal(await filing('p1').inputValue(), 'reading');
      await filing('p1').selectOption('new-folder');
      await page.waitForFunction(() => document.querySelector('#collection-for-p1')?.value === 'new-folder' && !document.querySelector('#collection-for-p1').disabled);
      await filter.selectOption('new-folder');
      await page.waitForFunction(() => document.querySelectorAll('.saved-entry').length === 2);
      await page.getByRole('button', { name: 'Redenumește', exact: true }).click();
      const rename = page.getByRole('dialog', { name: 'Redenumește colecția', exact: true });
      await rename.getByLabel('Numele colecției', { exact: true }).fill('n'.repeat(60));
      await rename.getByRole('button', { name: 'Salvează colecția', exact: true }).click();
      await rename.waitFor({ state: 'hidden' });
      assert.equal(await filter.locator('option:checked').innerText(), 'n'.repeat(60));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await filing('p0').selectOption('');
      await filing('p0').waitFor({ state: 'hidden' });
      assert(await filter.evaluate(element => document.activeElement === element));
      await page.getByRole('button', { name: 'Șterge colecția', exact: true }).click();
      const deletion = page.getByRole('dialog', { name: 'Șterge colecția', exact: true });
      assert((await deletion.innerText()).includes('Postările rămân salvate'));
      await deletion.getByRole('button', { name: 'Șterge colecția', exact: true }).click();
      await deletion.waitFor({ state: 'hidden' });
      assert.equal(await filter.inputValue(), 'unfiled');
      assert.equal(rows.length, 25); assert.equal(saves, 0);
      await filing('p0').waitFor();
      await filing('p0').locator('xpath=ancestor::div[contains(@class,"saved-entry")]').getByRole('button', { name: 'Elimină postarea din salvate', exact: true }).click();
      await filing('p0').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.querySelectorAll('.saved-entry').length === 10 && !document.querySelector('.saved-library').getAttribute('aria-busy').includes('true'));
      assert.equal(saves, 1);
      await filter.selectOption('reading');
      await page.waitForFunction(() => document.querySelectorAll('.saved-entry').length === 3);
      folders = [];
      await page.getByRole('button', { name: 'Actualizează colecțiile', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#saved-collection-filter').value === '');
      folders = Array.from({ length: 30 }, (_, i) => ({ id: `limit-${i}`, name: `Colecție ${i}` }));
      failList = true;
      await page.getByRole('button', { name: 'Actualizează colecțiile', exact: true }).click();
      await page.getByText('Colecțiile nu au putut fi încărcate.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Actualizează colecțiile', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('#saved-collection-filter option').length === 32);
      assert(await newButton.isDisabled());
      assert(!await page.evaluate(value => JSON.stringify({ ...sessionStorage, ...localStorage }).includes(value), privateName));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => window.savedCspViolations), []);
      if (process.env.MEDIA_SCREENSHOT_DIR && width === 320) await page.screenshot({ path: `${process.env.MEDIA_SCREENSHOT_DIR}/saved-collections-${theme}-320.png`, fullPage: false });
      console.log(`saved collections ${theme}/${width}: CRUD, Unicode, pending/focus/retry, move/unfile, preserved saves, filters, pagination, stale response and quota passed`);
      await context.close();
    }
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let viewer = viewerA, started;
    const oldRequest = new Promise(resolve => { started = resolve; });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body = {};
      if (path === '/api/auth/me') body = account(viewer);
      else if (path === '/api/auth/logout') { viewer = null; body = {}; }
      else if (path === '/api/auth/login') { viewer = viewerB; body = { user: account(viewerB) }; }
      else if (path === '/api/saved-collections') {
        if (viewer === viewerA) { started(); await pause(900); body = [{ id: 'secret', name: 'Private collection A' }]; }
        else body = [{ id: 'b', name: 'Collection B' }];
      } else if (path === '/api/saved-posts') {
        body = [post(viewer === viewerA ? 'SecretA' : 'VisibleB')];
        if (viewer === viewerA) await pause(900);
      } else if (path === '/api/posts') body = [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(`${preview}/salvate`); await oldRequest;
    await page.getByRole('button', { name: 'Deconectare', exact: true }).click();
    await page.waitForFunction(() => location.pathname === '/');
    await page.evaluate(() => { history.pushState({}, '', '/login?next=/salvate'); dispatchEvent(new PopStateEvent('popstate')); });
    await page.locator('#login-email').fill('b@example.invalid');
    await page.locator('#login-password').fill('Fixture password 2026!');
    await page.locator('button[type=submit]').click();
    await page.getByText('Ideea salvată VisibleB', { exact: true }).waitFor();
    await page.waitForTimeout(1100);
    assert.equal(await page.getByText('Ideea salvată SecretA', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('option', { name: 'Private collection A', exact: true }).count(), 0);
    assert.equal(await page.getByRole('option', { name: 'Collection B', exact: true }).count(), 2);
    assert.deepEqual(errors, []);
    console.log('saved collections viewer race: prior account content and names discarded after logout/login');
    await page.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
