// Test that the crawler works on the remote serverless environment

var AWS = require('aws-sdk');
var fs = require('fs');
var path = require('path');
require('dotenv').config({ path: '../env/deploy.env' })

let aws_config = {
  "AWS_ACCESS_KEY": process.env.AWS_ACCESS_KEY,
  "AWS_SECRET_KEY": process.env.AWS_SECRET_KEY,
  "AWS_REGION": process.env.AWS_REGION,
  "AWS_BUCKET": process.env.AWS_BUCKET
};

function getFunc(scraper_type) {
  let base_path = '/home/nikolai/projects/work/cloudcrawler_functions/';
  return fs.readFileSync(path.join(base_path, scraper_type)).toString();
}

const main = async () => {
  // You shouldn't hard-code your keys in production!
  // http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html
  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
    region: 'us-west-1',
  });

  const params = {
    FunctionName: 'crawler-dev-browser-crawler',
    Payload: JSON.stringify({
      aws_config: aws_config,
      items: ['https://ipinfo.io/json'],
      function_code: getFunc('browser.js'),
      result_policy: 'return',
      execution_env: 'lambda',
      local_test: false,
      version: 'complex',
    }),
  };

  const result = await (new AWS.Lambda().invoke(params).promise());
  var jsonPretty = JSON.stringify(JSON.parse(result.Payload),null,2);
  console.log(jsonPretty);
};

main().catch(error => console.error(error));
