'use strict';

const { v5 } = require('uuid');
const { uuidv7 } = require('uuidv7');

const MEDIID_MIGRATION_NAMESPACE = '57c0c744-9cdc-41f9-a532-7e60be63d87f';

function mongoObjectIdToUuid(objectId) {
  if (typeof objectId !== 'string' || !/^[0-9a-f]{24}$/.test(objectId)) {
    throw new Error('Expected the canonical lowercase MongoDB ObjectId.');
  }
  return v5(objectId, MEDIID_MIGRATION_NAMESPACE);
}

function newPostgresId() {
  return uuidv7();
}

module.exports = { MEDIID_MIGRATION_NAMESPACE, mongoObjectIdToUuid, newPostgresId };
