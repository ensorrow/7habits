import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:4173';
const OUT = '/opt/cursor/artifacts/screenshots';
mkdirSync(OUT, { recursive: true });

async function clickChip(page, text) {
  const chip = page.locator('button.chip', { hasText: text }).first();
  await chip.waitFor({ state: 'visible', timeout: 8000 });
  await chip.click();
  await page.waitForTimeout(700);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });

  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.bubble.mentor', { timeout: 10000 });

  await page.screenshot({ path: `${OUT}/01-cold-start-intro.png`, fullPage: true });
  console.log('SHOT 01 intro');

  await clickChip(page, '同意，看我的日历');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/02-calendar-observation.png`, fullPage: true });
  console.log('SHOT 02 observation');

  const obsChip = page.locator('button.chip', { hasText: '不是我想要的' });
  if ((await obsChip.count()) > 0) {
    await obsChip.first().click();
    await page.waitForTimeout(600);
  }

  await clickChip(page, '孩子和家人');
  await clickChip(page, '上周陪孩子散步的一小时');
  await clickChip(page, '给家人');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/03-roles-draft.png`, fullPage: true });
  console.log('SHOT 03 roles');

  const confirm = page.locator('button.chip', { hasText: '确认角色草稿' });
  if ((await confirm.count()) > 0) {
    await confirm.first().click();
    await page.waitForTimeout(400);
  }

  await page.screenshot({ path: `${OUT}/04-daily-ready.png`, fullPage: true });
  console.log('SHOT 04 daily');

  await page.getByRole('button', { name: '角色仪表盘' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/05-dashboard.png`, fullPage: true });
  console.log('SHOT 05 dashboard');

  await page.getByRole('button', { name: '对话' }).click();
  await page.waitForTimeout(300);
  const weekly = page.locator('button.chip', { hasText: '开始周回顾' });
  if ((await weekly.count()) > 0) {
    await weekly.first().click();
    await page.waitForTimeout(800);
  } else {
    await page.locator('textarea').fill('开始周回顾');
    await page.getByRole('button', { name: '发送' }).click();
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: `${OUT}/06-weekly-review.png`, fullPage: true });
  console.log('SHOT 06 weekly');

  await page.getByRole('button', { name: '设置' }).click();
  await page.waitForTimeout(400);

  const patInput = page.locator('#qoder-pat');
  await patInput.waitFor({ state: 'visible', timeout: 8000 });
  await patInput.fill('verify-ui-pat-token');
  await page.getByRole('button', { name: '保存并检测' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/06b-settings-pat.png`, fullPage: true });
  console.log('SHOT 06b settings PAT');

  const settingsText = await page.locator('.settings-body').innerText();
  const hasPatField = (await patInput.count()) > 0;
  const hasPatLabel = settingsText.includes('Qoder Personal Access Token');
  const hasAgentStatus = /Qoder 可用|未配置认证|Agent 服务未启动|accessToken/.test(
    settingsText,
  );
  console.log('UI_CHECK has_pat_field=' + hasPatField);
  console.log('UI_CHECK has_pat_label=' + hasPatLabel);
  console.log('UI_CHECK agent_status_mentions_qoder=' + hasAgentStatus);

  await page.getByRole('button', { name: '演示：大石头被吞掉' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '对话' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/07-intervention-p0.png`, fullPage: true });
  console.log('SHOT 07 intervention');

  const mentorTexts = await page.locator('.bubble.mentor .bubble-body').allTextContents();
  console.log('MENTOR_MSG_COUNT', mentorTexts.length);
  console.log('LAST_MENTOR', (mentorTexts.at(-1) || '').slice(0, 120));

  const bodyText = await page.locator('body').innerText();
  const hasBrand = bodyText.includes('7习惯导师');
  const hasCalendarInsight = mentorTexts.some((t) => t.includes('会') && t.includes('分布'));
  const hasRoles = /工程师|父亲|健康/.test(bodyText);
  console.log('UI_CHECK has_brand=' + hasBrand);
  console.log('UI_CHECK has_calendar_insight=' + hasCalendarInsight);
  console.log('UI_CHECK has_roles=' + hasRoles);

  const failed = [
    !hasPatField,
    !hasPatLabel,
    !hasAgentStatus,
    !hasBrand,
    !hasCalendarInsight,
    !hasRoles,
  ].some(Boolean);

  await browser.close();
  if (failed) {
    console.error('UI verification assertions failed');
    process.exit(1);
  }
  console.log('UI verification done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
