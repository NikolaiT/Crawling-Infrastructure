const {gaussian} = require('../dist/misc/stats');

let samples = [];

for (let i = 0; i < 100; i++) {
  samples.push(gaussian(100, 15));
}

samples = samples.sort(function(a, b) {return a-b});

console.log(samples);