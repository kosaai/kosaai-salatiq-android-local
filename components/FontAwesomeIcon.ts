import { Platform } from 'react-native';
import createIconSet from '@expo/vector-icons/createIconSet';
import glyphMap from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/FontAwesome6Free.json';

/**
 * Font Awesome (Solid style) icons rendered from a font file inside the app's
 * own assets, so they work on the published web build.
 *
 * `@expo/vector-icons` resolves its bundled fonts to `/assets/node_modules/...`
 * in a web export, and Cloudflare Pages never publishes paths containing
 * `node_modules`, so those requests fall back to index.html and every glyph
 * renders as an empty box. Shipping the very same Font Awesome font from
 * `assets/fonts/` keeps the URL under a published path on web, while iOS and
 * Android keep loading it as a normal bundled asset.
 *
 * The font we ship is `FontAwesome6_Solid.ttf`, so only glyphs included in the
 * Solid style may be used here (`sun`, `moon` and `video-slash` are Solid);
 * requesting a Regular-only glyph would render nothing.
 */
export const FontAwesomeIcon = createIconSet(
  glyphMap,
  'FontAwesome6Free-Solid',
  require('../assets/fonts/FontAwesome6_Solid.ttf'),
  Platform.select({ ios: { fontWeight: '700' }, default: {} }),
);
