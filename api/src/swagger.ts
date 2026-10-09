import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { ADMIN_SECURITY, ADMIN_TOKEN_HEADER } from './common/guards/admin.guard.js';

// API documentation at /docs. Off in production: there the api is reached only through nginx,
// and the public site has no reason to publish its internal API map.
export function setupSwagger(app: INestApplication, version: string): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('lamoda-ai-fitting api')
      .setVersion(version)
      // Routes under @AdminOnly() send the admin token (spec 0004 E1).
      .addApiKey({ type: 'apiKey', in: 'header', name: ADMIN_TOKEN_HEADER }, ADMIN_SECURITY)
      .build(),
  );
  SwaggerModule.setup('docs', app, document);
}
