/**
 * Common stats functions.
 */

export function average(list: Array<number>): number {
  let N: number = list.length;
  let sum: number = 0;

  if (N === 0) {
    return 0;
  }

  for (let i = 0; i < N; i++) {
    sum += list[i];
  }

  return sum / N;
}

/**
 * Generates a random normal distributed value.
 *
 * Taken from: https://stackoverflow.com/questions/25582882/javascript-math-random-normal-distribution-gaussian-bell-curve
 *
 * @param mean the mean of the distribution
 * @param stddev the std deviation of the distribution
 */
// returns a gaussian random function with the given mean and stddev.
export function gaussian(mean: number, stddev: number) {
  let y2: number = 0;
  let use_last: boolean = false;
  let y1: number = 0;

  if (use_last) {
    y1 = y2;
    use_last = false;
  } else {
    let x1: number, x2: number, w: number = 0;
    do {
      x1 = 2.0 * Math.random() - 1.0;
      x2 = 2.0 * Math.random() - 1.0;
      w  = x1 * x1 + x2 * x2;
    } while( w >= 1.0);
    w = Math.sqrt((-2.0 * Math.log(w))/w);
    y1 = x1 * w;
    y2 = x2 * w;
    use_last = true;
  }

  let retval = mean + stddev * y1;
  if (retval > 0)
    return retval;
  return -retval;
}