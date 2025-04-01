import { StreamData, streamText, convertToCoreMessages } from 'ai';
import { z } from 'zod';
import { DEFAULT_MAX_STEPS } from '~shared/agent/AiAgentNode';
import { AiAidenSystemPromptVersion } from '~shared/agent/AiAidenSystemPrompts';
import { StepRunHistoryType } from '~shared/agent/IBaseAgentNodeOptions';
import { AiAgentNodeBuilder } from '~shared/agent/builders/AiAgentNodeBuilder';
import { AiAgentSOPNodeBuilder } from '~shared/agent/builders/AiAgentSOPNodeBuilder';
import { ModelRouter } from '~shared/llm/ModelRouter';
import { ALogger } from '~shared/logging/ALogger';
import { AiAgentSOP, AiAgentSOPSchema } from '~shared/sop/AiAgentSOP';
import { AiAidenApi, AiAidenStreamDataSchema, AiAidenStreamStateInfoSchema } from '~src/app/api/ai/aiden/AiAidenApi';
import { AiAidenCore, AiAidenCoreConfig, AiAidenCoreInstance } from '~src/app/api/ai/aiden/AiAidenCore';
import { simpleRequestWrapper } from '~src/app/api/simpleRequestWrapper';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const runtime = 'nodejs';

const api = new AiAidenApi();

export const POST = simpleRequestWrapper<z.infer<typeof api.RequestSchema.schema>>(
  api.RequestSchema.schema,
  { assertUserLoggedIn: true, skipResponseParsing: true },
  async (request, context, _path, signal) => {
    const [user, userConfig] = await Promise.all([context.fetchUserOrThrow(), context.fetchUserConfig()]);

    const model = ModelRouter.getModelFromUserConfigOrThrow(userConfig);
    const systemPromptVersion =
      userConfig.customPrompt && userConfig.customPrompt.trim() !== ''
        ? userConfig.customPrompt
        : AiAidenSystemPromptVersion.LIVE;
    const useReAct = true;

    // Prepare core configs
    const remoteBrowserSessionId = context.getRemoteBrowserSessionId();
    const sendRuntimeMessage = context.sendRuntimeMessage;
    const connectedConfig = { remoteBrowserSessionId, sendRuntimeMessage };
    const coreConfig = {
      baseMaxSteps: request.maxSteps || DEFAULT_MAX_STEPS,
      isBenchmark: request.isBenchmark ?? false,
      isClaude: ModelRouter.isClaude(model),
      remoteBrowserConnected: await AiAidenCore.genTestRemoteBrowserConnection(connectedConfig),
      remoteBrowserSessionId,
      sendRuntimeMessage,
      systemPromptVersion,
      useReAct,
      userId: user.id,
    } as AiAidenCoreConfig;

    let sop: AiAgentSOP | undefined;
    if (request.sopId) {
      const { data: sopData } = await context
        .getSupabase()
        .from('prebuilt_sops')
        .select('*')
        .eq('id', request.sopId)
        .maybeSingle();
      if (sopData) sop = AiAgentSOPSchema.parse(sopData);
    }

    // Create a StreamData instance for custom data streaming
    const streamData = new StreamData();

    // Define a writeData function to append data to StreamData
    const writeData = async (data: any) => {
      streamData.append(data);
    };

    const maxStepMultiplier = coreConfig.isBenchmark && coreConfig.useReAct ? 2 : 1;
    const maxSteps = (request.maxSteps || DEFAULT_MAX_STEPS) * maxStepMultiplier;

    const core = new AiAidenCoreInstance();
    const fetchStepState = async () => {
      if (!remoteBrowserSessionId) return [];
      try {
        const stateMessages = await core.genStepStateMessages(coreConfig);
        const data = { type: 'state-info', annotation: core.lastStepAnnotation };
        await writeData(AiAidenStreamStateInfoSchema.parse(data));
        return stateMessages;
      } catch (error) {
        ALogger.error({ context: 'fetchStepState', error });
        return [];
      }
    };

    let result;
    if (sop) {
      const sopAgent = AiAgentSOPNodeBuilder.new()
        .withModel(model)
        .withSystemMessage(AiAidenCore.getSystemPrompts(coreConfig))
        .withChatHistory([...convertToCoreMessages(request.messages)])
        .withToolDict(AiAidenCore.getToolDict(coreConfig))
        .withEnvironmentStepStateMessages(fetchStepState)
        .withAbortSignal(signal)
        .withStepRunHistoryType(StepRunHistoryType.LAST_THREE_WITHOUT_ENV_STATE)
        .withMaxSteps(maxSteps)
        .withSOP(sop)
        .build();

      // Initial SOP progress
      const progressData = {
        type: 'sop-progress',
        currentStepIndex: 0,
      };
      await writeData(progressData);

      result = await sopAgent.genRun(undefined, writeData);
    } else {
      const agent = AiAgentNodeBuilder.new()
        .withModel(model)
        .withSystemMessage(AiAidenCore.getSystemPrompts(coreConfig))
        .withChatHistory([...convertToCoreMessages(request.messages)])
        .withToolDict(AiAidenCore.getToolDict(coreConfig))
        .withEnvironmentStepStateMessages(fetchStepState)
        .withAbortSignal(signal)
        .withStepRunHistoryType(StepRunHistoryType.LAST_THREE_WITHOUT_ENV_STATE)
        .withMaxSteps(maxSteps)
        .build();
      result = await agent.genRun(undefined, writeData);
    }

    ALogger.info({ context: '/api/llm/agent', result });
    if (!result.success) {
      const errorData = AiAidenStreamDataSchema.parse({ type: 'error', error: result.error || 'Unknown error' });
      await writeData(errorData);
      streamData.close();
      return new Response(JSON.stringify(errorData), { status: 500 });
    }

    // Stream the result using Vercel AI SDK
    const messages = convertToCoreMessages(request.messages);
    const stream = await streamText({
      model,
      messages,
      system: systemPromptVersion,
      maxSteps,
      abortSignal: signal,
      onFinish: () => {
        streamData.close();
      },
    });

    // Use toDataStreamResponse to handle streaming with custom data
    return stream.toDataStreamResponse({ data: streamData });
  },
);