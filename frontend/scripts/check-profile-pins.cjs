// Manual browser QA against a built preview, with API fixtures only.
// Set MEDIA_PLAYWRIGHT_MODULE / MEDIA_CHROMIUM_PATH for an external installation.
const { chromium } = require(process.env.MEDIA_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const preview = process.env.MEDIA_PREVIEW_URL || 'http://127.0.0.1:18307';
const owner = '11111111-1111-4111-8111-111111111111';
const visitor = '22222222-2222-4222-8222-222222222222';
const account = (id, visible = true) => ({
  id, username: 'Alexandru cu un nume foarte lung', bio: 'Biografie de test',
  is_private: !visible, can_view_content: visible, posts_count: 60,
  followers_count: 0, following_count: 0, created_at: '2026-11-22T10:00:00Z', role: 'user',
});

(async () => {
  const browser = await chromium.launch({
    headless: true, executablePath: process.env.MEDIA_CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    for (const theme of ['light', 'dark']) for (const width of [320, 390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 950 }, colorScheme: theme, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let pin = 'older', viewer = owner, visible = true, failure = false, mutations = 0, pinReads = 0;
      const post = id => ({ id, user: account(owner), content: `Postarea ${id}`, is_pinned: id === pin,
        likes_count: 0, comments_count: 0, created_at: '2026-11-22T10:00:00Z' });
      await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        let body = {}, status = 200;
        if (path === '/api/auth/me') body = account(viewer);
        else if (path.endsWith('/pinned-post')) {
          pinReads++;
          body = pin ? post(pin) : null;
        } else if (path.endsWith('/pin')) {
          mutations++;
          await new Promise(resolve => setTimeout(resolve, 300));
          if (failure) { status = 503; body = { title: 'Unavailable' }; }
          else {
            const id = path.split('/')[3];
            if (route.request().method() === 'PUT') pin = id;
            else if (pin === id) pin = null;
            body = { pinned_post_id: pin };
          }
        } else if (path.endsWith('/posts')) body = ['recent', 'newest'].map(post);
        else if (path.startsWith('/api/users/')) body = account(path.split('/')[3], visible);
        await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      });
      await page.goto(`${preview}/profile/${owner}`);
      const featured = page.getByRole('region', { name: 'Postare fixată' });
      await featured.getByText('Postarea older', { exact: true }).waitFor();
      assert.equal(await page.locator('.post-content').count(), 3, 'pin outside first page is included');
      const oldButton = featured.getByRole('button', { name: 'Anulează fixarea pe profil' });
      assert.equal(await oldButton.getAttribute('aria-pressed'), 'true');
      await oldButton.focus();
      await page.keyboard.press('Enter');
      await featured.waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.activeElement?.id === 'profile-posts-title');
      const recent = page.locator('[data-profile-pin="recent"]');
      const newest = page.locator('[data-profile-pin="newest"]');
      await recent.click();
      assert(await recent.isDisabled());
      assert(await newest.isDisabled(), 'all cards serialize pin choices');
      await featured.getByText('Postarea recent', { exact: true }).waitFor();
      await page.waitForFunction(() => document.activeElement?.dataset.profilePin === 'recent');
      assert.equal(await page.getByText('Postarea recent', { exact: true }).count(), 1, 'no duplicate featured row');
      assert.equal(await recent.getAttribute('aria-pressed'), 'true');
      assert.equal(mutations, 2);
      await newest.click();
      await featured.getByText('Postarea newest', { exact: true }).waitFor();
      assert.equal(await recent.getAttribute('aria-pressed'), 'false');
      assert.equal(await newest.getAttribute('aria-pressed'), 'true');
      failure = true;
      await recent.click();
      await page.getByText('Fixarea nu a putut fi actualizată. Încearcă din nou.', { exact: true }).waitFor();
      assert.equal(await newest.getAttribute('aria-pressed'), 'true', 'failed choice retains confirmed pin');
      failure = false;
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert(await recent.evaluate(element => { const r = element.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; }));
      // A visitor sees the featured content without ownership controls.
      viewer = visitor;
      await page.reload();
      await featured.getByText('Postarea newest', { exact: true }).waitFor();
      assert.equal(await page.locator('.profile-pin-button').count(), 0);
      // Private profile policy is checked before any content endpoint is called.
      visible = false;
      const before = pinReads;
      await page.reload();
      await page.getByRole('heading', { name: 'Acest cont este privat' }).waitFor();
      assert.equal(await featured.count(), 0);
      assert.equal(await page.locator('.post-content').count(), 0);
      assert.equal(pinReads, before);
      assert.deepEqual(errors, []);
      console.log(`profile pins ${theme}/${width}: paging, deduplication, keyboard focus, serialization, retry, visitor and private audience passed`);
      await context.close();
    }
    // A slow pinned-post response must not restore the preceding route.
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let slowPinRequested;
    const requested = new Promise(resolve => { slowPinRequested = resolve; });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body = {};
      if (path === '/api/auth/me') body = account(visitor);
      else if (path.endsWith('/pinned-post')) {
        if (path.includes(owner)) {
          slowPinRequested();
          await new Promise(resolve => setTimeout(resolve, 600));
          body = { id: 'stale', user: account(owner), content: 'Stale pin', is_pinned: true, created_at: '2026-11-22T10:00:00Z' };
        } else body = null;
      } else if (path.endsWith('/posts')) body = [];
      else if (path.startsWith('/api/users/')) body = account(path.split('/')[3]);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(`${preview}/profile/${owner}`);
    await requested;
    await page.evaluate(path => {
      history.pushState({}, '', path);
      dispatchEvent(new PopStateEvent('popstate'));
    }, `/profile/${visitor}`);
    await page.locator('#profile-name').waitFor();
    await page.waitForTimeout(750);
    assert.equal(await page.getByText('Stale pin', { exact: true }).count(), 0);
    assert.equal(await page.locator('.profile-pinned').count(), 0);
    assert.deepEqual(errors, []);
    console.log('profile pin route race: stale content rejected');
    await page.close();
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
