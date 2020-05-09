import {WorkerContext} from './index';
import {ExecutionEnv} from '@lib/types/common';
import {getLogger} from '@lib/misc/logger';
import {Context} from "aws-lambda";
const got = require('got');

const logger = getLogger(null, 'notify');

export class TerminationNotification {
  /**
   * Determine whether we need to turn down the crawling.
   *
   * @return true if the crawling needs to be turned down, else false
   */
  public static async turnDown(local_test: boolean, exec_env: ExecutionEnv, context: Context | WorkerContext) {
    if (local_test === true) {
      return false;
    }

    if (exec_env === ExecutionEnv.lambda) {
      return await TerminationNotification.turnDownLambda(context);
    } else if (exec_env === ExecutionEnv.docker) {
      return await TerminationNotification.turnDownDocker();
    }
    return false;
  }

  /**
   * See if time is running away with AWS.
   *
   * @param context
   */
  private static async turnDownLambda(context: Context | WorkerContext) {
    if (context.getRemainingTimeInMillis) {
      let remaining = context.getRemainingTimeInMillis();
      if (remaining <= 45000) {
        logger.info(`Only ${remaining}ms left, turning down...`);
        return true;
      }
    }
    return false;
  }

  /**
   * See if time is running out with docker.
   *
   * When aws ec2 instances are allocated with `docker-machine` with the
   *
   * --amazonec2-request-spot-instance
   *
   * flag, spot instances will be allocated. Those can be terminated within a 2 minute termination
   * notice.
   *
   * We can poll the termination status via the url with internal IP: http://169.254.169.254/latest/meta-data/spot/instance-action
   *
   * https://docs.aws.amazon.com/de_de/AWSEC2/latest/UserGuide/spot-interruptions.html
   *
   * @param context
   */
  private static async turnDownDocker() {
    let is_terminating: boolean = false;
    const poll_url = 'http://169.254.169.254/latest/meta-data/spot/instance-action';
    try {
      let options = {
        retry: 0,
        json: true,
        timeout: 5000,
        responseType: 'json'
      };
      let response = await got(poll_url, options);
      let body = response.body;
      // if we get that, we have two minutes left.
      if (body.action === 'stop' || body.action === 'terminate') {
        console.log(body);
        is_terminating = true;
      }
    } catch (Error) {
      // all good when we get an 404
      if (Error.response && Error.response.statusCode !== 404) {
        logger.error(`Status = ${Error.response.statusCode} Error requesting spot instance endpoint: ${Error.toString()}`);
      }
    }
    return is_terminating;
  }
}