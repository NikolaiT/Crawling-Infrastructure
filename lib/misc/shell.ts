import { exec } from 'child_process';

export function system(command: string): Promise<any> {
  return new Promise((resolve, reject) => {
    exec(command, (err, stdout, stderr) => {
      if (err) {
        reject(err);
      } else {
        // maybe we need the stderr at some point
        resolve({
          stdout: stdout,
          stderr: stderr
        });
      }
    });
  });
}