import { CoreMessage, CoreTool, DataStreamWriter, LanguageModel, ToolInvocation } from 'ai';
import { AgentRunResult } from '~shared/agent/AgentRunResult';
import { AiAgentNode, IAiAgentInspectionConfig } from '~shared/agent/AiAgentNode';
import { IBaseAgentNodeOptions } from '~shared/agent/IBaseAgentNodeOptions';
import { ALogger } from '~shared/logging/ALogger';
import { AiAgentSOP, AiAgentSOPRunState } from '~shared/sop/AiAgentSOP';

export interface IAiAgentSOPNodeOptions
  extends IBaseAgentNodeOptions<CoreMessage, LanguageModel, CoreTool, ToolInvocation> {
  dataStream?: DataStreamWriter;
  inspectionConfig?: IAiAgentInspectionConfig;
  sop: AiAgentSOP;
}

const RETRY_COUNT = 3;

export class AiAgentSOPNode extends AiAgentNode {
  // loop through sop steps
  public async genRunSOP(): Promise<AgentRunResult> {
    if (!this.sopRunState) throw new Error('SOP is not set, please set it using the withSOP method');
    let runResult: AgentRunResult | undefined = undefined;
    let retryCount = 0;

    while (this.sopRunState.currentStepIndex < this.sopRunState.sop.steps.length) {
      ALogger.info({ context: 'Running SOP step', stepIndex: this.sopRunState.currentStepIndex });
      const step = this.sopRunState.sop.steps[this.sopRunState.currentStepIndex];
      // sanity check
      if (this.sopRunState.currentStepIndex + 1 !== step.id)
        throw new Error(`Step ID mismatch: ${this.sopRunState.currentStepIndex + 1} !== ${step.id}`);

      // Send progress update
      if (this.dataStream) {
        const progressData = {
          type: 'sop-progress',
          currentStepIndex: this.sopRunState.currentStepIndex,
        };
        this.dataStream.writeData(progressData);
      }

      const message = [
        { role: 'user', content: step.action + '\n No more action after finishing the step' },
      ] as CoreMessage[];

      if (this.sopRunState.currentStepIndex > 0) this.resetBeforeSOPStep();
      runResult = await this.genRun(message);

      if (!runResult.success) {
        if (retryCount >= RETRY_COUNT) throw new Error(`Step ${step.id} failed after ${RETRY_COUNT} retries`);
        retryCount++;
      } else {
        this.sopRunState.currentStepIndex++;
        retryCount = 0;
      }
    }

    // Send final progress update
    if (this.dataStream && this.sopRunState.sop.steps.length > 0) {
      const progressData = {
        type: 'sop-progress',
        currentStepIndex: this.sopRunState.sop.steps.length,
      };
      this.dataStream.writeData(progressData);
    }

    return runResult!;
  }

  public resetBeforeSOPStep(): void {
    this.setState({
      runResult: undefined,
      stepCount: 0,
      stepEnvStateHistory: [],
      stepHistory: [],
    });
  }

  public sopRunState: AiAgentSOPRunState;

  constructor(options: IAiAgentSOPNodeOptions) {
    super(options);
    this.sopRunState = { sop: options.sop, currentStepIndex: 0 };
  }
}
