/**
 * mcp-prompt — pure logic for the mcpgawk prompt.
 *
 * gawk.dev watches what the AI ecosystem is doing; mcpgawk sits in front of
 * the MCP servers an agent actually calls. They are different products and the
 * link between them has to be earned, not nagged, so the rules are:
 *
 *   1. One prompt at a time. While the digest prompt is eligible to show, this
 *      one stays down — two floating cards in the same corner is a pop-up ad,
 *      not a recommendation.
 *   2. Later than the digest prompt. The digest fires at 5s; this waits until
 *      the visitor has been on the page long enough to have read something.
 *   3. A refusal sticks, and so does an acceptance. Dismissing or opening the
 *      gateway both write a year-long cookie — someone who has already gone
 *      and looked should never be asked again.
 *   4. One prompt per visit. If the digest prompt showed at any point in this
 *      visit — even if the visitor has since dismissed it — this one waits for
 *      a later visit. Dismissing one card only to be handed the next is the
 *      pop-up ad again, one beat later.
 *   5. Desktop only. On a phone the card covers most of the reading pane; the
 *      gateway is linked from the top bar and the More tab instead.
 *
 * Every branch is unit-tested without React.
 */

export const MCP_DISMISSED_COOKIE = "gawk_mcp_dismissed";
export const MCP_OPENED_COOKIE = "gawk_mcp_opened";
export const MCP_PROMPT_DELAY_MS = 20000;
export const MCP_URL = "https://mcp.gawk.dev/";

export type McpPromptInputs = {
  /** Has this visitor dismissed the prompt on this device (from cookie)? */
  hasDismissed: boolean;
  /** Has this visitor already opened the gateway (from cookie)? */
  hasOpened: boolean;
  /** Is the digest prompt currently eligible to show? Only one at a time. */
  subscribePromptVisible: boolean;
  /** Was the digest prompt eligible at any earlier point in this visit? One per visit. */
  subscribePromptShownThisVisit: boolean;
  /** Viewport ≤767px. The card is desktop-only. */
  isMobile: boolean;
  /** Is the consent question resolved for this visitor? Same rule as the
   *  digest prompt: the banner gets first pass in covered jurisdictions. */
  consentResolved: boolean;
  /** Milliseconds since page mounted. */
  elapsedMs: number;
};

export function shouldShowMcpPrompt(input: McpPromptInputs): boolean {
  if (input.hasDismissed) return false;
  if (input.hasOpened) return false;
  if (input.subscribePromptVisible) return false;
  if (input.subscribePromptShownThisVisit) return false;
  if (input.isMobile) return false;
  if (!input.consentResolved) return false;
  if (input.elapsedMs < MCP_PROMPT_DELAY_MS) return false;
  return true;
}

export function readMcpCookies(cookieString: string): {
  hasDismissed: boolean;
  hasOpened: boolean;
} {
  const has = (name: string) =>
    new RegExp(`(?:^|;\\s*)${name}=1(?:;|$)`).test(cookieString);
  return {
    hasDismissed: has(MCP_DISMISSED_COOKIE),
    hasOpened: has(MCP_OPENED_COOKIE),
  };
}
