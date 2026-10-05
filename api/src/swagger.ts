import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// API documentation at /docs. Off in production: there the api is reached only through nginx,
// and the public site has no reason to publish its internal API map.
export function setupSwagger(app: INestApplication, version: string): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('lamoda-ai-fitting api').setVersion(version).build(),
  );
  SwaggerModule.setup('docs', app, document);
}
