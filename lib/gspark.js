let fs = require('fs');
let path = require('path');
let archiver = require('archiver');
let AWS = require('aws-sdk');
let _ = require('lodash');
let minimist = require('minimist');

let argv = minimist(process.argv.slice(2));

if (argv._[0] === 'init') {
  let template = {
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
  console.log('gspark -c [config file] [-p [zip file prefix]] [-f [files (comma separated)]]');
  console.log('If you do not specify the files section in the config file, ');
  console.log('you must provide the files via the -f flag')
  process.exit();
}

if (!argv.c) {
  usage();
}
let config = JSON.parse(fs.readFileSync(argv.c));
let files = [];

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
let s3Stream = require('s3-upload-stream')(new AWS.S3());

let archive = archiver('zip');

let archiveKey = config.key;
if (!archiveKey) {
  archiveKey = String(Date.now()) + '.zip';
  if (argv.p) {
    archiveKey = argv.p + archiveKey;
  }
}

let upload = s3Stream.upload({
  Bucket: config.bucket,
  Key: archiveKey,
  ServerSideEncryption: 'AES256',
  ACL: 'private'
});

// Use a promise that resolves when the stream emits an end event
const getStreamEndPromise = (stream) => {
  return new Promise((resolve, reject) => {
    stream.on('end', resolve);
    stream.on('error', reject);
  });
}

const archiveAndUpload = async () => {

  const streamPromises = [];

  let i, file, filePath, name, stream;
  for (i = 0; i < files.length; i++) {
    file = files[i];
    name = path.basename(file);
    stream = fs.createReadStream(file);

    streamPromises.push(getStreamEndPromise(stream));

    archive.append(stream, {
      name: name
    });
  }
    
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

  await Promise.all(streamPromises)
  
  archive.pipe(upload);
  archive.finalize();
}

archiveAndUpload()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
