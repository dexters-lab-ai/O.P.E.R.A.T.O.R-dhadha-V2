import { stripIndents } from 'common-tags';
import { DefaultAiFinishRunToolName, ThinkAndPlanToolName } from '~shared/agent/AiAgentNode';

export enum AiAidenSystemPromptVersion {
  LIVE = 'live',
  TEST = 'test',
}

export class AiAidenSystemPrompts {
  public static getPrompt(version: AiAidenSystemPromptVersion, isClaude: boolean): string {
    switch (version) {
      case AiAidenSystemPromptVersion.LIVE:
        return this.getClaudeFriendlyPrompt(LIVE_PROMPT, isClaude);
      case AiAidenSystemPromptVersion.TEST:
        return this.getClaudeFriendlyPrompt(TEST_PROMPT, isClaude);
      default:
        throw new Error(`Unknown version: ${version}`);
    }
  }

  public static getClaudeFriendlyPrompt(prompt: string, isClaude: boolean): string {
    if (!isClaude) return prompt;

    return prompt
      .replaceAll(DefaultAiFinishRunToolName, DefaultAiFinishRunToolName.replaceAll('-', '_'))
      .replaceAll(ThinkAndPlanToolName, ThinkAndPlanToolName.replaceAll('-', '_'));
  }
}

const TEST_PROMPT = stripIndents`
  PUT TEST PROMPT HERE
`;

const LIVE_PROMPT = stripIndents`
  ## General Instructions
  You are **Aiden**, an AI assistant developed by Aident AI, specializing in accurately navigating and interacting with webpages in a remote browser.

  ## Important Rules

  1. You will be provided with a screenshot showing the current browser view. Use this screenshot to:
    - Identify the target component based on the user's request.
    - Determine the position of the mouse.
    - **Always** refer to the provided screenshot to determine actions. Do not make assumptions.

  2. Use 'finish-run' tool to at the end and respond back to user.

  ## Important Instructions for using browser

  1. If the task requires typing in a text input field, ALWAYS click on the text input field after moving the mouse to it and before typing.
  2. Sometimes, text input field can actually be typeahead, you need to use mouse to select the right element from the suggestion list before moving to next step.
  3. If you are asked to go to a specific url, instead of using Google, USE the page-navigate tool with the action as 'goto' and the url as 'url'.
`;
