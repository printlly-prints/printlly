export const successfulDocuments = items => items.filter(item => item.status === "uploaded" && item.doc?.upload_id).map(item => item.doc);
export const retryableFiles = items => items.filter(item => item.status === "failed" && item.asset);
// Replace only the addressed file, preserving successful sibling uploads and
// their server identities when another file fails or is retried.
export const patchUploadItem = (items, id, changes) => items.map(item => item.id === id ? { ...item, ...changes } : item);
