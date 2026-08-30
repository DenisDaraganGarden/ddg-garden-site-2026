export const WATER_IMPULSE_QUEUE_LIMIT = 8;

const priorityOf = (event) => Number.isFinite(event?.priority) ? event.priority : 0;

const highestPriorityIndex = (queue) => {
  if (!Array.isArray(queue) || queue.length === 0) return -1;
  let bestIndex = 0;
  for (let index = 1; index < queue.length; index += 1) {
    if (priorityOf(queue[index]) > priorityOf(queue[bestIndex])) bestIndex = index;
  }
  return bestIndex;
};

export function enqueueWaterImpulse(queue, event, limit = WATER_IMPULSE_QUEUE_LIMIT) {
  if (!Array.isArray(queue) || !event || limit <= 0) return false;

  if (event.source === 'boat-wake') {
    const existingIndex = queue.findIndex((queued) => queued.source === 'boat-wake');
    if (existingIndex >= 0) {
      queue[existingIndex] = {
        ...queue[existingIndex],
        ...event,
        strength: Math.max(queue[existingIndex].strength ?? 0, event.strength ?? 0),
      };
      return true;
    }
  }

  if (queue.length >= limit) {
    let weakestIndex = 0;
    for (let index = 1; index < queue.length; index += 1) {
      if (priorityOf(queue[index]) < priorityOf(queue[weakestIndex])) weakestIndex = index;
    }
    if (priorityOf(event) < priorityOf(queue[weakestIndex])) return false;
    queue.splice(weakestIndex, 1);
  }

  queue.push(event);
  return true;
}

export function takeNextWaterImpulse(queue, directEvent = null) {
  const queuedIndex = highestPriorityIndex(queue);
  const queuedEvent = queuedIndex >= 0 ? queue[queuedIndex] : null;

  // Stable FIFO is preserved for equal queued priorities. The direct cursor slot
  // wins ties so a low-priority visual wake can never make input feel delayed.
  if (directEvent && (!queuedEvent || priorityOf(directEvent) >= priorityOf(queuedEvent))) {
    return { event: directEvent, usedDirect: true };
  }
  if (!queuedEvent) return { event: null, usedDirect: false };

  return {
    event: queue.splice(queuedIndex, 1)[0],
    usedDirect: false,
  };
}
