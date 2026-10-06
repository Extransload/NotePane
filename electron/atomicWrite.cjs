const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

// On Windows an antivirus scanner, indexer or sync client can hold a file open
// for a moment, and a rename onto it then fails with one of these codes.
const RETRYABLE_RENAME_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);
const RENAME_RETRY_DELAYS_MS = Object.freeze([10, 30, 90]);

const sleepCell = new Int32Array(new SharedArrayBuffer(4));

function sleepSync(milliseconds) {
  Atomics.wait(sleepCell, 0, 0, milliseconds);
}

function renameWithRetry(fromPath, toPath) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      fs.renameSync(fromPath, toPath);
      return;
    } catch (error) {
      const delay = RENAME_RETRY_DELAYS_MS[attempt];
      if (!RETRYABLE_RENAME_CODES.has(error?.code) || delay === undefined) {
        throw error;
      }
      sleepSync(delay);
    }
  }
}

// Writes data to a sibling temporary file, flushes it to disk, then renames it
// over filePath, so a crash or power loss leaves either the old or the new file.
function writeFileAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const descriptor = fs.openSync(temporaryPath, "w");
    try {
      fs.writeFileSync(descriptor, data);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    renameWithRetry(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }
  }
}

module.exports = {
  writeFileAtomic,
};
