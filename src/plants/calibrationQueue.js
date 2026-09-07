// A renderer owns one cooperative queue. Species used to advance all of their
// readback generators in the same frame, multiplying a startup hitch by the
// number of populations. One generator step cannot be preempted; the budget
// bounds how many further steps can start after it.
export function createCalibrationQueue({ now = () => performance.now(), budgetMs = 3, maxSteps = 2 } = {}) {
  const jobs = [];
  const owners = new Set();
  const stats = { pending: 0, completed: 0, steps: 0, lastMs: 0, maxMs: 0, maxStepsPerFrame: 0 };
  function cancel(job) {
    const index = jobs.indexOf(job);
    if (index < 0) return;
    jobs.splice(index, 1);
    stats.pending = jobs.length;
    job.iterator.return?.();
  }
  return {
    stats,
    attach(owner) { owners.add(owner); return () => owners.delete(owner); },
    isDriver(owner) { return owners.values().next().value === owner; },
    enqueue(iterator, onDone) {
      const job = { iterator, onDone };
      jobs.push(job); stats.pending = jobs.length;
      return () => cancel(job);
    },
    advance() {
      if (!jobs.length) return false;
      const start = now(); let count = 0;
      do {
        const job = jobs.shift();
        let step;
        try { step = job.iterator.next(); }
        catch (error) { job.iterator.return?.(); stats.pending = jobs.length; throw error; }
        count++; stats.steps++;
        if (step.done) { stats.completed++; job.onDone(step.value); }
        else jobs.push(job);
      } while (jobs.length && count < maxSteps && now() - start < budgetMs);
      stats.pending = jobs.length; stats.lastMs = now() - start;
      stats.maxMs = Math.max(stats.maxMs, stats.lastMs);
      stats.maxStepsPerFrame = Math.max(stats.maxStepsPerFrame, count);
      return true;
    },
  };
}
