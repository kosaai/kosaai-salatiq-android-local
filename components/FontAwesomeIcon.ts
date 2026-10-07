import createIconSet from '@expo/vector-icons/createIconSet';
import FontAwesome from '@expo/vector-icons/FontAwesome';

/**
 * Font Awesome icons rendered from a font file inside the app's own assets.
 *
 * `@expo/vector-icons` resolves its bundled font to `/assets/node_modules/...`
 * in a web export, and Cloudflare Pages never publishes paths containing
 * `node_modules`, so those requests fall back to index.html and every glyph
 * renders as an empty box. Shipping the same Font Awesome font from
 * `assets/fonts/` keeps the URL under a published path on web, while iOS and
 * Android keep loading it as a normal bundled asset.
 */
export const FontAwesomeIcon = createIconSet(
  FontAwesome.glyphMap,
  'FontAwesome',
  require('../assets/fonts/FontAwesome.ttf'),
);
