import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const appUrl = process.env.APP_URL || 'http://localhost:5173/';
const password = 'Test1234!';

async function waitForText(driver, text) {
  await driver.wait(async () => {
    const body = await driver.findElement(By.css('body')).getText();
    return body.includes(text);
  }, 15000, `Timed out waiting for: ${text}`);
}

async function setInputValue(driver, element, value) {
  await driver.executeScript(
    `const input = arguments[0];
     const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
     setter.call(input, arguments[1]);
     input.dispatchEvent(new Event('input', { bubbles: true }));`,
    element,
    value,
  );
}

async function signIn(driver, email, channel) {
  await driver.get(appUrl);
  await driver.wait(until.elementLocated(By.css('input[autocomplete="username"]')), 15000);

  const emailInput = await driver.findElement(By.css('input[autocomplete="username"]'));
  const passwordInput = await driver.findElement(By.css('input[type="password"]'));
  await setInputValue(driver, emailInput, email);
  await setInputValue(driver, passwordInput, password);

  const channelLabel = channel === 'atm' ? 'ATM' : 'Branch';
  await driver.findElement(By.xpath(`//label[contains(., '${channelLabel}')]`)).click();
  await driver.findElement(By.xpath("//button[text()='Sign in']")).click();
}

async function signOut(driver) {
  await driver.findElement(By.xpath("//button[text()='Log out']")).click();
  await driver.wait(until.elementLocated(By.xpath("//button[text()='Sign in']")), 15000);
}

const options = new chrome.Options();
if (process.env.HEADLESS !== '0') {
  options.addArguments('--headless=new');
}
options.addArguments('--window-size=1280,900');

console.log('Opening Chrome');
const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
console.log('Chrome is open');

try {
  await signIn(driver, 'synthetic.customer@example.com', 'branch');
  await waitForText(driver, 'Synthetic Customer · Customer · Branch');
  await waitForText(driver, 'Account 10000001');
  await waitForText(driver, 'Transfer funds');
  console.log('branch customer sees balance and transfer');
  await signOut(driver);

  await signIn(driver, 'synthetic.customer@example.com', 'atm');
  await waitForText(driver, 'Synthetic Customer · Customer · ATM');
  await waitForText(driver, 'ATM channel');
  const body = await driver.findElement(By.css('body')).getText();
  if (body.includes('Transfer funds')) {
    throw new Error('ATM should not show Transfer funds');
  }
  console.log('ATM hides transfer');
  await signOut(driver);

  console.log('selenium tests passed');
} finally {
  await driver.quit();
}
