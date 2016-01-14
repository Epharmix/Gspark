var fs = require('fs');
var path = require('path');
var archiver = require('archiver');
var AWS = require('aws-sdk');
var _ = require('lodash');
var minimist = require('minimist');

var argv = minimist(process.argv.slice(2));

function usage() {
  console.log('Usage');
  console.log('gspark -c [config file]');
  process.exit();
}

if (!argv.c) {
  usage();
}

var config = JSON.parse(fs.readFileSync(argv.c));

AWS.config.update(config.aws);
var s3Stream = require('s3-upload-stream')(new AWS.S3());

var archive = archiver('zip');
var i, file, filePath, name, stream;
var files = [];
for (i = 0;i < config.files.length;i++) {
  file = config.files[i];
  name = path.basename(file);
  filePath = path.join(config.cwd, file);
  files.push(filePath);
  stream = fs.createReadStream(filePath);
  archive.append(stream, {
    name: name
  });
}

var fileKey = config.key;
if (!fileKey) {
  fileKey = String(Date.now()) + '.zip';
}

var upload = s3Stream.upload({
  Bucket: config.bucket,
  Key: fileKey,
  ServerSideEncryption: 'AES256',
  ACL: 'private'
});

upload.on('error', function(err) {
  console.log(err);
  console.log(err.stack);
  process.exit();
});

upload.on('uploaded', function(result) {
  console.log('Upload completed!');
  if (config.erase) {
    console.log('Erasing files...');
    for (var filePath in files) {
      fs.unlinkSync(filePath);
    }
    console.log('Files erased!');
  }
  process.exit();
});

archive.on('error', function(err) {
  console.log(err);
  console.log(err.stack);
  process.exit();
});

archive.pipe(upload);
archive.finish();
