type FlyHandler = (fromX: number, fromY: number) => void;
let _handler: FlyHandler | null = null;

export function setFlyAnimationHandler(fn: FlyHandler | null) {
  _handler = fn;
}

export function triggerFlyAnimation(fromX: number, fromY: number) {
  _handler?.(fromX, fromY);
}
