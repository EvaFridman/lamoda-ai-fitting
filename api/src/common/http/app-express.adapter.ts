import { ExpressAdapter } from '@nestjs/platform-express';

// Nest's Express adapter turns body-parser's JSON syntax error into a plain BadRequestException
// that keeps only the message, so broken JSON could not be told from any other 400. This one hands
// body-parser's errors (they carry a `type`, e.g. `entity.parse.failed`) to AppExceptionFilter as
// they are. Pass it to NestFactory.create and to createNestApplication in e2e tests.
export class AppExpressAdapter extends ExpressAdapter {
  override mapException(error: unknown): unknown {
    return isBodyParserError(error) ? error : super.mapException(error);
  }
}

function isBodyParserError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'type' in error &&
    typeof error.type === 'string' &&
    'status' in error &&
    typeof error.status === 'number'
  );
}
