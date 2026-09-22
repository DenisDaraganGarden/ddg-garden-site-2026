// A renderer owns one cooperative queue. Species used to advance all of their
// readback generators in the same frame, multiplying a startup hitch by the
// number of populations. One generator step cannot be preempted; the budget
// bounds how many further steps can start after it.
export function createCalibrationQueue({ now = () => performance.now(), budgetMs = 3, maxSteps = 2 } = {}) {
  const jobs = [];
  const owners = new Set();
  const stats = { pending: 0, completed: 0, steps: 0, lastMs: 0, maxMs: 0, maxStepsPerFrame: 0 };
  function cancel(job) {
    if (job.cancelled) return;
    job.cancelled = true;
    const index = jobs.indexOf(job);
    if (index >= 0) jobs.splice(index, 1);
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
      // One pass in queue order: jobs that step go to the back, the rest keep
      // their place. A job that yields a promise (a fenced GPU readback) is
      // parked until it settles and resumes with the value.
      const round = jobs.splice(0), kept = [], stepped = [];
      for (let i = 0; i < round.length; i++) {
        const job = round[i];
        if (job.cancelled) continue;
        if (job.waiting || count >= maxSteps || now() - start >= budgetMs) { kept.push(job); continue; }
        let step;
        try { step = job.iterator.next(job.resume); }
        catch (error) { job.iterator.return?.(); jobs.push(...kept, ...stepped, ...round.slice(i + 1)); stats.pending = jobs.length; throw error; }
        job.resume = undefined;
        count++; stats.steps++;
        if (step.done) { stats.completed++; job.onDone(step.value); continue; }
        if (typeof step.value?.then === 'function') {
          job.waiting = true;
          step.value.then((value) => { job.resume = value; }, () => { job.resume = null; }).then(() => { job.waiting = false; });
        }
        stepped.push(job);
      }
      jobs.push(...kept, ...stepped);
      stats.pending = jobs.length; stats.lastMs = now() - start;
      stats.maxMs = Math.max(stats.maxMs, stats.lastMs);
      stats.maxStepsPerFrame = Math.max(stats.maxStepsPerFrame, count);
      return true;
    },
  };
}
