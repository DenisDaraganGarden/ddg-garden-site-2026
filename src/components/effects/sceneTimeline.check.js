import assert from 'node:assert/strict';
import { createSceneTimeline } from './sceneTimeline.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);
const timeline = createSceneTimeline();

close(timeline.advance(.125), .125);
timeline.setActive(false);
close(timeline.advance(90), .125);
timeline.setActive(true);
// A browser may report the whole hidden interval or zero on this frame. Both
// must preserve the frozen phase; the following active frame resumes normally.
close(timeline.advance(90), .125);
close(timeline.advance(1 / 60), .125 + 1 / 60);
timeline.setActive(false);
timeline.setActive(true);
close(timeline.advance(0), .125 + 1 / 60);
close(timeline.advance(.25), .125 + 1 / 60 + .25);

console.log('sceneTimeline: visibility pause/resume is monotonic');
