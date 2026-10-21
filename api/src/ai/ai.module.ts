import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';

import { AI_PROVIDER, type AiProvider, createAiProvider } from './ai-provider.js';
import { AI_SETTINGS, type AiSettings, aiSettings } from './ai-settings.js';

// OpenAI behind one token (spec 0019 plan §3): the settings and the provider, real with a key and
// fake without one. Imported by AppModule (the photo and text checks inside requests) and
// WorkerModule (the generation and the result's moderation). Nothing is called at start, so a
// process starts with OpenAI unreachable.
@Module({
  providers: [
    { provide: AI_SETTINGS, inject: [ConfigService], useFactory: aiSettings },
    {
      provide: AI_PROVIDER,
      inject: [AI_SETTINGS, PinoLogger],
      useFactory: (settings: AiSettings, logger: PinoLogger): AiProvider => {
        logger.setContext('AiProvider');
        return createAiProvider(settings, logger);
      },
    },
  ],
  exports: [AI_SETTINGS, AI_PROVIDER],
})
export class AiModule {}
