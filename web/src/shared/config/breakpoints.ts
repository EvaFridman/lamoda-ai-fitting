// The phone layout of the account's screens (spec 0019 boards 4, 5 and 10): the width under which
// the grids turn into rows and the confirmations into sheets.
export const PHONE_QUERY = '(width < 600px)';

// The device kind by its primary pointer, not the width (spec 0023 Y13): a finger, so the camera
// button; a mouse (an iPad with a trackpad too), so the hover effects and the magnifier. A layout
// still follows the width.
export const COARSE_POINTER_QUERY = '(pointer: coarse)';
export const MOUSE_QUERY = '(hover: hover) and (pointer: fine)';

// The visitor asked for less motion: a scroll a script starts jumps instead of gliding (CSS has its
// own `@media`, and the tokens' durations are zero there).
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
