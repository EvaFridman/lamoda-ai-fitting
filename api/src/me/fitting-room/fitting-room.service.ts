import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AppException,
  type ErrorDetail,
  ValidationError,
} from '../../common/errors/app.exception.js';
import type { Env } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { OutfitSlot } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { COLOUR_VALUE } from '../../products/colour.js';
import { LIST_ITEM_INCLUDE, toListItem } from '../../products/product-mapper.js';
import { lockUser } from '../lock-user.js';
import type {
  FittingRoomChangeDto,
  FittingRoomDto,
  FittingRoomItemDto,
} from './dto/fitting-room.dto.js';
import type { PutFittingRoomItemDto } from './dto/put-fitting-room-item.dto.js';

const ITEM_INCLUDE = {
  product: {
    include: {
      ...LIST_ITEM_INCLUDE,
      category: { select: { id: true, name: true, slug: true, isActive: true, slot: true } },
    },
  },
  colour: { select: { attributeValue: { select: { value: true } } } },
} satisfies Prisma.FittingRoomItemInclude;

type ItemRow = Prisma.FittingRoomItemGetPayload<{ include: typeof ITEM_INCLUDE }>;

// The signed-in user's fitting room (spec 0019 plan §5, A12, A86). The writes lock the user's row
// (lockUser): a gone user is 401, which the controller turns into a sign-out, and two writes of one
// user run one after another.
@Injectable()
export class FittingRoomService {
  private readonly mediaBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.mediaBaseUrl = config.get('MEDIA_BASE_URL', { infer: true });
  }

  // A gone user's room is empty (spec 0013 N31: a read finds nothing).
  async get(userId: string): Promise<FittingRoomDto> {
    return this.read(this.prisma, userId);
  }

  // Puts the product into its slot, replacing what was there (AC13). Refused: an unknown product,
  // one of an inactive category or a colour not of the product (a value of its colour attribute,
  // A76, A91: a season or a material is none) (RELATED_NOT_FOUND), a category
  // without a slot (HAS_SLOT), another slot's product (MATCHES_SLOT).
  async put(
    userId: string,
    slot: OutfitSlot,
    dto: PutFittingRoomItemDto,
  ): Promise<FittingRoomChangeDto> {
    return this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      await this.checkItem(tx, slot, dto);
      const previous = await tx.fittingRoomItem.findUnique({
        where: { userId_slot: { userId, slot } },
        include: ITEM_INCLUDE,
      });
      const item = { productId: dto.productId, attributeValueId: dto.attributeValueId ?? null };
      await tx.fittingRoomItem.upsert({
        where: { userId_slot: { userId, slot } },
        create: { userId, slot, ...item },
        update: { ...item, createdAt: new Date() },
      });
      return {
        room: await this.read(tx, userId),
        // Nothing to bring back after a repeat, or for an item the room no longer shows (A86.7),
        // which was not seen; a colour change answers the previous colour (A86.1).
        replaced:
          previous !== null && shown(previous) && !sameItem(previous, item)
            ? this.toItem(previous)
            : null,
      };
    });
  }

  // An empty slot answers the same (A86.2).
  async remove(userId: string, slot: OutfitSlot): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      await tx.fittingRoomItem.deleteMany({ where: { userId, slot } });
    });
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      await tx.fittingRoomItem.deleteMany({ where: { userId } });
    });
  }

  private async checkItem(
    client: Prisma.TransactionClient,
    slot: OutfitSlot,
    dto: PutFittingRoomItemDto,
  ): Promise<void> {
    const product = await client.product.findUnique({
      where: { id: dto.productId },
      select: {
        category: { select: { isActive: true, slot: true } },
        attributeValues:
          dto.attributeValueId === undefined
            ? false
            : {
                where: { attributeValueId: dto.attributeValueId, attributeValue: COLOUR_VALUE },
                select: { attributeValueId: true },
              },
      },
    });
    // Products have no active flag of their own: one of an inactive category is inactive (A36).
    if (product === null || !product.category.isActive) {
      throw relatedNotFound([
        { field: 'productId', code: 'RELATED_NOT_FOUND', message: 'productId names no product' },
      ]);
    }
    if (dto.attributeValueId !== undefined && product.attributeValues.length === 0) {
      throw relatedNotFound([
        {
          field: 'attributeValueId',
          code: 'RELATED_NOT_FOUND',
          message: 'attributeValueId is not a colour of the product',
        },
      ]);
    }
    if (product.category.slot === null) {
      throw new ValidationError([
        { field: 'productId', code: 'HAS_SLOT', message: "productId's category takes no try-on" },
      ]);
    }
    if (product.category.slot !== slot) {
      throw new ValidationError([
        {
          field: 'productId',
          code: 'MATCHES_SLOT',
          message: `productId belongs to the slot ${product.category.slot}`,
        },
      ]);
    }
  }

  private async read(client: Prisma.TransactionClient, userId: string): Promise<FittingRoomDto> {
    const rows = await client.fittingRoomItem.findMany({
      where: { userId },
      include: ITEM_INCLUDE,
      // PostgreSQL sorts an enum in its declared order: top, bottom, outerwear, shoes, accessory.
      orderBy: { slot: 'asc' },
    });
    const items = rows.filter(shown).map((row) => this.toItem(row));
    return {
      items,
      count: items.length,
      sum: items.reduce((total, item) => total + item.product.finalPrice, 0),
    };
  }

  private toItem(row: ItemRow): FittingRoomItemDto {
    const { isActive: _isActive, slot: _slot, ...category } = row.product.category;
    return {
      slot: row.slot,
      product: toListItem({ ...row.product, category }, this.mediaBaseUrl),
      attributeValueId: row.attributeValueId,
      colour: row.colour?.attributeValue.value ?? null,
    };
  }
}

// A row stays when its category is made inactive or moved to another slot, but the room shows it
// no more, and the next PUT of the slot replaces it (A86.7).
function shown(row: ItemRow): boolean {
  return row.product.category.isActive && row.product.category.slot === row.slot;
}

function sameItem(
  row: ItemRow,
  item: { productId: string; attributeValueId: string | null },
): boolean {
  return row.productId === item.productId && row.attributeValueId === item.attributeValueId;
}

function relatedNotFound(details: ErrorDetail[]): AppException {
  return new AppException('RELATED_NOT_FOUND', 'A referenced record does not exist', details);
}
