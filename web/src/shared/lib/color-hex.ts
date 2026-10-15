import { z } from 'zod';

// A swatch colour of an attribute value, `#RRGGBB` in either case (the api's COLOR_HEX).
export const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;

export const colorHexSchema = z.string().regex(COLOR_HEX);
