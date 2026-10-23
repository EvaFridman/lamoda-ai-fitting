'use client';

import type { ReactElement, ReactNode, RefObject } from 'react';

import { Drawer, DrawerClose } from '../drawer/drawer';

export interface SheetProps {
  // The control that opens the sheet, as in Modal. Without it, the sheet is opened through `open`.
  trigger?: ReactElement;
  // The heading: the sheet's accessible name.
  title: string;
  // A line under the heading, read with the name by screen readers.
  description?: string;
  // A picture left of the heading and the line: the photo a confirmation is about.
  media?: ReactNode;
  // Buttons under the content, one under another the sheet's width (`fullWidth`): the action
  // first, then "Отмена" in SheetClose.
  footer?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  // As Modal's: the safe "Отмена" before a destructive action.
  initialFocus?: RefObject<HTMLElement | null>;
  children?: ReactNode;
}

// The phone's confirmation and action sheet (spec 0019 plan §7, board 10.2): the kit's bottom
// Drawer with a grip and no ×, so the page has one form of the bottom sheet (A64; spec 0020's
// filters sheet is the same Drawer). Esc, a click on the overlay, a swipe down or a footer button
// close it, and the focus returns to the trigger.
export function Sheet({ trigger, ...props }: SheetProps) {
  return <Drawer side="bottom" grip closable={false} trigger={trigger} {...props} />;
}

// Renders its child (a Button) as a control that closes the sheet it is in.
export const SheetClose = DrawerClose;
