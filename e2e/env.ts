// E2E_PORT lets several runs coexist: each gets its own server, DB and uploads dir.
export const PORT = Number(process.env.E2E_PORT ?? 4399);
export const DB = `storage/e2e-${PORT}.db`;
/** UPLOAD_DIR of the e2e server (STORAGE_DRIVER=local). */
export const UPLOADS = `storage/e2e-uploads-${PORT}`;
