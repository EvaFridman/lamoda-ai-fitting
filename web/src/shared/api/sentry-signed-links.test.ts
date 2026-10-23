// @vitest-environment node
import type { Breadcrumb } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';

import { beforeBreadcrumb, beforeSendTransaction } from '../../../sentry.options';

type TransactionEvent = Parameters<typeof beforeSendTransaction>[0];
type Span = NonNullable<TransactionEvent['spans']>[number];

const USER = '3f0c1b0e-8d52-4a57-9d6c-0c9f6d1d4a11';
const SIGNED =
  `http://localhost:8335/ai-fitting/keep/users/${USER}/photos/x.webp` +
  '?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=KEY%2F20261023%2Fus-east-1%2Fs3%2Faws4_request';

function span(fields: Partial<Span>): Span {
  return { span_id: 's', trace_id: 't', start_timestamp: 1, data: {}, ...fields } as Span;
}

function transaction(spans: Span[]): TransactionEvent {
  return { type: 'transaction', spans } as TransactionEvent;
}

function send(spans: Span[]): Span[] | undefined {
  const event = transaction(spans);
  const result = beforeSendTransaction(event, {});
  return (result as TransactionEvent).spans;
}

describe('beforeSendTransaction', () => {
  const keep = span({ description: 'GET http://api/products', op: 'http.client' });

  it('drops a resource.img span named after the signed link', () => {
    const image = span({ description: SIGNED, op: 'resource.img' });
    expect(send([keep, image])).toEqual([keep]);
  });

  it('drops a span whose url.full lacks the query but has keep/users in the path', () => {
    const image = span({
      description: 'img',
      op: 'resource.img',
      data: { 'url.full': `http://localhost:8335/ai-fitting/keep/users/${USER}/photos/x.webp` },
    });
    expect(send([image, keep])).toEqual([keep]);
  });

  it('drops a span whose data holds the signature in any string value', () => {
    const image = span({ description: 'img', data: { 'http.url': SIGNED, size: 12 } });
    expect(send([image, keep])).toEqual([keep]);
  });

  it('matches in any case', () => {
    const image = span({ description: 'http://s3/b/KEEP/USERS/x?x-amz-signature=1' });
    expect(send([image])).toEqual([]);
  });

  it('keeps spans of other images and requests, and non-string data', () => {
    const catalog = span({
      description: 'http://localhost:8335/ai-fitting/media/shirt.webp',
      op: 'resource.img',
      data: { 'url.full': '/media/shirt.webp', 'http.response_content_length': 1234 },
    });
    expect(send([catalog, keep])).toEqual([catalog, keep]);
  });

  it('returns the event itself, also when it has no spans', () => {
    const event = { type: 'transaction' } as TransactionEvent;
    expect(beforeSendTransaction(event, {})).toBe(event);
  });
});

describe('beforeSendTransaction, the root span', () => {
  function withTraceData(data: Record<string, unknown>): TransactionEvent {
    return {
      type: 'transaction',
      contexts: { trace: { trace_id: 't', span_id: 's', data } },
    } as unknown as TransactionEvent;
  }

  function traceData(event: TransactionEvent): Record<string, unknown> | undefined {
    return (beforeSendTransaction(event, {}) as TransactionEvent).contexts?.trace?.data;
  }

  it('removes lcp.url holding a signed link and keeps the other keys', () => {
    const event = withTraceData({ 'lcp.url': SIGNED, 'lcp.element': 'img', 'lcp.size': 10 });
    expect(traceData(event)).toEqual({ 'lcp.element': 'img', 'lcp.size': 10 });
  });

  it('removes lcp.url with keep/users in the path and no query', () => {
    const event = withTraceData({
      'lcp.url': `http://localhost:8335/ai-fitting/keep/users/${USER}/photos/x.webp`,
      'lcp.element': 'img',
    });
    expect(traceData(event)).toEqual({ 'lcp.element': 'img' });
  });

  it('keeps a catalog media lcp.url', () => {
    const data = { 'lcp.url': 'http://localhost:8335/ai-fitting/media/shirt.webp', 'lcp.id': 'a' };
    expect(traceData(withTraceData({ ...data }))).toEqual(data);
  });

  it('keeps the transaction itself', () => {
    const event = withTraceData({ 'lcp.url': SIGNED });
    expect(beforeSendTransaction(event, {})).toBe(event);
  });

  it('does not throw without contexts or trace data', () => {
    const bare = { type: 'transaction' } as TransactionEvent;
    const noData = {
      type: 'transaction',
      contexts: { trace: { trace_id: 't', span_id: 's' } },
    } as unknown as TransactionEvent;
    expect(beforeSendTransaction(bare, {})).toBe(bare);
    expect(beforeSendTransaction(noData, {})).toBe(noData);
  });
});

describe('beforeBreadcrumb', () => {
  it('drops a breadcrumb whose message holds the link', () => {
    expect(beforeBreadcrumb({ category: 'console', message: `failed ${SIGNED}` }, {})).toBeNull();
  });

  it('drops a breadcrumb whose data holds the link in any string value', () => {
    const breadcrumb: Breadcrumb = {
      category: 'fetch',
      data: { url: SIGNED, status_code: 200 },
    };
    expect(beforeBreadcrumb(breadcrumb, {})).toBeNull();
  });

  it('drops one with keep/users in the path and no query', () => {
    const breadcrumb: Breadcrumb = {
      category: 'navigation',
      data: { to: `/ai-fitting/keep/users/${USER}/photos/x.webp` },
    };
    expect(beforeBreadcrumb(breadcrumb, {})).toBeNull();
  });

  it('keeps other breadcrumbs as they are', () => {
    const plain: Breadcrumb = { category: 'ui.click', message: 'button.add', data: { n: 1 } };
    const noData: Breadcrumb = { category: 'console', message: 'hello' };
    expect(beforeBreadcrumb(plain, {})).toBe(plain);
    expect(beforeBreadcrumb(noData, {})).toBe(noData);
  });
});
