/** Each piece stays under the request-body cap of the public host. */
export const FILM_CHUNK_BYTES = 3 * 1024 * 1024;

/** A few minutes of phone video. The file host allows more; saving has to finish in one request. */
export const FILM_MAX_BYTES = 200 * 1024 * 1024;

/** A banner GIF is stored as the file that was chosen, so this is a size cap, not a quality cut. */
export const GIF_MAX_BYTES = 80 * 1024 * 1024;
