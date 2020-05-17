#!/usr/bin/env node

const execSync = require('child_process').execSync;
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const cheerio = require('cheerio');
var url = require('url');

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
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

(async () => {
    // all results should be downloaded. Merge and create JSON result file.
    let domain_counts = {};
    let files = await walk('/tmp/storage/');
    //console.log(`Downloaded ${files.length} files`);
    let obj = {};
    for (let path_to_file of files) {
      try {
        let item_id = path.basename(path_to_file);
        let contents = fs.readFileSync(path_to_file);
        let raw_html = zlib.inflateSync(contents).toString();
        const $ = cheerio.load(raw_html);

        $($('a')).each(function(i, link) {
          let link_text = $(link).text();
          let href = $(link).attr('href');
          if (href && href.trim()) {
            let q = url.parse(href.trim(), true);
            let domain = q.host;
            if (domain) {
              let top_level = domain.split('.').slice(-3).join('.');
              if (domain_counts[top_level] !== undefined) {
                domain_counts[top_level]++;
              } else {
                domain_counts[top_level] = 1;
              }
            }
          }
        });
      } catch (err) {
        console.error(err.toString());
      }
    }
    keysSorted = Object.keys(domain_counts).sort(function(a,b){return domain_counts[a]-domain_counts[b]});
    for (let i = 1; i <= 35; i++) {
      let key = keysSorted[keysSorted.length - i];
      console.log(key, domain_counts[key]);
    }
})();
