import {v5} from 'uuid';
import {uuidv7} from 'uuidv7';
export const MEDIID_MIGRATION_NAMESPACE='57c0c744-9cdc-41f9-a532-7e60be63d87f';
export function mongoObjectIdToUuid(objectId: string): string {
 if(!/^[0-9a-f]{24}$/.test(objectId))throw new Error('Expected the canonical lowercase MongoDB ObjectId.');
 return v5(objectId,MEDIID_MIGRATION_NAMESPACE);
}
export function newPostgresId(): string {return uuidv7();}
