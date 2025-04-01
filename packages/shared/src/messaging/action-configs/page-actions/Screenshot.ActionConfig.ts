import { oneLine } from 'common-tags';
import { round } from 'lodash';
import { z } from 'zod';
import { BroadcastEventType } from '~shared/broadcast/types';
import { ActionConfigAutoAttachesToInteractable } from '~shared/decorators/ActionConfigAutoAttachesToInteractable';
import { getHost } from '~shared/env/environment';
import { ALogger } from '~shared/logging/ALogger';
import { Base_ActionConfig, enforceBaseActionConfigStatic } from '~shared/messaging/action-configs/Base.ActionConfig';
import { genResetMouseAtPageCenterArea } from '~shared/messaging/action-configs/control-actions/MouseReset.ActionConfig';
import { drawInteractableBoundingBoxes } from '~shared/messaging/action-configs/page-actions/boudingbox.js';
import { TargetNodeIdSchema } from '~shared/messaging/action-configs/page-actions/mixins';
import { ServiceWorkerMessageAction } from '~shared/messaging/service-worker/ServiceWorkerMessageAction';
import { RemoteCursorPosition } from '~shared/portal/RemoteBrowserTypes';
import { SupportedRemoteCursorTypes } from '~shared/remote-browser/RemoteCursor';
import { OmniParserBoundingBox, OmniParserService } from '~shared/services/OmniParserService';

import type { IActionConfigExecContext } from '~shared/messaging/action-configs/Base.ActionConfig';

export type BoundingBoxInfo = {
  labelCounter: number;
  identifier: string;
  x: number;
  y: number;
};

export class Screenshot_ActionConfig extends Base_ActionConfig {
  public static action = ServiceWorkerMessageAction.SCREENSHOT;

  public static description = `Take a screenshot on the page.`;

  public static requestPayloadSchema = z.object({
    config: z
      .object({
        targetNodeId: TargetNodeIdSchema.optional(),
        fullPage: z.boolean().optional().default(false).describe(oneLine`
          Whether to take a screenshot for the full page. Default to false.
        `),
        path: z.string().optional().describe(oneLine`
          The file path to save the screenshot to. The screenshot type will be inferred from the file extension. If path
          is a relative path, then it is resolved relative to current working directory. If no path is provided, the image
          won't be saved to the disk.
        `),
        withCursor: z.boolean().optional().default(false).describe(oneLine`
          Whether to overlay the cursor on the screenshot. Default to false.
        `),
      })
      .optional(),
    omniparserHost: z.string().optional().describe(oneLine`
      The host of the OmniParser service.
    `),
  });

  public static responsePayloadSchema = z.object({
    base64: z
      .string()
      .optional()
      .describe(oneLine`The base64 encoded screenshot.`),
    boundingBoxCoordinates: z
      .string()
      .optional()
      .describe(oneLine`The bounding box coordinates.`),
  });

  @ActionConfigAutoAttachesToInteractable
  public static async exec(
    payload: z.infer<typeof this.requestPayloadSchema>,
    context: IActionConfigExecContext,
  ): Promise<z.infer<typeof this.responsePayloadSchema>> {
    const its = context.getInteractableService();
    const page = its.getPageOrThrow();

    const { config, omniparserHost } = payload;
    const boundingBoxCoordinates: BoundingBoxInfo[] = [];
    const useOmniparser = !!omniparserHost;
    const useJsBoundingBoxes = !useOmniparser;
    ALogger.info({ context: 'screenshot bounding box generator', useOmniparser, useJsBoundingBoxes });

    if (useJsBoundingBoxes) {
      const bboxes = await page.evaluate(drawInteractableBoundingBoxes);
      boundingBoxCoordinates.push(...bboxes);
    }

    const cdp = its.getCdpSessionOrThrow();
    let { data: screenshot } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 100 });
    if (useOmniparser) {
      const parser = new OmniParserService(omniparserHost);
      const opResponse = await parser.genParseImage(screenshot);
      screenshot = opResponse.base64;

      const metadataRsp = await fetch(getHost() + '/api/utils/sharp-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64: screenshot }),
      });
      if (!metadataRsp.ok) throw new Error(`Failed to get image metadata: ${metadataRsp.statusText}`);
      const metadata = await metadataRsp.json();
      const { width, height } = metadata;
      if (!width || !height) throw new Error('Failed to get image dimensions');

      opResponse.boundingBoxes.forEach((box: Partial<OmniParserBoundingBox>, i: number) => {
        if (!box.bbox) throw new Error('Bounding box coordinates not found');

        const x = round(((box.bbox[0] + box.bbox[2]) / 2) * width, 2);
        const y = round(((box.bbox[1] + box.bbox[3]) / 2) * height, 2);
        const boxInfo = { labelCounter: i, identifier: box.content, x, y } as BoundingBoxInfo;

        boundingBoxCoordinates.push(boxInfo);
      });
      ALogger.info({
        context: 'received omniparser response',
        rsp: {
          base64Length: screenshot.length,
          numberOfBoxes: opResponse.boundingBoxes.length,
          latency: opResponse.latency,
          numberOfParsedBoundingBoxes: boundingBoxCoordinates.length,
        },
      });
    }

    // reset content injection
    if (useJsBoundingBoxes)
      await page.evaluate(() => {
        const boxes = document.querySelectorAll('.aident-bounding-box');
        boxes.forEach((box) => box.remove());
      });

    if (!config?.withCursor) return { base64: screenshot };

    const event = { type: BroadcastEventType.MOUSE_POSITION_UPDATED };
    let mousePosition = await context.getBroadcastService().fetch<RemoteCursorPosition>(event);
    if (!mousePosition)
      mousePosition = await genResetMouseAtPageCenterArea(
        context,
        context.getBroadcastService().send,
        context.getActiveTab().id,
      );
    const cursorType = SupportedRemoteCursorTypes.has(mousePosition.cursor) ? mousePosition.cursor : 'default';
    const overlayOffset = { x: round(mousePosition.x), y: round(mousePosition.y) };
    const response = await fetch(getHost() + '/api/utils/sharp', {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ backgroundBase64: screenshot, overlayOffset, cursorType }),
    });
    if (!response.ok) throw new Error(`Failed to overlay mouse cursor on screenshot: ${response.statusText}`);

    const json = await response.json();
    return { base64: json.base64, boundingBoxCoordinates: JSON.stringify(boundingBoxCoordinates) };
  }
}

enforceBaseActionConfigStatic(Screenshot_ActionConfig);
