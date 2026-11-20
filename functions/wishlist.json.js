import { serveFile } from "./_lib/data.js";
export const onRequestGet = (context) => serveFile(context, "wishlist");
