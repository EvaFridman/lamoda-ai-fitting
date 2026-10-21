import { Controller, Get, Post } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper.js';
import { Test } from '@nestjs/testing';
import { SubscribeMessage } from '@nestjs/websockets';
import { MESSAGE_MAPPING_METADATA } from '@nestjs/websockets/constants.js';
import { describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import {
  type Access,
  ACCESS_METADATA,
  Closed,
  Public,
  SignedIn,
} from '../src/common/auth/access.decorators.js';

type Handler = (...args: unknown[]) => unknown;

// Every HTTP route and socket handler of the app, as "Class.method", with the marker it ends up with.
function handlersOf(
  wrappers: InstanceWrapper[],
  reflector: Reflector,
): Map<string, Access | undefined> {
  const scanner = new MetadataScanner();
  const handlers = new Map<string, Access | undefined>();
  const owners = new Map<string, unknown>();
  for (const wrapper of wrappers) {
    const type = wrapper.metatype as (new (...args: never[]) => object) | null | undefined;
    if (typeof type !== 'function') {
      continue;
    }
    const prototype = type.prototype as Record<string, Handler>;
    for (const name of scanner.getAllMethodNames(prototype)) {
      const method = prototype[name];
      if (method === undefined) {
        continue;
      }
      const isRoute =
        Reflect.hasMetadata(PATH_METADATA, method) ||
        Reflect.hasMetadata(MESSAGE_MAPPING_METADATA, method);
      if (isRoute) {
        // Two classes of one name would share keys and hide each other's routes.
        const key = `${type.name}.${name}`;
        if (owners.has(key) && owners.get(key) !== type) {
          throw new Error(`Two classes named ${type.name}: rename one`);
        }
        owners.set(key, type);
        handlers.set(
          key,
          reflector.getAllAndOverride<Access | undefined, string>(ACCESS_METADATA, [method, type]),
        );
      }
    }
  }
  return handlers;
}

// Markers the guard would honour but the app does not allow: @Public() on a route of a
// @Closed() or @SignedIn() controller (Swagger would still show the class's 401 and, under @SignedIn(), its session lock on it), and
// @Closed() or @SignedIn() on a socket handler (AccessGuard reads the principal of an HTTP
// request; a socket's user is set on the socket by its own middleware, spec 0013 plan §7).
function mixedMarkersOf(wrappers: InstanceWrapper[]): string[] {
  const scanner = new MetadataScanner();
  const found: string[] = [];
  for (const wrapper of wrappers) {
    const type = wrapper.metatype as (new (...args: never[]) => object) | null | undefined;
    if (typeof type !== 'function') {
      continue;
    }
    const classAccess = Reflect.getMetadata(ACCESS_METADATA, type) as Access | undefined;
    const prototype = type.prototype as Record<string, Handler>;
    for (const name of scanner.getAllMethodNames(prototype)) {
      const method = prototype[name];
      if (method === undefined) {
        continue;
      }
      const access =
        (Reflect.getMetadata(ACCESS_METADATA, method) as Access | undefined) ?? classAccess;
      if (classAccess === 'closed' && access === 'public') {
        found.push(`${type.name}.${name}: @Public() under a @Closed() controller`);
      }
      if (classAccess === 'user' && access === 'public') {
        found.push(`${type.name}.${name}: @Public() under a @SignedIn() controller`);
      }
      if (Reflect.hasMetadata(MESSAGE_MAPPING_METADATA, method)) {
        if (access === 'closed') {
          found.push(`${type.name}.${name}: @Closed() on a socket handler`);
        }
        if (access === 'user') {
          found.push(`${type.name}.${name}: @SignedIn() on a socket handler`);
        }
      }
    }
  }
  return found;
}

// Every handler anyone may call (spec 0004 E1, 0006 plan §2), sorted.
const PUBLIC_HANDLERS = [
  'AttributeValuesController.get',
  'AttributeValuesController.list',
  'AttributesController.get',
  'AttributesController.list',
  'BrandsController.get',
  'BrandsController.list',
  'CategoriesController.get',
  'CategoriesController.getBySlug',
  'CategoriesController.list',
  'HealthController.live',
  'HealthController.ready',
  'ProductAttributeValuesController.get',
  'ProductAttributeValuesController.list',
  'ProductImagesController.get',
  'ProductImagesController.list',
  'ProductVariationsController.get',
  'ProductVariationsController.list',
  'ProductsController.facets',
  'ProductsController.get',
  'ProductsController.list',
  'RealtimeGateway.ping',
];

// Every handler no one may call, a signed-in user neither (spec 0013 N8), sorted.
const CLOSED_HANDLERS = [
  'AiGenerationsController.create',
  'AiGenerationsController.update',
  'AttributeValuesController.create',
  'AttributeValuesController.delete',
  'AttributeValuesController.update',
  'AttributesController.create',
  'AttributesController.delete',
  'AttributesController.update',
  'BrandsController.create',
  'BrandsController.delete',
  'BrandsController.update',
  'CategoriesController.create',
  'CategoriesController.delete',
  'CategoriesController.update',
  'ProductAttributeValuesController.create',
  'ProductAttributeValuesController.delete',
  'ProductImagesController.create',
  'ProductImagesController.delete',
  'ProductImagesController.update',
  'ProductVariationsController.create',
  'ProductVariationsController.delete',
  'ProductVariationsController.update',
  'ProductsController.create',
  'ProductsController.delete',
  'ProductsController.update',
  'UsersController.create',
  'UsersController.delete',
  'UsersController.get',
  'UsersController.list',
  'UsersController.update',
];

// Every handler that needs a signed-in user, sorted.
const SIGNED_IN_HANDLERS = [
  'AiGenerationsController.delete',
  'AiGenerationsController.get',
  'AiGenerationsController.list',
  'FittingSessionsController.create',
  'FittingSessionsController.delete',
  'FittingSessionsController.get',
  'FittingSessionsController.list',
  'FittingSessionsController.update',
  'MeController.delete',
  'MeController.get',
  'MeController.update',
];

// Access is closed by default (spec 0006 F3, AC1): a route with no marker answers 401 to
// everyone, so a forgotten marker breaks it. This test names it before a deploy.
describe('access markers', () => {
  it('every route of the app carries exactly one of @Public(), @SignedIn() and @Closed()', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();
    try {
      const discovery = moduleRef.get(DiscoveryService);
      const reflector = moduleRef.get(Reflector);
      const handlers = handlersOf(
        [...discovery.getControllers(), ...discovery.getProviders()],
        reflector,
      );

      // The walk found the app's routes, socket handlers included, so an empty list is no pass.
      expect(handlers.get('HealthController.live')).toBe('public');
      expect(handlers.get('RealtimeGateway.ping')).toBe('public');
      expect(handlers.get('UsersController.list')).toBe('closed');
      expect(handlers.get('CategoriesController.list')).toBe('public');
      expect(handlers.get('CategoriesController.create')).toBe('closed');
      expect(handlers.get('FittingSessionsController.list')).toBe('user');
      expect(handlers.get('MeController.get')).toBe('user');

      const unmarked = [...handlers].filter(([, access]) => access === undefined).map(([n]) => n);
      expect(unmarked).toEqual([]);

      // A new @Public() route is a decision, so it changes this list where a review sees it: a
      // stray @Public() on a users route would otherwise pass as "marked".
      const open = [...handlers].filter(([, access]) => access === 'public').map(([n]) => n);
      expect(open.sort()).toEqual(PUBLIC_HANDLERS);

      // Likewise a route opened to signed-in users, or closed on purpose.
      const named = (access: Access): string[] =>
        [...handlers]
          .filter(([, found]) => found === access)
          .map(([n]) => n)
          .sort();
      expect(named('user')).toEqual(SIGNED_IN_HANDLERS);
      expect(named('closed')).toEqual(CLOSED_HANDLERS);

      expect(mixedMarkersOf([...discovery.getControllers(), ...discovery.getProviders()])).toEqual(
        [],
      );
    } finally {
      await moduleRef.close();
    }
  });

  it('names @Public() under a @Closed() or @SignedIn() controller and either on a socket handler', () => {
    @Closed()
    @Controller('mixed')
    class MixedController {
      @Get()
      @Public()
      read(): string {
        return 'x';
      }

      @Post()
      write(): string {
        return 'x';
      }
    }

    @SignedIn()
    @Controller('mixed-user')
    class MixedUserController {
      @Get()
      @Public()
      read(): string {
        return 'x';
      }
    }

    class SecuredGateway {
      @SubscribeMessage('secret')
      @Closed()
      secret(): string {
        return 'x';
      }

      @SubscribeMessage('mine')
      @SignedIn()
      mine(): string {
        return 'x';
      }
    }

    const wrappers = [MixedController, MixedUserController, SecuredGateway].map(
      (metatype) => ({ metatype }) as unknown as InstanceWrapper,
    );

    expect(mixedMarkersOf(wrappers)).toEqual([
      'MixedController.read: @Public() under a @Closed() controller',
      'MixedUserController.read: @Public() under a @SignedIn() controller',
      'SecuredGateway.secret: @Closed() on a socket handler',
      'SecuredGateway.mine: @SignedIn() on a socket handler',
    ]);
  });

  it('names a route that carries neither marker', async () => {
    @Controller('forgotten')
    class ForgottenController {
      @Get()
      read(): string {
        return 'x';
      }

      @Post()
      @Closed()
      write(): string {
        return 'x';
      }
    }

    @Controller('open')
    class OpenController {
      @Get()
      @Public()
      read(): string {
        return 'x';
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [ForgottenController, OpenController],
    }).compile();
    try {
      const handlers = handlersOf(
        moduleRef.get(DiscoveryService).getControllers(),
        moduleRef.get(Reflector),
      );

      expect(handlers.get('OpenController.read')).toBe('public');
      expect(handlers.get('ForgottenController.write')).toBe('closed');
      expect([...handlers].filter(([, access]) => access === undefined).map(([n]) => n)).toEqual([
        'ForgottenController.read',
      ]);
    } finally {
      await moduleRef.close();
    }
  });
});
