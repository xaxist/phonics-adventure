import puppeteer from 'puppeteer';

const BASE = 'http://localhost:5173/phonics-adventure/';

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath:
      process.env.CHROME_PATH ??
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  let errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') { errors.push(`console: ${msg.text()}`); console.error(`  [console.error] ${msg.text()}`); }
  });
  page.on('pageerror', (err) => { errors.push(`pageerror: ${err}`); console.error(`  [pageerror] ${err}`); });

  try {
    console.log('Navigating to', BASE);
    await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });

    // 1. Home renders
    await page.waitForSelector('.hero', { timeout: 10000 });
    await page.waitForSelector('.world-card', { timeout: 10000 });
    const worldCount = await page.$$eval('.world-card', (els) => els.length);
    console.log(`Home OK — ${worldCount} world cards`);

    // 2. Open World 1
    await page.click('.world-card');
    await page.waitForSelector('.world-banner', { timeout: 10000 });
    await page.waitForSelector('.lesson-node', { timeout: 10000 });
    const nodeCount = await page.$$eval('.lesson-node', (els) => els.length);
    console.log(`World OK — ${nodeCount} lesson nodes`);

    // 3. Open first lesson
    await page.click('.lesson-node');
    await page.waitForSelector('.lesson-header', { timeout: 10000 });
    await page.waitForSelector('.rule-card', { timeout: 10000 });
    console.log('Lesson OK — Learn step renders');

    // 4. Words step
    await page.$$eval('.step-pill', (pills) => pills[1].click());
    await page.waitForSelector('.word-card', { timeout: 10000 });
    const wordCount = await page.$$eval('.word-card', (els) => els.length);
    console.log(`Words OK — ${wordCount} word cards`);

    // 5. Sentences step + karaoke highlight check
    await page.$$eval('.step-pill', (pills) => pills[2].click());
    await page.waitForSelector('.karaoke-text', { timeout: 10000 });
    await page.waitForSelector('.play-big', { timeout: 10000 });
    console.log('Sentences OK — karaoke renders');

    // 6. Quiz — play all 6 rounds via in-page clicks (trusted-click throttling-safe)
    await page.$$eval('.step-pill', (pills) => pills[3].click());
    await page.waitForSelector('.quiz-options', { timeout: 10000 });

    const playRound = () =>
      page.evaluate(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const trace = [];
        const deadline = Date.now() + 60000; // 6 rounds × wrong-pick reveal waits
        while (Date.now() < deadline) {
          const celebrate = document.querySelector('.celebrate');
          if (celebrate) return 'celebrate';
          const doneCount = document.querySelectorAll('.quiz-dot.done').length;
          const opts = [...document.querySelectorAll('.quiz-option:not(:disabled)')];
          if (opts.length) {
            opts[0].click();
            await wait(400);
            // If wrong, the answer is revealed with .correct for ~0.9s — grab its text
            const answerText = document.querySelector('.quiz-option.correct')?.textContent;
            if (answerText) {
              // wait for options to re-enable (reveal class clears by then)
              for (let i = 0; i < 60 && document.querySelector('.quiz-option:disabled'); i++) {
                await wait(100);
              }
              const btn = [...document.querySelectorAll('.quiz-option')].find(
                (o) => o.textContent === answerText && !o.disabled,
              );
              if (btn) btn.click();
              await wait(300);
            }
            // else: first pick was already correct — auto-advances on its own
          }
          // wait for either the celebration or the done-dot count to increase
          for (let i = 0; i < 120; i++) {
            await wait(100);
            if (document.querySelector('.celebrate')) return 'celebrate: ' + trace.join(' | ');
            if (document.querySelectorAll('.quiz-dot.done').length > doneCount) {
              trace.push(`round ${doneCount + 1} ok`);
              break;
            }
          }
        }
        return 'timeout: ' + trace.join(' | ');
      });

    const playResult = await playRound();
    if (!playResult.startsWith('celebrate')) {
      throw new Error(`quiz did not complete: ${playResult}`);
    }
    console.log(`  trace: ${playResult}`);
    await page.waitForSelector('.celebrate', { timeout: 10000 });
    await page.waitForFunction(
      () => document.querySelectorAll('.star-big.lit').length > 0,
      { timeout: 5000 },
    );
    const litStars = await page.$$eval('.star-big.lit', (els) => els.length);
    console.log(`Quiz OK — completed, celebration with ${litStars} stars`);

    await page.waitForFunction(
      () => parseInt(document.querySelector('.star-pill')?.textContent ?? '0', 10) > 0,
      { timeout: 5000 },
    );
    console.log('Star pill updated OK');

    // 7. Settings
    await page.click('button[aria-label="Open settings"]');
    await page.waitForSelector('.modal-panel', { timeout: 10000 });
    await page.waitForSelector('.voice-row', { timeout: 10000 });
    const voiceCount = await page.$$eval('.voice-row', (els) => els.length);
    console.log(`Settings OK — ${voiceCount} voices listed`);

    // Esc closes
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 200));
    const modalGone = (await page.$('.modal-panel')) === null;
    console.log(modalGone ? 'Esc closes settings OK' : 'WARN: modal still open after Esc');

    if (errors.length) {
      console.error('Page errors detected:');
      errors.forEach((e) => console.error('  ', e));
      process.exit(1);
    }
    console.log('\nAll smoke tests passed ✔');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err.message);
    if (errors.length) {
      console.error('Page errors:');
      errors.forEach((e) => console.error('  ', e));
    }
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
