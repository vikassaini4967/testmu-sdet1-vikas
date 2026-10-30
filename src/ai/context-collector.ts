import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { aiConfig } from './config.js';
import type { LocatorProbe, NetworkEntry, SelectorCandidate } from './types.js';

/**
 * Pulls page state at the moment of failure.
 *
 * Deliberately NOT a full `page.content()` dump: on a real app that is 200KB+
 * of framework noise, which costs tokens and buries the signal. We strip
 * script/style/svg and cap length, then separately extract *interactive*
 * elements, which is what a selector-related failure actually needs.
 */

export function truncate(value: string | undefined, max: number): string | undefined {
  if (!value) return value;
  return value.length > max ? `${value.slice(0, max)}\n…[truncated ${value.length - max} chars]` : value;
}

export async function collectDom(page: Page): Promise<string | undefined> {
  try {
    const html = await page.evaluate(() => {
      const root = document.querySelector('#root') ?? document.body;
      const clone = root.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('script, style, svg, noscript, iframe, ins').forEach((n) => n.remove());
      return clone.innerHTML.replace(/\s{2,}/g, ' ');
    });
    return truncate(html, aiConfig.limits.domChars);
  } catch {
    return undefined;
  }
}

/**
 * Every interactive element currently on the page, with the attributes a
 * Playwright locator could key off. When a test fails on
 * `getByTestId('submit')`, this is what lets the model say
 * "the attribute is data-testid=login-submit, not submit".
 */
export async function collectSelectorCandidates(page: Page): Promise<SelectorCandidate[]> {
  try {
    return await page.evaluate(() => {
      const root = document.querySelector('#root') ?? document.body;
      const nodes = Array.from(
        root.querySelectorAll('a, button, input, select, textarea, h1, h2, [role], [data-testid], [id]'),
      ).slice(0, 80);

      return nodes.map((el) => {
        const attrs: Record<string, string> = {};
        for (const attr of Array.from(el.attributes)) {
          if (['id', 'name', 'type', 'role', 'placeholder', 'aria-label', 'data-testid', 'href'].includes(attr.name)) {
            attrs[attr.name] = attr.value.slice(0, 80);
          }
        }
        const tag = el.tagName.toLowerCase();
        const testid = el.getAttribute('data-testid');
        const id = el.getAttribute('id');
        return {
          selector: testid ? `[data-testid="${testid}"]` : id ? `#${id}` : tag,
          tag,
          text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60),
          attributes: attrs,
        };
      });
    });
  } catch {
    return [];
  }
}

/** Console listener you attach at the start of a test; returns the live buffer. */
export function attachConsoleCapture(page: Page): string[] {
  const logs: string[] = [];
  page.on('console', (msg) => {
    if (logs.length < aiConfig.limits.consoleLines && ['error', 'warning'].includes(msg.type())) {
      logs.push(`[${msg.type()}] ${msg.text().slice(0, 300)}`);
    }
  });
  page.on('pageerror', (err) => {
    if (logs.length < aiConfig.limits.consoleLines) logs.push(`[pageerror] ${err.message.slice(0, 300)}`);
  });
  return logs;
}

/** Network listener — only non-2xx and outright failures are worth tokens. */
export function attachNetworkCapture(page: Page): NetworkEntry[] {
  const entries: NetworkEntry[] = [];
  page.on('response', (res) => {
    if (res.status() >= 400 && entries.length < aiConfig.limits.networkEntries) {
      entries.push({ method: res.request().method(), url: res.url().slice(0, 200), status: res.status() });
    }
  });
  page.on('requestfailed', (req) => {
    const failure = req.failure()?.errorText;
    // Third-party hosts are aborted on purpose by blockThirdParty(); not evidence.
    if (failure === 'net::ERR_FAILED' && !req.url().includes('expandtesting.com')) return;
    if (entries.length < aiConfig.limits.networkEntries) {
      entries.push({ method: req.method(), url: req.url().slice(0, 200), status: null, failure });
    }
  });
  return entries;
}

/**
 * The spec source around the failing line, found from the error stack. Gives
 * the model the actual statement that failed, so a suggested fix can be a diff
 * against real code instead of a guess.
 */
export function collectSourceSnippet(stack: string | undefined, testFile: string): string | undefined {
  if (!stack) return undefined;
  const base = path.basename(testFile).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stack.match(new RegExp(`${base}:(\\d+):\\d+`));
  if (!match) return undefined;
  try {
    const line = Number(match[1]);
    const lines = fs.readFileSync(testFile, 'utf8').split('\n');
    const from = Math.max(0, line - 6);
    return lines
      .slice(from, Math.min(lines.length, line + 3))
      .map((text, i) => `${from + i + 1 === line ? '>' : ' '} ${String(from + i + 1).padStart(4)} | ${text}`)
      .join('\n');
  } catch {
    return undefined;
  }
}

export type LocatorStrategy = 'testid' | 'role' | 'text' | 'label' | 'placeholder' | 'css';

export interface ProbeInput {
  strategy: LocatorStrategy;
  value: string;
  name?: string;
}

function toLocator(page: Page, input: ProbeInput): { locator: Locator; expression: string } {
  const q = (s: string) => `'${s.replace(/'/g, "\\'")}'`;
  switch (input.strategy) {
    case 'testid':
      return { locator: page.getByTestId(input.value), expression: `page.getByTestId(${q(input.value)})` };
    case 'role': {
      const options = input.name ? { name: input.name } : undefined;
      return {
        locator: page.getByRole(input.value as Parameters<Page['getByRole']>[0], options),
        expression: `page.getByRole(${q(input.value)}${input.name ? `, { name: ${q(input.name)} }` : ''})`,
      };
    }
    case 'text':
      return { locator: page.getByText(input.value), expression: `page.getByText(${q(input.value)})` };
    case 'label':
      return { locator: page.getByLabel(input.value), expression: `page.getByLabel(${q(input.value)})` };
    case 'placeholder':
      return { locator: page.getByPlaceholder(input.value), expression: `page.getByPlaceholder(${q(input.value)})` };
    default:
      return { locator: page.locator(input.value), expression: `page.locator(${q(input.value)})` };
  }
}

/**
 * Runs a candidate locator against the LIVE page at failure time. This is what
 * turns the agent's locator suggestion from a guess into a checked claim: it
 * may only propose a locator it has seen resolve to exactly one visible node.
 */
export function createLocatorProbe(page: Page) {
  return async (input: ProbeInput): Promise<LocatorProbe> => {
    let expression = `${input.strategy}:${input.value}`;
    try {
      if (page.isClosed()) return { expression, count: 0, visible: false, error: 'page already closed' };
      const built = toLocator(page, input);
      expression = built.expression;
      const count = await built.locator.count();
      const first = built.locator.first();
      return {
        expression,
        count,
        visible: count > 0 ? await first.isVisible() : false,
        outerHtml: count > 0 ? (await first.evaluate((el) => el.outerHTML)).replace(/\s+/g, ' ').slice(0, 300) : undefined,
      };
    } catch (error) {
      return { expression, count: 0, visible: false, error: (error as Error).message.split('\n')[0].slice(0, 200) };
    }
  };
}

export type LocatorProbeFn = ReturnType<typeof createLocatorProbe>;
