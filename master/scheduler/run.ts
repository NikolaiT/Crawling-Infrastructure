#!/usr/bin/env node

import {Scheduler} from './daemon';

(async () => {
  const scheduler = new Scheduler();
  await scheduler.setup();
  await scheduler.start();
})();