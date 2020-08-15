import fs from 'fs';
import path from 'path';
import * as os from 'os';
import glob from 'glob';
import detectNewline from 'detect-newline';

export function getVersionInfo(pjson: any): any {
  let version_info: any = {
    package_info: {}
  };

  const interesting_properties: any = ['name', 'version', 'description', 'dependencies'];
  for (let key of interesting_properties) {
    if (pjson[key]) {
      version_info.package_info[key] = pjson[key];
    }
  }

  version_info.platform = {
    hostname: os.hostname(),
    type: os.type(),
    release: os.release(),
    platform: os.platform(),
    totalmem: os.totalmem(),
    freemem: os.freemem(),
    uptime: os.uptime(),
    env: process.env,
  };

  return version_info;
}

export function randomElement(array: Array<any>): any {
  return array[Math.floor(Math.random() * array.length)];
}

export function createTempDir(slug: string = 'userDataDir-'): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.mkdtemp(path.join(os.tmpdir(), slug), (err, folder) => {
      if (err) {
        reject(err);
      } else {
        resolve(folder);
      }
    });
  });
}

export async function chunkRead(path: string, callback: any, chunk_size=5242880) {
  let offset = 0;
  // read files in chunks of 5MB
  let chunk_buffer = Buffer.alloc(chunk_size);
  let fp = fs.openSync(path, 'r');
  let bytes_read = 0;
  let num_processed = 0;

  while (true) {
    bytes_read = fs.readSync(fp, chunk_buffer, 0, chunk_size, offset);
    if (bytes_read <= 0) {
      break;
    }
    offset += bytes_read;
    let str = chunk_buffer.slice(0, bytes_read).toString();
    let newline_char = detectNewline(str) || os.EOL;
    let arr: Array<string> = str.split(newline_char);
    for (let i = 0; i < arr.length; i++) {
      arr[i] = arr[i].trim();
    }

    if (bytes_read = chunk_size) {
      // the last item of the arr may be not a full line, leave it to the next chunk
      if (Array.isArray(arr) && arr.length > 0) {
        let last = arr.pop();
        if (last) {
          offset -= last.length;
        }
      }
    }

    if (arr.length <= 0) {
      break;
    }

    try {
      num_processed += await callback(arr);
      console.log(`num items processed = ${num_processed}`);
    } catch(err) {
      console.error(err.toString());
      break;
    }
  }

  return num_processed;
}

export function formatBytes(bytes: number, decimals: number = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Convert milliseconds to days/hours/minutes/seconds
 *
 * @param milliseconds
 */
export function timeFormat(milliseconds: number) {
  let day: number, hour: number, minute: number, seconds: number;
  seconds = Math.floor(milliseconds / 1000);
  minute = Math.floor(seconds / 60);
  seconds = seconds % 60;
  hour = Math.floor(minute / 60);
  minute = minute % 60;
  day = Math.floor(hour / 24);
  hour = hour % 24;
  return {
    day: day,
    hour: hour,
    minute: minute,
    seconds: seconds
  };
}

/**
 * Source: https://stackoverflow.com/questions/18052762/remove-directory-which-is-not-empty
 *
 * @param path_to_dir
 */
export function deleteFolderRecursive(path_to_dir: string) {
  if (!path_to_dir.startsWith('/tmp')) {
    return;
  }

  if (fs.existsSync(path_to_dir)) {
    fs.readdirSync(path_to_dir).forEach((file: string, index: any) => {
      const curPath = path.join(path_to_dir, file);
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path_to_dir);
  }
}

export function getFiles(pattern: string): Promise<Array<any>> {
  return new Promise((resolve, reject) => {
    glob(pattern, {}, (err: any, files: any) => {
      if (err) {
        reject(err);
      }
      resolve(files)
    })
  });
}

export function walk(dir: string, fileList: Array<string> = []) {
  const files = fs.readdirSync(dir);

  files.forEach((file: string) => {
    const filePath = path.join(dir, file);
    const fileStat = fs.lstatSync(filePath);

    if (fileStat.isDirectory()) {
      walk(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });

  return fileList;
}

export function chunk(arr: Array<any>, len: number) {
  let chunks = [],
    i = 0,
    n = arr.length;

  while (i < n) {
    chunks.push(arr.slice(i, i += len));
  }

  return chunks;
}

export const getRandomInt = () => {
  return Math.floor(Math.random() * 1_000_000_000_000);
};

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
