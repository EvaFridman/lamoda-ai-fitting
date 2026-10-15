import { z } from 'zod';

// A swatch colour of an attribute value, `#RRGGBB` in either case (the api's COLOR_HEX).
export const colorHexSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
