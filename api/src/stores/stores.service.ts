import { Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { StoreResponseDto } from './dto/store-response.dto.js';

// The answer's columns only: the code, the position and the date stay in the database.
const STORE_SELECT = {
  id: true,
  name: true,
  type: true,
  city: true,
  street: true,
  house: true,
  mall: true,
  latitude: true,
  longitude: true,
  metroStations: true,
  workTime: true,
  description: true,
  phones: true,
} satisfies Prisma.StoreSelect;

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  // Every store in Lamoda's order (spec 0022 X7): web shows them all and searches them itself.
  list(): Promise<StoreResponseDto[]> {
    return this.prisma.store.findMany({ select: STORE_SELECT, orderBy: { position: 'asc' } });
  }
}
