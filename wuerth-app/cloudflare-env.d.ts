declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    BOOTSTRAP_CATALOG_JSON?: string;
    LEGACY_GROUPS_JSON?: string;
  }
}
