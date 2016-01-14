var fs = require('fs');
var path = require('path');
var archiver = require('archiver');
var AWS = require('aws-sdk');
var _ = require('lodash');
var minimist = require('minimist');

var argv = minimist(process.argv.slice(2));

if (argv._[0] === 'init') {
  var template = {
    aws: {
      accessKeyId: '',
      secretAccessKey: '',
      region: ''
    },
    bucket: '',
    cwd: '',
    erase: false,
    files: []
  };
  fs.writeFileSync('task.json', JSON.stringify(template, null, 2));
  process.exit();
} 

function usage() {
  console.log('Usage');
  console.log('gspark -c [config file] [-f [files (comma separated)]]');
  console.log('If you do not specify the files section in the config file, ');
  console.log('you must provide the files via the -f flag')
  process.exit();
}

if (!argv.c) {
  usage();
}
var config = JSON.parse(fs.readFileSync(argv.c));
var files = [];

if (argv.f) {
  files = argv.f.split(',')
} else {
  if (config.files.length === 0) {
    console.log('No files specified, exiting...');
    process.exit();
  } else {
    files = _.map(config.files, function(file) {
      return path.join(config.cwd, file);
    });
  }
}

AWS.config.update(config.aws);
var s3Stream = require('s3-upload-stream')(new AWS.S3());

var archive = archiver('zip');
var i, file, filePath, name, stream;
for (i = 0;i < files.length;i++) {
  file = files[i];
  name = path.basename(file);
  stream = fs.createReadStream(file);
  archive.append(stream, {
    name: name
  });
}

var archiveKey = config.key;
if (!archiveKey) {
  archiveKey = String(Date.now()) + '.zip';
}

var upload = s3Stream.upload({
  Bucket: config.bucket,
  Key: archiveKey,
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
    for (i in files) {
      fs.unlinkSync(files[i]);
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
archive.finalize();
