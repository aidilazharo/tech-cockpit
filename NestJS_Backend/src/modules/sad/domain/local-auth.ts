import type { SectionAnswers } from './answers.js';

/** Authentication methods by which the application does its own authentication (not AD based, Okta or ForgeRock). */
export const LOCAL_AUTHENTICATION = ['local-custom-authentication', 'other'];

/** Whether section 5's answers say the application does its own authentication (flagged, 2026-10-25). */
export function usesLocalAuthentication(security: SectionAnswers | undefined): boolean {
  const envelope = security?.['authentication-method'];
  return envelope !== undefined && 'value' in envelope && LOCAL_AUTHENTICATION.includes((envelope.value as { selected: string }).selected);
}
