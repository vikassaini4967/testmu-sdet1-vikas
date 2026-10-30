import type { BrowserContext } from '@playwright/test';

/**
 * Ad and analytics hosts the target page loads on every navigation (observed:
 * ~15 third-party hosts on /notes/app). None of them is part of the system
 * under test; all of them add latency and non-determinism outside our control.
 * Blocking them is standard hygiene for a public target — and it keeps the
 * console/network evidence handed to the AI triage about the app, not ads.
 */
const THIRD_PARTY_HOSTS = [
  'googlesyndication.com',
  'doubleclick.net',
  'adtrafficquality.google',
  'fundingchoicesmessages.google.com',
  'googletagmanager.com',
  'google-analytics.com',
  'analytics.google.com',
  'googleadservices.com',
];

export async function blockThirdParty(context: BrowserContext): Promise<void> {
  await context.route(
    (url) => THIRD_PARTY_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)),
    (route) => route.abort(),
  );
}

/** True for console noise that originates outside the app under test. */
export function isThirdPartyNoise(text: string): boolean {
  return THIRD_PARTY_HOSTS.some((host) => text.includes(host));
}
