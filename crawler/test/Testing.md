# Testing the worker

The worker is a crucial part of the crawling infrastructure. It runs millions of times and a single
error can destroy the state of a complete crawl task.

For that reason it must be tested.

Before testing, load env variables:

```bash
export $(grep -v '^#' env/testing.env | xargs -0);
```


## Integration tests

The worker will be running in the same docker container as in production.

In order to build the container:

```bash
source test/test.env
./build.sh
```

Run integration tests with:

```bash
mocha --timeout 300000 -r ts-node/register test/integration_tests.ts
```

Test versions:

```bash
mocha --timeout 3000000 -r ts-node/register -g 'complex version' test/integration_tests.ts
```

Run a single integration test with:

```bash
mocha --timeout 3000000 -r ts-node/register -g 'crawling cloudflare' test/detection_tests.ts
```

`-g {name}` specifies a regular expression that searches for the test descriptions to match.

Run a specific test suite:

```bash
mocha --timeout 3000000 -r ts-node/register test/detection_tests.ts -g 'fast block'
```

or

```bash
mocha --timeout 3000000 -r ts-node/register test/integration_tests.ts -g 'changes fingerprint hash'
```

or

```bash
mocha --timeout 3000000 -r ts-node/register test/screen.ts
```

```bash
mocha --timeout 3000000 -r ts-node/register test/fingerprint_tests.ts -g 'sannysoft'
```

```bash
mocha --timeout 3000000 -r ts-node/register test/integration_tests.ts -g 'can set headers'
```

### What to test?

Test with the help of all kinds of browser fingerprinting and browser technology testing sites?

1. Test that browser fingerprint changes at any Nth request
2. Test that chrome headless / chrome puppeteee
