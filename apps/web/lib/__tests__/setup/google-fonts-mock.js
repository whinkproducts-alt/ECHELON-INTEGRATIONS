/**
 * Mocked Google Fonts CSS responses for CI / offline builds.
 * Used via NEXT_FONT_GOOGLE_MOCKED_RESPONSES env var.
 * Each key is the exact Google Fonts URL Next.js requests.
 * Values are minimal valid @font-face CSS — enough for the build to
 * generate its CSS modules without hitting the network.
 */

const fontFace = (family, wght, file) => `
/* latin */
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${wght};
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/${file}.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
`.trim();

module.exports = {
  // DM Sans is a variable font with wght axis 100–1000
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@100..1000&display=swap':
    fontFace('DM Sans', '100 1000', 'dmsans/v15/tFdmypkZpUrFoJJcPNoJIw'),

  // Plus Jakarta Sans variable font wght 200–800
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200..800&display=swap':
    fontFace('Plus Jakarta Sans', '200 800', 'plusjakartasans/v8/LDIoaomQNQcsA88c7O9yZ4KMCoOg4Ko'),

  // JetBrains Mono variable font wght 100–800
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@100..800&display=swap':
    fontFace('JetBrains Mono', '100 800', 'jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxP'),
};
