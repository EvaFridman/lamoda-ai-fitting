import { Controller, Get, Post, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryModule, DiscoveryService, MetadataScanner } from '@nestjs/core';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper.js';
import { Test } from '@nestjs/testing';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import {
  THROTTLER_BLOCK_DURATION,
  THROTTLER_KEY_GENERATOR,
  THROTTLER_LIMIT,
  THROTTLER_SKIP,
  THROTTLER_TRACKER,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants.js';
import { MESSAGE_MAPPING_METADATA } from '@nestjs/websockets/constants.js';
import { describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { Public } from '../src/common/auth/access.decorators.js';
import { BrandsController } from '../src/brands/brands.controller.js';
import { HealthController } from '../src/health/health.controller.js';
import { RealtimeGateway } from '../src/realtime/realtime.gateway.js';
import {
  Expensive,
  throttlerName,
  type Tier,
  TIERS,
  WINDOWS,
} from '../src/throttling/tiered-throttler.guard.js';

type Handler = (...args: unknown[]) => unknown;
type Type = new (...args: never[]) => object;

const SIX = new Set(
  TIERS.flatMap((tier) =>
    (Object.keys(WINDOWS) as (keyof typeof WINDOWS)[]).map((window) => throttlerName(tier, window)),
  ),
);

// Classes that may carry @SkipThrottle(): it makes a route unlimited, which on a closed or signed-in route would
// silently remove "limit before access" (spec 0006 F5). A new entry is added on purpose, after
// checking that the route is safe without a limit.
// Compared by identity, so a class that only shares a name gets no exemption.
const SKIPPED = new Set<Type>([HealthController, RealtimeGateway]);

// The key @Expensive() writes its metadata under (not exported by the guard); a probe below keeps
// it honest.
const EXPENSIVE_METADATA = 'throttling:expensive';

// Settings @Throttle() writes, keyed by throttler name; @SkipThrottle() writes the skip key.
const SETTING_PREFIXES = [
  THROTTLER_LIMIT,
  THROTTLER_TTL,
  THROTTLER_BLOCK_DURATION,
  THROTTLER_TRACKER,
  THROTTLER_KEY_GENERATOR,
];

// The guard's tierOf: @Expensive() on the handler, then the class; else GET and HEAD read, the rest
// write. A handler with no HTTP method (a socket message) has no tier.
function tierOfRoute(type: Type, handler: Handler): Tier | undefined {
  const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
  if (method === undefined) return undefined;
  const expensive =
    (Reflect.getMetadata(EXPENSIVE_METADATA, handler) as boolean | undefined) ??
    (Reflect.getMetadata(EXPENSIVE_METADATA, type) as boolean | undefined);
  if (expensive === true) return 'expensive';
  return method === RequestMethod.GET || method === RequestMethod.HEAD ? 'read' : 'write';
}

interface Route {
  type: Type;
  name: string;
  handler: Handler;
  // undefined for a socket message
  tier: Tier | undefined;
}

function typesOf(wrappers: InstanceWrapper[]): Type[] {
  return wrappers
    .map((wrapper) => wrapper.metatype as Type | null | undefined)
    .filter((type): type is Type => typeof type === 'function');
}

function routesOf(type: Type): Route[] {
  const scanner = new MetadataScanner();
  const prototype = type.prototype as Record<string, Handler>;
  const routes: Route[] = [];
  for (const name of scanner.getAllMethodNames(prototype)) {
    const handler = prototype[name];
    if (handler === undefined) continue;
    const isRoute =
      Reflect.hasMetadata(PATH_METADATA, handler) ||
      Reflect.hasMetadata(MESSAGE_MAPPING_METADATA, handler);
    if (isRoute) routes.push({ type, name, handler, tier: tierOfRoute(type, handler) });
  }
  return routes;
}

function collectRoutes(wrappers: InstanceWrapper[]): Route[] {
  return typesOf(wrappers).flatMap(routesOf);
}

interface Subject {
  label: string;
  target: object;
  // Tiers of the routes the metadata applies to; empty when none of them is an HTTP route.
  tiers: Tier[];
  skipAllowed: boolean;
}

function problemsOf({ label, target, tiers, skipAllowed }: Subject): string[] {
  const problems: string[] = [];
  const checkTier = (name: string, what: string): void => {
    const tier = name.slice(0, name.indexOf('-')) as Tier;
    if (tiers.length > 0 && !tiers.includes(tier))
      problems.push(
        `${label}: ${what} for "${name}" is tier ${tier}, the route is ${tiers.join('/')}`,
      );
  };
  for (const key of Reflect.getMetadataKeys(target) as unknown[]) {
    if (typeof key !== 'string') continue;
    const setting = SETTING_PREFIXES.find((prefix) => key.startsWith(prefix));
    if (setting !== undefined) {
      const name = key.slice(setting.length);
      if (!SIX.has(name)) problems.push(`${label}: @Throttle() for "${name}" (${setting})`);
      else checkTier(name, '@Throttle()');
    } else if (key.startsWith(THROTTLER_SKIP)) {
      if (Reflect.getMetadata(key, target) !== true) continue;
      const name = key.slice(THROTTLER_SKIP.length);
      // `default` is how @SkipThrottle() with no argument is written; the guard reads it as skip-all.
      if (name !== 'default' && !SIX.has(name))
        problems.push(`${label}: @SkipThrottle() for "${name}"`);
      else if (name !== 'default') checkTier(name, '@SkipThrottle()');
      if (!skipAllowed) problems.push(`${label}: @SkipThrottle() for "${name}" outside SKIPPED`);
    }
  }
  return problems;
}

// Throttler names the guard does not know (a `default` one, as Nest's docs show, or a typo) or of
// another tier than the route's match no throttler of the route and change nothing, silently; a
// skip outside SKIPPED removes the limit: this names them.
function throttleProblemsOf(wrappers: InstanceWrapper[]): string[] {
  const found: string[] = [];
  for (const type of typesOf(wrappers)) {
    const skipAllowed = SKIPPED.has(type);
    const routes = routesOf(type);
    const classTiers = new Set<Tier>();
    for (const { name, handler, tier } of routes) {
      if (tier !== undefined) classTiers.add(tier);
      found.push(
        ...problemsOf({
          label: `${type.name}.${name}`,
          target: handler,
          tiers: tier === undefined ? [] : [tier],
          skipAllowed,
        }),
      );
    }
    found.push(
      ...problemsOf({ label: type.name, target: type, tiers: [...classTiers], skipAllowed }),
    );
  }
  return found;
}

const wrap = (...types: Type[]): InstanceWrapper[] =>
  types.map((metatype) => ({ metatype }) as unknown as InstanceWrapper);

describe('throttle markers', () => {
  it('reads the expensive marker under the key the guard uses', () => {
    @Controller('probe')
    class Probe {
      @Post()
      @Expensive()
      write(): string {
        return 'x';
      }
    }

    expect(tierOfRoute(Probe, Probe.prototype.write as Handler)).toBe('expensive');
  });

  it('the real app: no unknown or other-tier throttler, no skip outside SKIPPED', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();
    try {
      const discovery = moduleRef.get(DiscoveryService);
      const wrappers = [...discovery.getControllers(), ...discovery.getProviders()];

      // The walk reaches the routes, so an empty result is not a pass: if discovery broke, these
      // would be missing and every tier check below would be vacuous.
      const routes = collectRoutes(wrappers);
      expect(
        routes.filter((r) => r.type === HealthController && r.tier === 'read').length,
      ).toBeGreaterThan(0);
      expect(routes).toContainEqual(
        expect.objectContaining({ type: RealtimeGateway, name: 'ping', tier: undefined }),
      );
      expect(
        routes.filter(
          (r) => r.type === BrandsController && r.name === 'create' && r.tier === 'write',
        ),
      ).toHaveLength(1);

      expect(throttleProblemsOf(wrappers)).toEqual([]);
    } finally {
      await moduleRef.close();
    }
  });

  it('names @Throttle() keyed default, on a route and on a controller', () => {
    @Controller('on-route')
    class OnRoute {
      @Get()
      @Public()
      @Throttle({ default: { limit: 1, ttl: 1000 } })
      read(): string {
        return 'x';
      }
    }

    @Controller('on-class')
    @Throttle({ default: { limit: 1, ttl: 1000, blockDuration: 5000 } })
    class OnClass {
      @Post()
      write(): string {
        return 'x';
      }
    }

    const found = throttleProblemsOf(wrap(OnRoute, OnClass));

    expect(found).toEqual(
      expect.arrayContaining([
        `OnRoute.read: @Throttle() for "default" (${THROTTLER_LIMIT})`,
        `OnRoute.read: @Throttle() for "default" (${THROTTLER_TTL})`,
        `OnClass: @Throttle() for "default" (${THROTTLER_BLOCK_DURATION})`,
      ]),
    );
  });

  it('names a throttler that is none of the six, in @Throttle() and @SkipThrottle()', () => {
    @Controller('typo')
    class Typo {
      @Get('a')
      @Throttle({ 'expensive-minut': { limit: 1, ttl: 1000 } })
      a(): string {
        return 'x';
      }

      @Get('b')
      @SkipThrottle({ short: true })
      b(): string {
        return 'x';
      }
    }

    const found = throttleProblemsOf(wrap(Typo));

    expect(found).toContain(`Typo.a: @Throttle() for "expensive-minut" (${THROTTLER_LIMIT})`);
    expect(found).toContain('Typo.b: @SkipThrottle() for "short"');
  });

  describe('tier match', () => {
    it('names a read throttler on a POST and a write throttler on an @Expensive() route', () => {
      @Controller('tiers')
      class Tiers {
        @Post('a')
        @Throttle({ 'read-burst': { limit: 1, ttl: 1000 } })
        a(): string {
          return 'x';
        }

        @Post('b')
        @Expensive()
        @Throttle({ 'write-minute': { limit: 1, ttl: 60_000 } })
        b(): string {
          return 'x';
        }
      }

      const found = throttleProblemsOf(wrap(Tiers));

      expect(found).toContain(
        `Tiers.a: @Throttle() for "read-burst" is tier read, the route is write`,
      );
      expect(found).toContain(
        `Tiers.b: @Throttle() for "write-minute" is tier write, the route is expensive`,
      );
    });

    it('names a throttler of another tier in @SkipThrottle() on a route', () => {
      @Controller('skip-tier')
      class SkipTier {
        @Get()
        @SkipThrottle({ 'write-burst': true })
        a(): string {
          return 'x';
        }
      }

      expect(throttleProblemsOf(wrap(SkipTier))).toContain(
        'SkipTier.a: @SkipThrottle() for "write-burst" is tier write, the route is read',
      );
    });

    it('takes @Expensive() on the controller for its routes', () => {
      @Controller('exp-class')
      @Expensive()
      class ExpClass {
        @Get()
        @Throttle({ 'read-burst': { limit: 1, ttl: 1000 } })
        a(): string {
          return 'x';
        }
      }

      expect(throttleProblemsOf(wrap(ExpClass))).toContain(
        'ExpClass.a: @Throttle() for "read-burst" is tier read, the route is expensive',
      );
    });

    it('checks a controller-level name against the tiers of its routes', () => {
      @Controller('class-level')
      @Throttle({ 'expensive-burst': { limit: 1, ttl: 1000 } })
      class ClassLevel {
        @Get()
        a(): string {
          return 'x';
        }

        @Post()
        b(): string {
          return 'x';
        }
      }

      @Controller('class-ok')
      @Throttle({ 'write-burst': { limit: 1, ttl: 1000 } })
      class ClassOk {
        @Get()
        a(): string {
          return 'x';
        }

        @Post()
        b(): string {
          return 'x';
        }
      }

      expect(throttleProblemsOf(wrap(ClassLevel))).toContain(
        'ClassLevel: @Throttle() for "expensive-burst" is tier expensive, the route is read/write',
      );
      expect(throttleProblemsOf(wrap(ClassOk))).toEqual([]);
    });

    it('lets expensive-minute on an @Expensive() POST and read-burst on a GET pass', () => {
      @Controller('matching')
      class Matching {
        @Post('a')
        @Expensive()
        @Throttle({ 'expensive-minute': { limit: 1, ttl: 60_000 } })
        a(): string {
          return 'x';
        }

        @Get('b')
        @Throttle({ 'read-burst': { limit: 1, ttl: 1000 } })
        b(): string {
          return 'x';
        }
      }

      expect(throttleProblemsOf(wrap(Matching))).toEqual([]);
    });
  });

  describe('skip allow-list', () => {
    it('names @SkipThrottle() on a class or a route outside SKIPPED', () => {
      @Controller('skipped-class')
      @SkipThrottle()
      class SkippedClass {
        @Get()
        a(): string {
          return 'x';
        }
      }

      @Controller('skipped-route')
      class SkippedRoute {
        @Post()
        @SkipThrottle()
        a(): string {
          return 'x';
        }

        @Get('b')
        @SkipThrottle({ 'read-burst': true })
        b(): string {
          return 'x';
        }
      }

      const found = throttleProblemsOf(wrap(SkippedClass, SkippedRoute));

      expect(found).toEqual(
        expect.arrayContaining([
          'SkippedClass: @SkipThrottle() for "default" outside SKIPPED',
          'SkippedRoute.a: @SkipThrottle() for "default" outside SKIPPED',
          'SkippedRoute.b: @SkipThrottle() for "read-burst" outside SKIPPED',
        ]),
      );
    });

    it('ignores a skip set to false', () => {
      @Controller('not-skipped')
      class NotSkipped {
        @Get()
        @SkipThrottle({ 'read-burst': false })
        a(): string {
          return 'x';
        }
      }

      expect(throttleProblemsOf(wrap(NotSkipped))).toEqual([]);
    });

    it('lets the classes in SKIPPED carry @SkipThrottle()', () => {
      expect(throttleProblemsOf(wrap(HealthController, RealtimeGateway))).toEqual([]);
    });

    it('names a class that only shares the name of one in SKIPPED', () => {
      @Controller('health-like')
      @SkipThrottle()
      class HealthController {
        @Get()
        a(): string {
          return 'x';
        }
      }

      expect(throttleProblemsOf(wrap(HealthController))).toContain(
        'HealthController: @SkipThrottle() for "default" outside SKIPPED',
      );
    });
  });
});
