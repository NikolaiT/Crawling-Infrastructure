"use strict";

require('dotenv').config({ path: 'env/deploy.env' })

const { execSync } = require('child_process');

function systemSync(cmd) {
    try {
        console.log(cmd);
        return execSync(cmd).toString();
    } catch (error) {
        console.error(error.status);  // Might be 127 in your example.
        console.error(error.message); // Holds the message you typically want.
        if (error.stderr) console.error(error.stderr.toString());  // Holds the stderr output. Use `.toString()`.
        if (error.stdout) console.error(error.stdout.toString());  // Holds the stdout output. Use `.toString()`.
    }
}

function deploy_crawl_worker() {
    console.log(systemSync(`npm run build`));

    let regions = [
        'us-west-1',
        'us-west-2',
        'us-east-2',
        'us-east-1',
        'eu-central-1',
        'eu-west-1',
        'eu-west-2',
        'eu-west-3',
        'ap-northeast-1',
        'ap-northeast-2',
        'ap-south-1',
        'ap-southeast-1',
        'ap-southeast-2',
    ];

    for (let region of regions) {
        console.log(systemSync(`sls deploy --region ${region} --aws-profile ${process.env.AWS_PROFILE} --verbose`));
    }
}

(() => {
    var args = process.argv.slice(2);

    if (args.length > 0) {
        let who = args[0];
        if (who === 'worker') {
            deploy_crawl_worker();
        }
    }
})();
