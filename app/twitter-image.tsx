// Twitter Cards read a dedicated twitter-image file rather than falling
// back to opengraph-image.tsx, so this re-exports the same generated image
// instead of duplicating it.
export { default, alt, size, contentType } from "./opengraph-image";
