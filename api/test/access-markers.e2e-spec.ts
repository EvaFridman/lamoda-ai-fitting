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
  AdminOnly,
  Public,
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

// Markers the guard would honour but the app does not allow: @Public() on a route of an
// @AdminOnly() controller (Swagger would still show the class's admin lock on it), and
// @AdminOnly() on a socket handler (the principal is read from an HTTP request; sockets have no
// auth yet, spec 0006 non-goals).
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
      if (classAccess === 'admin' && access === 'public') {
        found.push(`${type.name}.${name}: @Public() under an @AdminOnly() controller`);
      }
      if (Reflect.hasMetadata(MESSAGE_MAPPING_METADATA, method) && access === 'admin') {
        found.push(`${type.name}.${name}: @AdminOnly() on a socket handler`);
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
  'CategoriesController.list',
  'HealthController.live',
  'HealthController.ready',
  'HelloController.get',
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

// Access is closed by default (spec 0006 F3, AC1): a route with neither @Public() nor @AdminOnly()
// answers 401 to everyone, so a forgotten marker breaks it. This test names it before a deploy.
describe('access markers', () => {
  it('every route of the app carries @Public() or @AdminOnly()', async () => {
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
      expect(handlers.get('UsersController.list')).toBe('admin');
      expect(handlers.get('CategoriesController.list')).toBe('public');
      expect(handlers.get('CategoriesController.create')).toBe('admin');

      const unmarked = [...handlers].filter(([, access]) => access === undefined).map(([n]) => n);
      expect(unmarked).toEqual([]);

      // A new @Public() route is a decision, so it changes this list where a review sees it: a
      // stray @Public() on a users route would otherwise pass as "marked".
      const open = [...handlers].filter(([, access]) => access === 'public').map(([n]) => n);
      expect(open.sort()).toEqual(PUBLIC_HANDLERS);

      expect(mixedMarkersOf([...discovery.getControllers(), ...discovery.getProviders()])).toEqual(
        [],
      );
    } finally {
      await moduleRef.close();
    }
  });

  it('names @Public() under an @AdminOnly() controller and @AdminOnly() on a socket handler', () => {
    @AdminOnly()
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

    class SecuredGateway {
      @SubscribeMessage('secret')
      @AdminOnly()
      secret(): string {
        return 'x';
      }
    }

    const wrappers = [MixedController, SecuredGateway].map(
      (metatype) => ({ metatype }) as unknown as InstanceWrapper,
    );

    expect(mixedMarkersOf(wrappers)).toEqual([
      'MixedController.read: @Public() under an @AdminOnly() controller',
      'SecuredGateway.secret: @AdminOnly() on a socket handler',
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
      @AdminOnly()
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
      expect(handlers.get('ForgottenController.write')).toBe('admin');
      expect([...handlers].filter(([, access]) => access === undefined).map(([n]) => n)).toEqual([
        'ForgottenController.read',
      ]);
    } finally {
      await moduleRef.close();
    }
  });
});
