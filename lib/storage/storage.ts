import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import AWS from 'aws-sdk'
import {Logger, getLogger} from '../misc/logger';
import {system} from "../misc/shell";

export interface IAWSConfig {
  AWS_ACCESS_KEY: string;
  AWS_SECRET_KEY: string;
  AWS_REGION: string;
  AWS_BUCKET: string;
}

export class S3Controller {
  bucket: string;
  region: string;
  logger: Logger;
  protected aws_config: IAWSConfig;
  protected client: AWS.S3;

  constructor(aws_config: IAWSConfig) {
    this.logger = getLogger(null, 'storage');
    this.aws_config = aws_config;
    this.bucket = aws_config.AWS_BUCKET;
    this.region = aws_config.AWS_REGION;

    this.client = new AWS.S3({
      accessKeyId: this.aws_config.AWS_ACCESS_KEY,
      secretAccessKey: this.aws_config.AWS_SECRET_KEY,
      region: this.aws_config.AWS_REGION,
    });
  }

  /**
   *
   * https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property
   *
   * Amazon S3 never adds partial objects; if you receive a success response, Amazon S3 added the entire object to the bucket.
   *
   * @param request
   */
  private async put(request: AWS.S3.Types.PutObjectRequest): Promise<AWS.S3.Types.PutObjectOutput> {
    return new Promise((resolve, reject) => {
      this.client.putObject(request, (error, data) => {
        if (error) {
          return reject(error);
        }
        this.logger.verbose(`Uploaded ${request.Key} to bucket=${request.Bucket}`);
        return resolve(data);
      });
    });
  }

  /**
   * Uploads data to the cloud.
   *
   * https://docs.aws.amazon.com/macie/latest/userguide/macie-classify-objects-content-type.html
   *
   * @param key
   * @param value
   * @param compress
   *
   * @return: if the value was successfully uploaded, return the length of the blob uploaded
   */
  public async upload(key: string, value: string | Buffer, compress: boolean = false, content_type = 'application/json; charset=utf-8') {
    let buffer_length: number = value.length;

    const request: AWS.S3.Types.PutObjectRequest = {
      Bucket: this.bucket,
      Key: key,
      Body: value,
      ContentType: content_type,
    };

    if (value instanceof Buffer || typeof value === 'object') {
      request.ContentType = 'binary/octet-stream';
    }


    // @todo: consider brotli algorithm for compressing
    // @todo: check if lambda runtime supports brotli in zlib library
    if (compress) {
      let deflated = zlib.deflateSync(value);
      buffer_length = deflated.length;
      request.Body = deflated;
      request.ContentType = 'application/octet-stream';
      request.ContentEncoding = 'deflate';
    }

    await this.put(request);

    return buffer_length;
  }

  public async download(key: string): Promise<AWS.S3.Types.GetObjectOutput> {
    return new Promise((resolve, reject) => {
      const request: AWS.S3.Types.GetObjectRequest = {
        Bucket: this.bucket,
        Key: key,
      };

      this.client.getObject(
        request, function (error, data) {
          if (error !== null) {
            reject('Failed to retrieve an object: ' + error);
          } else {
            resolve(data);
          }
        }
      );
    });
  }

  /**
   * Download a file key to destination dst.
   *
   * @param key
   * @param dst
   * @return the path to the stored file
   */
  public async storeFile(key: string, dst: string = '/tmp'): Promise<string> {
    if (!fs.existsSync(dst)) {
      this.logger.warn(`destination dir ${dst} does not exist. Attempting to create it.`);
      fs.mkdirSync(dst, { recursive: true });
    }

    let file_name = path.basename(key);

    let local_path = path.join(dst, file_name);

    if (fs.existsSync(local_path)) {
      this.logger.error(`destination file ${local_path} already exists.`);
      return local_path;
    }

    this.logger.verbose(`Saving and downloading ${key} to ${dst}`);

    let response = await this.download(key);

    this.logger.info(`File ${key} created on ${response.LastModified} with metadata: ${JSON.stringify(response.Metadata)}`);

    fs.writeFileSync(local_path, response.Body);

    return local_path;
  }

  /**
   * Download a complete s3 directory to a location on disk.
   *
   * @param key path to the directory in question
   * @param dst where to store the results locally
   * @param concurrency how many getObject requests in parallel
   * @param max_files stop after downloading max_files
   */
  public async storeDir(key: string, dst: string, concurrency: number = 7, max_files: number | null = null) {
    let keys = [];
    let dirs = [];
    let next_token: any = '';

    if (!fs.existsSync(dst)) {
      throw new Error(`destination dir ${dst} does not exist.`);
    }

    while (next_token !== undefined) {
      let response = await this.getFiles2(key, next_token);
      let contents = response.Contents;
      if (contents) {
        for (let c of contents) {
          let k: string = c.Key || '';
          if (k) {
            if (k.slice(-1) != '/') {
              keys.push(k);
              // stop after max_files was reached
              if (max_files && keys.length >= max_files) {
                break;
              }
            } else {
              dirs.push(k);
            }
          }
        }
      }
      next_token = response.NextContinuationToken;
    }

    for (let d of dirs) {
      let dirpath = path.join(dst, d);
      if (!fs.existsSync(dirpath)) {
        fs.mkdirSync(dirpath, {recursive: true});
      }
    }

    let chunk = [];

    for (let k of keys) {
      let pathname = path.join(dst, k);
      let dirname = path.dirname(pathname);
      if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, {recursive: true});
      }
      chunk.push(this.storeFile(k, dirname));
      if (chunk.length >= concurrency) {
        await Promise.all(chunk);
        chunk = [];
      }
    }

    // drain the last elements when loop ends
    if (chunk.length > 0) {
      await Promise.all(chunk);
    }

    return path.join(dst, key);
  }

  /**
   * Download a complete s3 directory with the aws cli
   *
   * @param key path to the directory in question
   * @param destination where to store the results locally
   */
  public async storeDirAwsCli(key: string, destination: string) {
    if (!key.startsWith('/')) {
      this.logger.error(`key must start with a /`);
      return;
    }

    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, {recursive: true});
    }

    let t0 = new Date();

    await system(`aws configure set aws_access_key_id ${this.aws_config.AWS_ACCESS_KEY}`);
    await system(`aws configure set aws_secret_access_key ${this.aws_config.AWS_SECRET_KEY}`);
    let output = await system(`aws s3 sync s3://${this.aws_config.AWS_BUCKET}${key} ${destination} --only-show-errors`);
    if (output && output.stderr) {
      this.logger.error(output.stderr);
    }

    let t1 = new Date();
    let elapsed = t1.valueOf() - t0.valueOf();

    this.logger.verbose(`Downloaded key ${key} from region ${this.aws_config.AWS_REGION} recursively in ${elapsed}ms`);
  }

  /**
   * List all keys under a certain path
   * Taken and modded from: https://menno.io/posts/listing-s3-objects-with-nodejs/
   */
  public async allKeys(prefix: string) {
    const params: any = {
      Bucket: this.bucket,
      Prefix: prefix
    };

    let keys: Array<any> = [];
    for (;;) {
      let data: any = await this.client.listObjects(params).promise();

      data.Contents.forEach((elem: any) => {
        keys = keys.concat(elem.Key);
      });

      if (!data.IsTruncated) {
        break;
      }
      params.Marker = data.NextMarker;
    }

    return keys;
  }

  private getFiles2(prefix: string, ContinuationToken: string): Promise<AWS.S3.Types.ListObjectsV2Output> {
    return new Promise((resolve, reject) => {
      let params: AWS.S3.Types.ListObjectsV2Request = {
        Bucket: this.bucket,
        Prefix: prefix  // Can be your folder name
      };

      if (ContinuationToken) {
        params.ContinuationToken = ContinuationToken;
      }

      this.client.listObjectsV2(params, function (err, data) {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }

  public getFiles(prefix: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const params = {
        Bucket: this.bucket,
        Prefix: prefix
      };

      this.client.listObjects(params, function (err, data) {
        if (err) {
          console.error('There was an error getting your files: ' + err);
          reject(err);
          return;
        }
        resolve(data);
      });
    });
  }

  public async deleteFile(key: string) {
    return new Promise((resolve, reject) => {
      const params = {
        Bucket: this.bucket,
        Key: key,
      };

      this.client.deleteObject(params, (err, data) => {
        if (err) {
          reject('There was an error deleting your file: ' + err.message);
        }
        resolve('Successfully deleted file.');
      });
    });
  }
}
