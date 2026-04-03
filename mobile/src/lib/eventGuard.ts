/**
 * Event Guard Utility
 *
 * Prevents event objects from being passed into business logic functions.
 * This fixes the {"isTrusted":true} error that occurs when handlers
 * accidentally pass the event object instead of the intended payload.
 */

/**
 * Check if a value is a native event object
 */
export function isEventObject(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check for common event object properties
  const eventKeys = [
    'isTrusted',
    'nativeEvent',
    'preventDefault',
    'stopPropagation',
    'target',
    'currentTarget',
    'eventPhase',
    'bubbles',
    'cancelable',
    'timeStamp',
    '_targetInst',
  ];

  // If the object has isTrusted, it's definitely an event
  if ('isTrusted' in obj) {
    return true;
  }

  // If the object has nativeEvent, it's a React Native event
  if ('nativeEvent' in obj) {
    return true;
  }

  // If the object has preventDefault as a function, it's an event
  if (typeof obj.preventDefault === 'function') {
    return true;
  }

  // Check if it has multiple event-like properties
  const matchingKeys = eventKeys.filter(key => key in obj);
  if (matchingKeys.length >= 2) {
    return true;
  }

  return false;
}

/**
 * Normalize a payload, returning null if it's an event object
 */
export function normalizePayload<T>(payload: T | unknown): T | null {
  if (isEventObject(payload)) {
    if (__DEV__) {
      console.warn('[EventGuard] Received event object instead of payload. This is likely a handler bug.');
    }
    return null;
  }
  return payload as T;
}

/**
 * Create a safe handler that filters out event objects
 * Usage: onPress={safeHandler(() => playTrack(track))}
 */
export function safeHandler<T extends (...args: unknown[]) => unknown>(
  handler: T
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  return (...args: Parameters<T>) => {
    // If the first argument is an event, call handler with no args
    if (args.length > 0 && isEventObject(args[0])) {
      // Call without the event argument
      return handler() as ReturnType<T>;
    }
    return handler(...args) as ReturnType<T>;
  };
}

/**
 * Validate that a track-like object is actually a track, not an event
 */
export function isValidTrack(value: unknown): boolean {
  if (isEventObject(value)) {
    return false;
  }

  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // A track must have at least an id and title
  return typeof obj.id === 'string' && typeof obj.title === 'string';
}

/**
 * Validate that a string ID is actually a string, not an event
 */
export function isValidId(value: unknown): value is string {
  if (isEventObject(value)) {
    return false;
  }

  return typeof value === 'string' && value.length > 0;
}
